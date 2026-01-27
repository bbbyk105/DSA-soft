"""Plotting module for DSA analysis"""

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns


def generate_heatmap_data(score):
    """ヒートマップ用データ生成"""
    import sys
    if score.empty:
        return pd.DataFrame()
    try:
        # デバッグ情報を出力
        print(f"[DEBUG] generate_heatmap_data: score shape={score.shape}, columns={list(score.columns)}", file=sys.stderr, flush=True)
        print(f"[DEBUG] generate_heatmap_data: score.iloc[-1, 0] = {score.iloc[-1, 0]}, type={type(score.iloc[-1, 0])}", file=sys.stderr, flush=True)
        
        last_value = score.iloc[-1, 0]
        if not isinstance(last_value, str):
            error_msg = f"Expected string in score.iloc[-1, 0], got {type(last_value)}: {repr(last_value)}"
            print(f"[ERROR] {error_msg}", file=sys.stderr, flush=True)
            raise ValueError(error_msg)
        
        n0, n1 = last_value.split(", ")
        print(f"[DEBUG] generate_heatmap_data: n0={n0}, n1={n1}", file=sys.stderr, flush=True)
        
        n0_int = int(n0)
        n1_int = int(n1)
        print(f"[DEBUG] generate_heatmap_data: n0_int={n0_int}, n1_int={n1_int}", file=sys.stderr, flush=True)
        
        if n1_int <= 0:
            error_msg = f"Invalid n1 value: {n1_int} (must be > 0)"
            print(f"[ERROR] {error_msg}", file=sys.stderr, flush=True)
            raise ValueError(error_msg)
        
        df1 = pd.DataFrame(np.zeros((n1_int, n1_int)))
        df1[:] = np.nan

        def Q(x, df):
            try:
                # xはSeriesなので、位置ベースでアクセスする必要がある
                # x.iloc[0]で最初の列（column0）、x.iloc[4]でscore列
                first_col_value = x.iloc[0]
                score_value = x.iloc[4]
                if not isinstance(first_col_value, str):
                    raise ValueError(f"Expected string in first column, got {type(first_col_value)}: {first_col_value}")
                x00, x01 = first_col_value.split(", ")
                df.loc[int(x00) - 1, int(x01) - 1] = score_value
            except Exception as inner_e:
                print(f"[ERROR] Error in Q function: x.iloc[0]={x.iloc[0] if len(x) > 0 else 'N/A'}, error={inner_e}", file=sys.stderr, flush=True)
                raise

        score.apply(Q, df=df1, axis=1)
        return df1
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e) if str(e) else repr(e)
        full_error = f"Error generating heatmap data ({error_type}): {error_msg}"
        print(f"[ERROR] {full_error}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise ValueError(full_error) from e


def plot_heatmap(score, output_path, title="DSA Score Heatmap"):
    """DSA Scoreヒートマップを生成"""
    if score.empty:
        # 空のヒートマップを作成
        fig, ax = plt.subplots(figsize=(10, 8))
        ax.text(0.5, 0.5, "No data available", ha="center", va="center", fontsize=16)
        ax.set_title(title)
        plt.savefig(output_path, format="png", dpi=300, bbox_inches="tight")
        plt.close()
        return

    hm = generate_heatmap_data(score)
    if hm.empty:
        fig, ax = plt.subplots(figsize=(10, 8))
        ax.text(0.5, 0.5, "No data available", ha="center", va="center", fontsize=16)
        ax.set_title(title)
        plt.savefig(output_path, format="png", dpi=300, bbox_inches="tight")
        plt.close()
        return

    fig, ax = plt.subplots(figsize=(12, 10))
    sns.heatmap(
        hm,
        vmax=130,
        vmin=20,
        square=True,
        center=75,
        cmap="rainbow_r",
        cbar=True,
        ax=ax,
    )
    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.set_xlabel("Residue Number", fontsize=12)
    ax.set_ylabel("Residue Number", fontsize=12)
    plt.savefig(output_path, format="png", dpi=300, bbox_inches="tight")
    plt.close()


def plot_distance_score(score, output_path, title="Distance vs Score", uniprot_id=None):
    """Distance vs Score散布図を生成"""
    if score.empty:
        fig, ax = plt.subplots(figsize=(10, 8))
        ax.text(0.5, 0.5, "No data available", ha="center", va="center", fontsize=16)
        ax.set_title(title)
        plt.savefig(output_path, format="png", dpi=300, bbox_inches="tight")
        plt.close()
        return

    fig, ax = plt.subplots(figsize=(12, 8))

    # 散布図
    scatter = ax.scatter(
        score["distance mean"],
        score["score"],
        alpha=0.6,
        s=20,
        c=score["score"],
        cmap="viridis",
        vmin=score["score"].min(),
        vmax=score["score"].max(),
    )

    # 軸ラベル
    ax.set_xlabel("Ca-Ca distance (Å)", fontsize=12)
    ax.set_ylabel("DSA score (mean / std)", fontsize=12)

    # タイトル
    if uniprot_id:
        full_title = f"Distance-Score Plot\n{uniprot_id} - Distance vs Score"
    else:
        full_title = title
    ax.set_title(full_title, fontsize=14, fontweight="bold")

    # グリッド
    ax.grid(True, alpha=0.3)

    # カラーバー
    cbar = plt.colorbar(scatter, ax=ax, label="Score")

    # 統計情報ボックス
    mean_score = score["score"].mean()
    std_score = score["score"].std()
    mean_dist = score["distance mean"].mean()

    stats_text = f"Mean score: {mean_score:.2f} ± {std_score:.2f}\nMean distance: {mean_dist:.2f} Å"
    ax.text(
        0.02,
        0.98,
        stats_text,
        transform=ax.transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8),
    )

    plt.tight_layout()
    plt.savefig(output_path, format="png", dpi=300, bbox_inches="tight")
    plt.close()
