"""DSA analysis pipeline module"""

import os
import re
import sys
import pandas as pd
import numpy as np
from itertools import combinations
from numba import jit
from decimal import Decimal, ROUND_HALF_UP
from .fetch import UniprotData, CifData, convert_three, downloadpdb


def trim_sequence(sequencedata, seq_ratio=80):
    """座標データが存在しているアミノ酸残基の数がuniprotの配列長に対する割合（seq_ratio）以下であれば、削除する"""
    sequencedata.dropna(subset=sequencedata.columns[0], inplace=True)
    seqlen = len(sequencedata)
    delchain = [
        chain
        for chain, item in sequencedata.items()
        if 100 - (item.isnull().sum() / seqlen * 100) < seq_ratio
    ]
    seqdata = sequencedata.drop(columns=delchain)
    seqdata.dropna(inplace=True)
    return seqdata


def _diff(uniprotid, df1, df2, shift=0):
    """配列の一致度を確認"""
    diff = pd.concat([df1, df2.shift(shift)], axis=1)
    diff.dropna(inplace=True)
    diff.drop_duplicates(subset=uniprotid, ignore_index=True, inplace=True)
    return (diff.iloc[:, 0] == diff.iloc[:, 1]).sum()


def trim2_sequence(sequencedata, seq_ratio=80):
    """seq_id重複の場合、最初だけを残して、残りは削除する"""
    seq = sequencedata.iloc[:, 1:].map(
        lambda x: int(x.split(", ")[1]) if isinstance(x, str) else x
    )
    duplicate_indices = set()
    for column in seq.columns:
        duplicates = seq[column].duplicated(keep="first")
        duplicate_indices.update(seq[duplicates].index)
    duplicate_indices = sorted(list(duplicate_indices))
    trim2_seq = sequencedata.drop(index=duplicate_indices)
    return trim2_seq


def sort_sequence(uniprotid, sequencedata, seq_ratio):
    """チェック機構"""
    seq = sequencedata.map(lambda x: x.split(", ")[0] if isinstance(x, str) else x)
    trimdata = trim_sequence(seq, seq_ratio)
    trimdata.drop_duplicates(subset=uniprotid, ignore_index=True, inplace=True)
    trimdata.reset_index(inplace=True, drop=True)
    trimdata = trimdata.T
    columns = trimdata.columns
    IDs = []
    for col in columns:
        diff = trimdata[trimdata[col] != trimdata.at[uniprotid, col]].index
        if len(diff) != 0:
            IDs.extend(diff)
            trimdata.drop(diff, inplace=True)
    uniseq = seq[uniprotid]
    for ID in IDs:
        difseq = seq[ID]
        unique = _diff(uniprotid, uniseq, difseq)
        if unique > 10:
            continue
        num = 1
        unique = 0
        while unique < 10 and num < 100:
            unique = _diff(uniprotid, uniseq, difseq, num)
            num = (-num) + 1 if num < 0 else -num
        if unique > 10:
            diff = sequencedata[ID].shift((-num) + 1 if num > 0 else -num)
            loc = sequencedata.columns.get_loc(ID)
            sequencedata.drop(ID, axis=1, inplace=True)
            sequencedata.insert(loc, ID, diff)
        else:
            print(
                f"{ID} is not used due to sequence alignment failure", file=sys.stderr
            )
            loc = sequencedata.columns.get_loc(ID)
            sequencedata.drop(ID, axis=1, inplace=True)
    sorted_seqdata = trim_sequence(sequencedata, seq_ratio)
    uniq_sorted_seqdata = trim2_sequence(sorted_seqdata)
    return uniq_sorted_seqdata


