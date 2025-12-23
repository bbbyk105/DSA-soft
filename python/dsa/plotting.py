"""Plotting module for DSA analysis"""

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns


def generate_heatmap_data(score):
    """ヒートマップ用データ生成"""
    if score.empty:
        return pd.DataFrame()
    n0, n1 = score.iloc[-1, 0].split(", ")
    df1 = pd.DataFrame(np.zeros((int(n1), int(n1))))
    df1[:] = np.nan

    def Q(x, df):
        x00, x01 = x[0].split(", ")
        df.loc[int(x00) - 1, int(x01) - 1] = x[4]  # score

    score.apply(Q, df=df1, axis=1)
    return df1


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
