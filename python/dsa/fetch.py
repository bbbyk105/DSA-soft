"""UniProt and PDB data fetching module"""

import os
import re
import gzip
import requests
from lxml import etree
import pandas as pd
from mimetypes import guess_type
from Bio.PDB import PDBList
from Bio.PDB.MMCIF2Dict import MMCIF2Dict


class UniprotData:
    """UniProt XMLデータにアクセスし、情報を取得"""

    def __init__(self, uniprot_id: str):
        url = f"https://www.uniprot.org/uniprot/{uniprot_id}.xml"
        response = requests.get(url)
        response.raise_for_status()
        self.xml = etree.fromstring(response.content)
        self.nsmap = self.xml.nsmap
        TF = self.xml.find("./", self.nsmap).text
        if TF != "\n  ":
            raise KeyError(TF)

    def get_id(self):
        """UniProt ID取得"""
        return [
            accession.text
            for accession in self.xml.findall("./entry/accession", self.nsmap)
        ]

    def fasta(self) -> str:
        """FASTA 配列の取得"""
        return self.xml.find("./entry/sequence", self.nsmap).text

    def get_fullname(self):
        """fullName取得"""
        return self.xml.find("./entry/protein/*/fullName", self.nsmap).text

    def get_organism(self):
        """organism取得"""
        return self.xml.find(
            './entry/organism/name[@type="scientific"]', self.nsmap
        ).text

    def getpdbdata(self, method):
        """PDBID、method、resolutionの取得"""
        pdbid = []
        data = []
        for dbReference in self.xml.findall(
            './entry/dbReference[@type="PDB"]', self.nsmap
        ):
            x = []
            for propertys in dbReference:
                value = propertys.attrib["value"]
                x.append(value)
                if value == "NMR":
                    x.append(None)
            # methodが空文字列の場合は全てのメソッドを含める
            if method == "" or x[0] == method:
                pdbid.append(dbReference.attrib["id"])
                data.append(x)
        self.pdbdata = pd.DataFrame(
            data, index=pdbid, columns=["method", "resolution", "position"]
        ).T
        return self.pdbdata

    def pdblist(self, method=""):
        """PDBid取得"""
        try:
            return self.pdbdata.columns.tolist()
        except AttributeError:
            return self.getpdbdata(method).columns.tolist()

    def position(self, pdbid):
        """positionの取得"""
        positiondata = self.pdbdata.at["position", pdbid].split(", ")
        if len(positiondata) == 1:
            _, posi = positiondata[0].split("=")
            beg, end = posi.split("-")
            beg = int(beg)
            end = int(end)
        else:
            beg = []
            end = []
            for position in positiondata:
                _, posi = position.split("=")
                align_beg, align_end = posi.split("-")
                beg.append(int(align_beg))
                end.append(int(align_end))
            beg = min(beg)
            end = max(end)
        return beg, end


def convert_three(sequence):
    """1文字表記を3文字表記に変換"""
    dic = {
        "A": "ALA",
        "B": "D|N",
        "C": "CYS",
        "D": "ASP",
        "E": "GLU",
        "F": "PHE",
        "G": "GLY",
        "H": "HIS",
        "I": "ILE",
        "K": "LYS",
        "L": "LEU",
        "M": "MET",
        "N": "ASN",
        "O": "HYP",
        "P": "PRO",
        "Q": "GLN",
        "R": "ARG",
        "S": "SER",
        "T": "THR",
        "U": "SEC",
        "V": "VAL",
        "W": "TRP",
        "X": "any",
        "Y": "TYR",
        "Z": "E|Q",
    }
    return [dic[char] for char in sequence]


pdb_list = PDBList()


def downloadpdb(pdbid, pdb_dir="pdb_files/"):
    """Download PDB File"""
    if not os.path.exists(pdb_dir):
        os.makedirs(pdb_dir)
    pdb_list.retrieve_pdb_file(pdbid, pdir=pdb_dir, file_format="mmCif")