def getcoord(trimsequence, atom_coord_dir="atom_coord/"):
    """座標取得"""
    import os

    atomcoord = pd.DataFrame(trimsequence.iloc[:, 0])
    atomindex = atomcoord.index.tolist()
    trimseq = trimsequence.iloc[:, 1:].map(
        lambda x: int(x.split(", ")[1]) if isinstance(x, str) else x
    )
    columns = trimseq.columns.tolist()
    pdbids = {}
    for col in columns:
        pdbid, strand_id = col.split(" ")
        pdbids.setdefault(pdbid, []).append(strand_id)

    for pdbid, chain_id in pdbids.items():
        csv_path = os.path.join(atom_coord_dir, f"{pdbid}.csv")
        struct = pd.read_csv(csv_path)
        struct["asym_id"] = struct["asym_id"].astype(str)
        struct = struct[struct["atom_id"] == "CA"]
        struct.drop(columns=["model_num", "atom_id"], inplace=True)
        for chain in chain_id:
            seq_num = trimseq[pdbid + " " + chain]
            seq_num.index = seq_num.tolist()
            chaindata = struct[struct["asym_id"] == chain]
            chaindata.index = chaindata["seq_id"].tolist()
            if chaindata["seq_id"].duplicated().any():
                chaindata = chaindata.drop_duplicates(subset="seq_id", keep="first")
            coord = chaindata[["comp_id", "Cartn_x", "Cartn_y", "Cartn_z"]].filter(
                items=seq_num.tolist(), axis=0
            )
            coord = pd.concat([seq_num, coord], axis=1)
            coord.drop(columns=pdbid + " " + chain, inplace=True)
            coord.rename(columns={"comp_id": pdbid + " " + chain}, inplace=True)
            coord.index = atomindex
            atomcoord = pd.concat([atomcoord, coord], axis=1)
    atomcoord.dropna(inplace=True)
    return atomcoord


@jit(nopython=True)
def calculat(atom1, atom2):
    """距離計算（11桁まで正確）"""
    xyz = atom1 - atom2
    xyz = np.rint(xyz * 1000)
    dis = np.sqrt(np.sum(xyz**2))
    return dis / 1000


def getdistance2(atomcoord):
    """距離計算"""
    id = atomcoord.iloc[:, 0].name
    cols = atomcoord.iloc[:, 1::4].columns.tolist()
    distance = pd.DataFrame(
        {
            id: [
                str(int(a) + 1) + ", " + str(int(b) + 1)
                for a, b in combinations(map(str, atomcoord.index), 2)
            ],
            "residue pair": [
                resi0 + ", " + resi1 for resi0, resi1 in combinations(atomcoord[id], 2)
            ],
            **{col: np.nan for col in cols},
        }
    )
    combination = list(combinations(range(len(atomcoord)), 2))
    for i, col in enumerate(cols):
        i = (i * 4) + 2
        atoms = atomcoord.iloc[:, i : i + 3].to_numpy()
        distance[col] = [calculat(atoms[n1], atoms[n2]) for n1, n2 in combination]
    return distance


def getscore(distance, ddof=0):
    """DSAスコア計算（ddof=0: 母数標準偏差）"""
    dis = distance.iloc[:, 2:]
    means = dis.mean(axis="columns")
    stds = dis.std(axis="columns", ddof=0)
    stds = stds.map(lambda x: 0.0001 if x == 0 else x)
    column0 = distance.columns[0]
    return pd.DataFrame(
        {
            column0: distance[column0],
            "residue pair": distance["residue pair"],
            "distance mean": means,
            "distance std": stds,
            "score": means / stds,
        }
    )


def count_pdb(uniprotid, method="X-ray", negative_pdbid=""):
    """PDB数をカウント"""
    unidata = UniprotData(uniprotid)
    pdblist = unidata.pdblist(method)
    if negative_pdbid != "":
        negative_list = re.split(r"[,\s]+", negative_pdbid.strip())
        negative_list_upper = [neg.upper() for neg in negative_list]
        pdblist = [item for item in pdblist if item.upper() not in negative_list_upper]
    return len(pdblist) >= 1


