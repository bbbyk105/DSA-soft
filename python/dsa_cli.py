#!/usr/bin/env python
"""DSA CLI - Command line interface for DSA analysis"""
import os
import sys
import json
import argparse
import re
from pathlib import Path
import pandas as pd
from dsa.fetch import UniprotData
from dsa.pipeline import count_pdb, prep, run_DSA
from dsa.plotting import plot_heatmap, plot_distance_score


def main():
    parser = argparse.ArgumentParser(description="DSA Analysis CLI")
    parser.add_argument("run", help="Run DSA analysis")
    parser.add_argument("--uniprot", required=True, help="UniProt ID")
    parser.add_argument("--out", required=True, help="Output directory")
    parser.add_argument(
        "--sequence-ratio",
        type=float,
        default=0.7,
        help="Sequence ratio threshold (default: 0.7)",
    )
    parser.add_argument(
        "--min-structures",
        type=int,
        default=5,
        help="Minimum number of structures (default: 5)",
    )
    parser.add_argument(
        "--method",
        type=str,
        default="X-ray",
        choices=["X-ray", "NMR", "EM", ""],
        help="PDB method to use: X-ray, NMR, EM, or empty string for all (default: X-ray)",
    )
    parser.add_argument(
        "--negative-pdbid",
        default="",
        help="Comma or space separated PDB IDs to exclude",
    )
    parser.add_argument(
        "--cis-threshold",
        type=float,
        default=3.3,
        help="Cis threshold in Angstrom (default: 3.3)",
    )
    parser.add_argument(
        "--proc-cis",
        action="store_true",
        default=True,
        help="Process cis analysis (default: True)",
    )
    parser.add_argument("--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # 出力ディレクトリの作成
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 作業ディレクトリの設定（絶対パスに変換）
    work_dir = out_dir / "work"
    work_dir = work_dir.resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    pdb_dir = work_dir / "pdb_files"
    atom_coord_dir = work_dir / "atom_coord"

    method = args.method if args.method else ""
    seq_ratio = args.sequence_ratio * 100  # パーセントに変換

    try:
        # 進捗出力
        print("STEP 1/5: Checking PDB availability...", file=sys.stderr, flush=True)
        
        # まず全メソッドで確認（エラーメッセージ用）
        unidata = UniprotData(args.uniprot)
        all_methods = ["X-ray", "NMR", "EM"]
        method_counts = {}
        total_count = 0
        
        for m in all_methods:
            test_list = unidata.pdblist(m)
            count = len(test_list)
            method_counts[m] = count
            total_count += count
        
        # negative_pdbidの処理
        pdblist = unidata.pdblist(method)
        if args.negative_pdbid != "":
            negative_list = re.split(r"[,\s]+", args.negative_pdbid.strip())
            negative_list_upper = [neg.upper() for neg in negative_list]
            pdblist = [item for item in pdblist if item.upper() not in negative_list_upper]
        
        if len(pdblist) < 1:
            # わかりやすいエラーメッセージを生成
            method_name = "X-ray結晶構造解析のみ" if method == "X-ray" else "全ての構造決定手法"
            
            error_parts = [
                f"解析に必要なデータが見つかりませんでした。",
                f"",
                f"【入力されたUniProt ID】: {args.uniprot}",
                f"【検索条件】: {method_name}",
            ]
            
            if method == "X-ray":
                error_parts.extend([
                    f"",
                    f"【見つかったデータの数】:",
                    f"  - X-ray結晶構造解析: {method_counts.get('X-ray', 0)}件",
                    f"  - NMR（核磁気共鳴）: {method_counts.get('NMR', 0)}件",
                    f"  - 電子顕微鏡: {method_counts.get('EM', 0)}件",
                    f"  - 合計: {total_count}件",
                    f"",
                    f"【解決方法】:",
                    f"  X-ray結晶構造解析のデータだけでは解析できません。",
                    f"  以下の手順で、他の方法で得られたデータも含めて解析できます：",
                    f"",
                    f"  1. 解析画面に戻る",
                    f"  2. 「Method (PDB filter)」という項目を探す",
                    f"  3. 選択を「X-ray」から「All」に変更する",
                    f"  4. 再度解析を実行する",
                    f"",
                    f"  これにより、X-ray、NMR、電子顕微鏡の全てのデータを使用して解析できます。",
                ])
            else:
                error_parts.extend([
                    f"",
                    f"【見つかったデータの数】: {total_count}件",
                    f"",
                    f"【解決方法】:",
                    f"  このUniProt IDには解析に使用できるデータが存在しないか、",
                    f"  非常に少ない可能性があります。",
                    f"",
                    f"  以下の点を確認してください：",
                    f"  - 入力したUniProt IDが正しいか確認する",
                    f"  - 別のUniProt IDで試してみる",
                ])
            
            if args.negative_pdbid != "":
                error_parts.append(f"  - 除外しているPDB ID: {args.negative_pdbid}")
            
            error_msg = "\n".join(error_parts)
            
            result = {
                "status": "failed",
                "error": error_msg,
                "uniprot_id": args.uniprot,
                "method": method if method else "all",
                "pdb_counts": method_counts,
                "total_pdb_count": total_count,
            }
            with open(out_dir / "result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            with open(out_dir / "status.json", "w", encoding="utf-8") as f:
                json.dump(
                    {"status": "failed", "progress": 20, "message": error_msg},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
            sys.exit(1)
        
        # count_pdb関数も呼び出して互換性を保つ
        if not count_pdb(args.uniprot, method, args.negative_pdbid):
            # 上記のエラーハンドリングで既に処理されているので、ここには来ないはず
            pass

        print("STEP 2/5: Preparing data...", file=sys.stderr, flush=True)
        # 絶対パスに変換
        pdb_dir_str = str(pdb_dir.resolve())
        atom_coord_dir_str = str(atom_coord_dir.resolve())
        seqdata, all_pdblist = prep(
            args.uniprot,
            method,
            args.negative_pdbid,
            pdb_dir_str,
            atom_coord_dir_str,
            args.verbose,
        )

        # UniProt配列のみを抽出
        unidata = UniprotData(args.uniprot)
        uniprotids = unidata.get_id()
        id = str(uniprotids)
        seqdata1 = seqdata.filter(like=args.uniprot)

        # Normal & Substitutionを統合
        nor_pdblist = all_pdblist[0]
        sub_pdblist = all_pdblist[1]
        pdbtuple = tuple(nor_pdblist + sub_pdblist)

        if len(pdbtuple) < args.min_structures:
            error_msg = (
                f"解析に必要なデータの数が足りません。\n"
                f"\n"
                f"【現在の状況】:\n"
                f"  - 見つかったデータの数: {len(pdbtuple)}件\n"
                f"  - 必要な最小データ数: {args.min_structures}件\n"
                f"  - 不足している数: {args.min_structures - len(pdbtuple)}件\n"
                f"\n"
                f"【解決方法】:\n"
                f"  以下のいずれかの方法で解決できます：\n"
                f"\n"
                f"  方法1: 必要なデータ数を減らす\n"
                f"    - 解析画面の「最小構造数」という項目の値を小さくする\n"
                f"    - 現在の値: {args.min_structures}\n"
                f"    - 推奨: {max(1, len(pdbtuple))} 以上（見つかったデータ数以上）\n"
                f"\n"
                f"  方法2: より多くのデータを含める\n"
                f"    - 解析画面の「Method (PDB filter)」を「All」に変更する\n"
                f"    - これにより、X-ray、NMR、電子顕微鏡の全てのデータを使用できます\n"
            )
            
            if args.negative_pdbid != "":
                error_msg += (
                    f"\n"
                    f"  方法3: 除外しているデータを見直す\n"
                    f"    - 現在除外しているPDB ID: {args.negative_pdbid}\n"
                    f"    - 除外する必要がない場合は、この項目を空にする\n"
                )
            
            result = {
                "status": "failed",
                "error": error_msg,
                "uniprot_id": args.uniprot,
                "found_structures": len(pdbtuple),
                "required_structures": args.min_structures,
            }
            with open(out_dir / "result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            with open(out_dir / "status.json", "w", encoding="utf-8") as f:
                json.dump(
                    {"status": "failed", "progress": 40, "message": error_msg},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
            sys.exit(1)

        print(
            f"STEP 3/5: Processing {len(pdbtuple)} PDB entries...",
            file=sys.stderr,
            flush=True,
        )
        seqdata2 = seqdata.loc[:, seqdata.columns.str.startswith(pdbtuple)]
        norsub_seqdata = pd.concat([seqdata1, seqdata2], axis=1)

        print("STEP 4/5: Running DSA analysis...", file=sys.stderr, flush=True)
        score, log_data, distance = run_DSA(
            args.uniprot,
            norsub_seqdata,
            seq_ratio,
            method,
            args.negative_pdbid,
            pdb_dir_str,
            atom_coord_dir_str,
            chain_threshold=3,
            cis_threshold=args.cis_threshold,
            proc_cis=args.proc_cis,
            verbose=args.verbose,
        )

        if score.empty or "error" in log_data:
            error_msg = log_data.get("error", "Analysis failed")
            result = {
                "status": "failed",
                "error": error_msg,
                "uniprot_id": args.uniprot,
            }
            with open(out_dir / "result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            with open(out_dir / "status.json", "w", encoding="utf-8") as f:
                json.dump(
                    {"status": "failed", "progress": 80, "message": error_msg},
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
            sys.exit(1)

        print("STEP 5/5: Generating plots...", file=sys.stderr, flush=True)

        # ヒートマップ生成
        heatmap_path = out_dir / "heatmap.png"
        plot_heatmap(score, str(heatmap_path), f"DSA Score Heatmap - {args.uniprot}")

        # 散布図生成
        scatter_path = out_dir / "dist_score.png"
        plot_distance_score(
            score,
            str(scatter_path),
            f"Distance vs Score - {args.uniprot}",
            args.uniprot,
        )

        # 結果JSONの作成
        result = {
            "status": "success",
            "uniprot_id": args.uniprot,
            "parameters": {
                "sequence_ratio": args.sequence_ratio,
                "min_structures": args.min_structures,
                "method": args.method if args.method else "all",
                "negative_pdbid": args.negative_pdbid,
                "cis_threshold": args.cis_threshold,
                "proc_cis": args.proc_cis,
            },
            "statistics": log_data,
            "score_summary": {
                "total_pairs": len(score),
                "mean_score": float(score["score"].mean()),
                "std_score": float(score["score"].std()),
                "max_score": float(score["score"].max()),
                "min_score": float(score["score"].min()),
                "mean_distance": float(score["distance mean"].mean()),
                "mean_std": float(score["distance std"].mean()),
            },
        }

        with open(out_dir / "result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        # ステータス更新
        with open(out_dir / "status.json", "w", encoding="utf-8") as f:
            json.dump(
                {
                    "status": "done",
                    "progress": 100,
                    "message": "Analysis completed successfully",
                },
                f,
                indent=2,
            )

        print("Analysis completed successfully", file=sys.stderr, flush=True)

    except Exception as e:
        error_msg = str(e)
        result = {"status": "failed", "error": error_msg, "uniprot_id": args.uniprot}
        with open(out_dir / "result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        with open(out_dir / "status.json", "w", encoding="utf-8") as f:
            json.dump(
                {"status": "failed", "progress": 0, "message": error_msg},
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"Error: {error_msg}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