def _open(pdbid, pdb_dir="pdb_files/"):
    """PDBファイルを開く（gzip対応）"""
    file = pdbid.lower() + ".cif"
    ciffile = os.path.join(pdb_dir, file)
    if guess_type(file)[1] == "gzip":
        return gzip.open(ciffile, mode="rt")
    else:
        return open(ciffile, "r")


class CifData:
    """Cifファイルを解析し、配列情報を取得"""

    def __init__(self, pdbid, pdb_dir="pdb_files/", atom_coord_dir="atom_coord/"):
        self.pdbid = pdbid
        self.pdb_dir = pdb_dir
        self.atom_coord_dir = atom_coord_dir
        downloadpdb(self.pdbid, pdb_dir)
        with _open(self.pdbid, pdb_dir) as handle:
            mmcifdict = MMCIF2Dict(handle)

        self.struct_ref_seq = pd.DataFrame(
            {
                "strand_id": mmcifdict["_struct_ref_seq.pdbx_strand_id"],
                "accession": [
                    i.upper() for i in mmcifdict["_struct_ref_seq.pdbx_db_accession"]
                ],
                "seq_align_beg": mmcifdict["_struct_ref_seq.seq_align_beg"],
                "seq_align_end": mmcifdict["_struct_ref_seq.seq_align_end"],
            }
        )
        pdb_strand_id = mmcifdict["_pdbx_poly_seq_scheme.pdb_strand_id"]
        for i, struct_strand_id in enumerate(self.struct_ref_seq["strand_id"]):
            self.struct_ref_seq.at[i, "sort_index"] = pdb_strand_id.index(
                struct_strand_id
            )
        self.struct_ref_seq.sort_values("sort_index", inplace=True)

        try:
            self.struct_ref_seq_dif = pd.DataFrame(
                {
                    "strand_id": mmcifdict["_struct_ref_seq_dif.pdbx_pdb_strand_id"],
                    "seq_num": mmcifdict["_struct_ref_seq_dif.pdbx_auth_seq_num"],
                    "db_seq_num": mmcifdict["_struct_ref_seq_dif.pdbx_seq_db_seq_num"],
                    "details": [
                        i.lower() for i in mmcifdict["_struct_ref_seq_dif.details"]
                    ],
                }
            )
            self.struct_ref_seq_dif = self.struct_ref_seq_dif[
                self.struct_ref_seq_dif["details"] != "expression tag"
            ]
            self.struct_ref_seq_dif = self.struct_ref_seq_dif[
                self.struct_ref_seq_dif["details"] != "linker"
            ]
            self.struct_ref_seq_dif = self.struct_ref_seq_dif[
                self.struct_ref_seq_dif["details"] != "conflict"
            ]
            self.struct_ref_seq_dif = self.struct_ref_seq_dif[
                self.struct_ref_seq_dif["details"] != "microgeterogeneity"
            ]
        except KeyError:
            self.struct_ref_seq_dif = pd.DataFrame(
                {"strand_id": [], "seq_num": [], "db_seq_num": []}
            )

        self.chain = []
        self.chainid = []
        self.hetero_info = []
        self.ind = -1
        hetero_pdb_seq_num = ""
        for pdb_mon_id, pdb_seq_num, hetero, chainid in zip(
            mmcifdict["_pdbx_poly_seq_scheme.pdb_mon_id"],
            mmcifdict["_pdbx_poly_seq_scheme.pdb_seq_num"],
            mmcifdict["_pdbx_poly_seq_scheme.hetero"],
            mmcifdict["_pdbx_poly_seq_scheme.pdb_strand_id"],
        ):
            self.ind += 1
            if hetero == "n":
                hetero_pdb_seq_num = ""
                if pdb_mon_id != "?":
                    self.chain.append(pdb_mon_id + ", " + pdb_seq_num)
                    self.chainid.append(chainid)
                else:
                    self.chain.append(None)
                    self.chainid.append(chainid)
            else:
                if pdb_seq_num == hetero_pdb_seq_num:
                    self.hetero_info.append(self.ind)
                    continue
                else:
                    if pdb_mon_id != "?":
                        self.chain.append(pdb_mon_id + ", " + pdb_seq_num)
                        self.chainid.append(chainid)
                        hetero_pdb_seq_num = pdb_seq_num
                    else:
                        self.chain.append(None)
                        self.chainid.append(chainid)

        for j, strandid in enumerate(self.struct_ref_seq["strand_id"]):
            self.struct_ref_seq.at[j, "sort_index"] = self.chainid.index(strandid)

        atom_coord = pd.DataFrame(
            {
                "model_num": mmcifdict["_atom_site.pdbx_PDB_model_num"],
                "asym_id": mmcifdict["_atom_site.auth_asym_id"],
                "comp_id": mmcifdict["_atom_site.auth_comp_id"],
                "seq_id": mmcifdict["_atom_site.auth_seq_id"],
                "atom_id": mmcifdict["_atom_site.auth_atom_id"],
                "Cartn_x": mmcifdict["_atom_site.Cartn_x"],
                "Cartn_y": mmcifdict["_atom_site.Cartn_y"],
                "Cartn_z": mmcifdict["_atom_site.Cartn_z"],
                "alt_id": mmcifdict["_atom_site.label_alt_id"],
                "group_PDB": mmcifdict["_atom_site.group_PDB"],
                "ins_code": mmcifdict["_atom_site.pdbx_PDB_ins_code"],
            }
        )
        atom_coord["asym_id"] = atom_coord["asym_id"].astype(str)
        atom_coord["original_index"] = atom_coord.index
        alt_id_dot = atom_coord[atom_coord["alt_id"].str.contains(r"\.", na=False)]
        alt_id_not_dot = atom_coord[~atom_coord["alt_id"].str.contains(r"\.", na=False)]
        alt_id_not_dot_unique = alt_id_not_dot.drop_duplicates(
            subset=["seq_id", "atom_id"]
        )
        atom_coord = pd.concat([alt_id_dot, alt_id_not_dot_unique])
        atom_coord = atom_coord.sort_values("original_index")
        atom_coord = atom_coord.drop(columns=["original_index"])
        atom_coord = atom_coord[(atom_coord["group_PDB"] == "ATOM")].drop(
            columns=["alt_id", "group_PDB"]
        )

        if not os.path.exists(atom_coord_dir):
            os.makedirs(atom_coord_dir)
        atom_coord.to_csv(f"{atom_coord_dir}/{self.pdbid}.csv", index=False)

    def mutationjudge(self, uniprotids, pdbid, verbose=False):
        """変異判定"""
        m_pd = self.struct_ref_seq[["strand_id", "accession"]]
        unim_pd = m_pd[m_pd["accession"].isin(uniprotids)]
        if unim_pd["accession"].count() == 0:
            if verbose:
                print(
                    uniprotids, "not matched. UniProt ID(s) in this PDB is listed below"
                )
                exunim_pd = m_pd[m_pd["accession"] != (uniprotids and pdbid)]
                print(exunim_pd["accession"].unique())
            return "UniProt ID mismatch"
        else:
            if unim_pd.duplicated().sum() != 0:
                return "chimera"
            m_id = list(unim_pd["strand_id"])
            mdif_pd = self.struct_ref_seq_dif[
                self.struct_ref_seq_dif["strand_id"].isin(m_id)
            ]
            if len(mdif_pd) == 0:
                return "normal"
            else:
                mdif_pd_details = mdif_pd["details"].unique()
                if "engineered mutation" in mdif_pd_details:
                    if verbose:
                        print("engineered mutation")
                    return "substitution"
                elif "microheterogeneity" in mdif_pd_details:
                    if verbose:
                        print("microheterogeneity")
                    return "normal"
            s_list = list(m_pd["strand_id"])
            if len(s_list) != len(set(s_list)):
                return "chimera"
            for i in m_id:
                strand_mdif_pd = mdif_pd[mdif_pd["strand_id"] == i]
                seq_num_list = list(strand_mdif_pd["seq_num"])
                db_seq_num_list = list(strand_mdif_pd["db_seq_num"])
                if len(seq_num_list) != len(set(seq_num_list)):
                    return "delins"
                elif len(db_seq_num_list) != len(set(db_seq_num_list)):
                    return "delins"
            return "substitution"

    def getsequence(self, uniprotids):
        """配列取得"""
        firstLoop = True
        struct = self.struct_ref_seq[
            self.struct_ref_seq["accession"].isin(uniprotids)
        ].drop_duplicates(subset=["strand_id"])

        for row in struct.itertuples():
            if row.accession in uniprotids:
                sort_index = int(row.sort_index)
                align_beg = sort_index + int(row.seq_align_beg) - 1
                align_end = sort_index + int(row.seq_align_end)
                chain = self.chain[align_beg:align_end]
                mutat_info = self.struct_ref_seq_dif[
                    self.struct_ref_seq_dif["strand_id"] == row.strand_id
                ].drop(columns="strand_id")

                if len(mutat_info) != 0:
                    # deletionの処理
                    deletion = mutat_info[(mutat_info["seq_num"] == "?")].index
                    if len(deletion) != 0:
                        mutat_info.drop(deletion, inplace=True)
                        chain_num = (
                            pd.Series(chain)
                            .map(
                                lambda x: (
                                    int(x.split(", ")[1]) if isinstance(x, str) else x
                                )
                            )
                            .diff()
                        )
                        deletion = chain_num[(chain_num != 1)].dropna()
                        for index, i in zip(deletion.index, deletion):
                            chain[index:index] = [None] * int(i)

                    # insertion
                    insertion = mutat_info[(mutat_info["db_seq_num"] == "?")]["seq_num"]
                    if len(insertion) != 0:
                        mutat_info.drop(insertion.index, inplace=True)
                        insertion = insertion.values.tolist()
                        for i in chain:
                            if isinstance(i, str):
                                for n in insertion:
                                    if n == i.split(", ")[1]:
                                        insertion.remove(n)
                                        chain.remove(i)

                    # delins
                    dup_mutat = mutat_info[
                        mutat_info.duplicated(subset=["seq_num"], keep=False)
                    ]
                    if len(dup_mutat) != 0:
                        mutat_info.drop(dup_mutat.index, inplace=True)
                        for i in dup_mutat["seq_num"].drop_duplicates():
                            chain_num = pd.Series(chain).map(
                                lambda x: (
                                    int(x.split(", ")[1]) if isinstance(x, str) else x
                                )
                            )
                            num = len(dup_mutat[dup_mutat["seq_num"] == i]) - 1
                            index = chain_num[chain_num == int(i)].index[0] + 1
                            chain[index:index] = [None] * num

                    dup_mutat = mutat_info[
                        mutat_info.duplicated(subset=["db_seq_num"], keep=False)
                    ]
                    if len(dup_mutat) != 0:
                        mutat_info.drop(dup_mutat.index, inplace=True)
                        insertion = []
                        for i in dup_mutat["db_seq_num"].drop_duplicates():
                            insertion += (
                                dup_mutat[dup_mutat["db_seq_num"] == i]["seq_num"]
                                .reset_index(drop=True)
                                .drop([0])
                                .values.tolist()
                            )
                        m = 0
                        for i in range(len(chain)):
                            i = chain[i + m]
                            if isinstance(i, str):
                                for n in insertion:
                                    if n == i.split(", ")[1]:
                                        insertion.remove(n)
                                        chain.remove(i)
                                        m -= 1

                if firstLoop:
                    firstLoop = False
                    sequence = pd.DataFrame(
                        chain, columns=[self.pdbid + " " + row.strand_id]
                    )
                else:
                    strand = pd.Series(chain, name=self.pdbid + " " + row.strand_id)
                    sequence = pd.concat([sequence, strand], axis=1)

        if firstLoop:
            sequence = pd.DataFrame()
        return sequence