def prep(
    uniprotid,
    method="X-ray",
    negative_pdbid="",
    pdb_dir="pdb_files/",
    atom_coord_dir="atom_coord/",
    verbose=False,
):
    """データ準備"""
    unidata = UniprotData(uniprotid)
    uniprotids = unidata.get_id()
    id = str(uniprotids)
    fasta = unidata.fasta()
    sequence = convert_three(fasta)
    seqdata = pd.DataFrame(sequence, columns=[id])
    len_seqdata = len(seqdata)
    pdblist = unidata.pdblist(method)

    if negative_pdbid != "":
        negative_list = re.split(r"[,\s]+", negative_pdbid.strip())
        negative_list_upper = [neg.upper() for neg in negative_list]
        pdblist = [item for item in pdblist if item.upper() not in negative_list_upper]

    if verbose:
        print(f"  Processing {len(pdblist)} PDB entries ...", file=sys.stderr)

    nor_pdblist = []
    sub_pdblist = []
    chi_pdblist = []
    din_pdblist = []

    for n, pdbid in enumerate(pdblist):
        cifdata = CifData(pdbid, pdb_dir, atom_coord_dir)
        mut_judge = cifdata.mutationjudge(uniprotids, pdbid, verbose)
        if verbose:
            print(
                f" ({n+1}/{len(pdblist)}) judge: {pdbid} {mut_judge}", file=sys.stderr
            )

        if mut_judge == "normal":
            nor_pdblist.append(pdbid)
        elif mut_judge == "substitution":
            sub_pdblist.append(pdbid)
        elif mut_judge == "chimera":
            chi_pdblist.append(pdbid)
        elif mut_judge == "delins":
            din_pdblist.append(pdbid)
        else:
            continue

        beg, end = unidata.position(pdbid)
        df_beg = pd.DataFrame(index=list(range(beg - 1)))
        df_end = pd.DataFrame(index=list(range(len_seqdata - end)))
        seq = cifdata.getsequence(uniprotids)
        seq = pd.concat([df_beg, seq, df_end])
        seq.reset_index(inplace=True, drop=True)
        seqdata = pd.concat([seqdata, seq], axis=1)

    all_pdblist = [nor_pdblist, sub_pdblist, chi_pdblist, din_pdblist]
    if verbose:
        total = (
            len(nor_pdblist) + len(sub_pdblist) + len(chi_pdblist) + len(din_pdblist)
        )
        print(
            f" Data Preparation Finished: {total}/{len(pdblist)} PDB entries, "
            f"{len(seqdata.columns)-1} chains as {uniprotid}",
            file=sys.stderr,
        )
        print(
            f" (Normal PDB: {len(nor_pdblist)}, Substitution PDB: {len(sub_pdblist)}, "
            f"Chimera PDB: {len(chi_pdblist)}, DelIns PDB: {len(din_pdblist)})",
            file=sys.stderr,
        )

    return seqdata, all_pdblist


