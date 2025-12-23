#!/usr/bin/env python
"""DSA CLI - Command line interface for DSA analysis"""
import os
import sys
import json
import argparse
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
        "--xray-only",
        action="store_true",
        default=True,
        help="Use only X-ray structures (default: True)",
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

    method = "X-ray" if args.xray_only else ""
    seq_ratio = args.sequence_ratio * 100  # パーセントに変換

    try:
        # 進捗出力
        print("STEP 1/5: Checking PDB availability...", file=sys.stderr, flush=True)
        if not count_pdb(args.uniprot, method, args.negative_pdbid):
            error_msg = "Less than required PDB entries"
            result = {
                "status": "failed",
                "error": error_msg,
                "uniprot_id": args.uniprot,
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
            error_msg = f"Less than {args.min_structures} structures after filtering"
            result = {
                "status": "failed",
                "error": error_msg,
                "uniprot_id": args.uniprot,
                "structures_found": len(pdbtuple),
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
                "xray_only": args.xray_only,
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