def run_DSA(
    uniprotid,
    seqdata,
    seq_ratio,
    method="X-ray",
    negative_pdbid="",
    pdb_dir="pdb_files/",
    atom_coord_dir="atom_coord/",
    chain_threshold=3,
    cis_threshold=3.3,
    proc_cis=True,
    verbose=False,
):
    """DSA解析実行"""
    unidata = UniprotData(uniprotid)
    uniprotids = unidata.get_id()
    str_ids = str(uniprotids)
    fasta = unidata.fasta()
    sequence = convert_three(fasta)
    pdblist = unidata.pdblist(method)

    if negative_pdbid != "":
        negative_list = re.split(r"[,\s]+", negative_pdbid.strip())
        negative_list_upper = [neg.upper() for neg in negative_list]
        pdblist = [item for item in pdblist if item.upper() not in negative_list_upper]

    trimsequence = sort_sequence(str_ids, seqdata, seq_ratio)
    trimseqcol = trimsequence.columns.values[1:]

    if len(trimseqcol) > chain_threshold - 1:
        atomcoord = getcoord(trimsequence, atom_coord_dir)
        distance = getdistance2(atomcoord)
        score = getscore(distance, 0)

        # 統計情報の計算
        log_data = {
            "uniprot_id": uniprotid,
            "entries": len(set([i.split(" ")[0] for i in trimseqcol])),
            "chains": len(trimseqcol),
            "length": len(trimsequence),
            "length_percent": round((len(trimsequence) * 100 / len(sequence)), 1),
            "umf": round((score["distance mean"] / score["distance std"]).mean(), 1),
        }

        # 分解能の計算
        pdbids = [i.split(" ")[0] for i in trimseqcol]
        reso_list = []
        for pdbid in set(pdbids):
            reso = unidata.pdbdata.at["resolution", pdbid]
            reso = "".join(char for char in reso if char.isdigit() or char == ".")
            if reso:
                reso_list.append(float(reso))
        if reso_list:
            reso_ave = Decimal(str(np.mean(reso_list))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            log_data["resolution"] = float(reso_ave)
        else:
            log_data["resolution"] = None

        # Cis解析（Notebookのロジックをそのまま移植）
        cis_info = None
        cis_pair_list = []
        if proc_cis:
            cis_index = []
            for col in distance.columns.values.tolist()[2:]:
                tmp = distance.query(f"`{col}`<=@cis_threshold").index.tolist()
                cis_index.extend(tmp)

            if not cis_index:
                cis_info = {
                    "cis_dist_mean": 0.0,
                    "cis_dist_std": 0.0,
                    "cis_score_mean": 0.0,
                    "cis_num": 0,
                    "mix": 0,
                }
            else:
                cis_index = sorted(set(cis_index))
                cis_dist = distance.iloc[cis_index, :]

                # 条件を満たす要素の数をカウント
                cis_cnt = cis_dist.iloc[:, 2:].apply(
                    lambda row: (row <= cis_threshold).sum(), axis=1
                )
                trans_cnt = cis_dist.iloc[:, 2:].apply(
                    lambda row: (row > cis_threshold).sum(), axis=1
                )
                cnt = pd.DataFrame({"cis_cnt": cis_cnt, "trans_cnt": trans_cnt})

                # trans_cnt が 0 の行のみを抽出
                all_cis_dist = cis_dist[(cnt["trans_cnt"] == 0)]

                mix = ((cnt["cis_cnt"] >= 1) & (cnt["trans_cnt"] >= 1)).sum()
                cis_score = getscore(cis_dist, 0)  # getscore_cisと同じ
                cis_dist = pd.concat([cis_dist, cis_score.iloc[:, 2:]], axis=1)
                cis_dist = pd.concat([cis_dist, cnt], axis=1)

                cis_dist_mean = cis_dist["distance mean"].mean()
                if len(cis_dist["distance mean"]) == 1:
                    cis_dist_std = 0.00
                else:
                    cis_dist_std = cis_dist["distance mean"].std()
                cis_score_mean = cis_dist["score"].mean()
                cis_num = len(all_cis_dist)

                cis_info = {
                    "cis_dist_mean": round(float(cis_dist_mean), 2),
                    "cis_dist_std": round(float(cis_dist_std), 2),
                    "cis_score_mean": round(float(cis_score_mean), 2),
                    "cis_num": int(cis_num),
                    "mix": int(mix),
                    "threshold": float(cis_threshold),
                }

                # Cisペアリスト（最初の20個）
                if cis_num > 0:
                    cis_pairs = all_cis_dist.iloc[:, 0].tolist()
                    cis_pair_list = cis_pairs[:20]  # 最初の20個
                    cis_info["cis_pair_list"] = cis_pair_list
                    cis_info["cis_pair_total"] = len(cis_pairs)

        # 使用PDB IDリスト
        log_data["pdb_ids"] = sorted(list(set(pdbids)))

        # Cis情報を追加
        if cis_info:
            log_data["cis_analysis"] = cis_info

        return score, log_data, distance
    else:
        return (
            pd.DataFrame(),
            {"uniprot_id": uniprotid, "error": "Less than 3 chains"},
            pd.DataFrame(),
        )
