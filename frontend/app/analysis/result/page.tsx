"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getJob, getResultUrl, type Job } from "@/lib/api";
import dynamic from "next/dynamic";
import JSZip from "jszip";

// Mol* Viewerを動的インポート（SSRを無効化）
const MolstarViewer = dynamic(() => import("@/components/MolstarViewer"), {
  ssr: false,
});

function ResultContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdbList, setPdbList] = useState<string[]>([]);
  const [selectedPdbId, setSelectedPdbId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setError("Job ID is required");
      return;
    }

    const fetchData = async () => {
      try {
        const jobData = await getJob(jobId);
        setJob(jobData);

        if (jobData.status === "done" && jobData.result) {
          const resultResponse = await fetch(
            getResultUrl(jobId, "result.json"),
          );
          if (resultResponse.ok) {
            try {
              const text = await resultResponse.text();
              // 空文字列や余分な文字を除去
              const cleanedText = text.trim();
              if (cleanedText) {
                const resultData = JSON.parse(cleanedText);
                setResult(resultData);

                // 結果JSON中のstatistics.pdb_idsからPDBリストを取得
                const stats = (resultData.statistics || {}) as {
                  pdb_ids?: string[];
                };
                const pdbIds = stats.pdb_ids || [];
                setPdbList(pdbIds);
                // 最初のPDB IDを選択
                if (pdbIds.length > 0) {
                  setSelectedPdbId(pdbIds[0]);
                }
              } else {
                setError("Result file is empty");
              }
            } catch (parseError) {
              console.error("JSON parse error:", parseError);
              setError(
                `Failed to parse result: ${
                  parseError instanceof Error
                    ? parseError.message
                    : "Unknown error"
                }`,
              );
            }
          } else {
            setError(
              `Failed to fetch result: ${resultResponse.status} ${resultResponse.statusText}`,
            );
          }
        } else if (jobData.status === "failed") {
          setError(jobData.error_message || "解析失敗");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch results",
        );
      }
    };

    fetchData();
  }, [jobId]);

  if (error) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border-2 border-red-300 text-red-800 p-4 sm:p-6 rounded-lg shadow-md">
            <div className="flex items-center mb-4">
              <svg
                className="w-6 h-6 mr-2 text-red-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-lg sm:text-xl font-bold text-red-900">
                エラー
              </h2>
            </div>
            <div className="text-sm sm:text-base leading-relaxed space-y-2">
              {error.split("\n").map((line, index) => {
                const trimmed = line.trim();
                if (!trimmed) return <br key={index} />;

                // 【】で囲まれたセクションタイトル
                if (trimmed.match(/^【.*】/)) {
                  return (
                    <div
                      key={index}
                      className="font-bold text-base text-red-900 mt-4 mb-2 first:mt-0"
                    >
                      {trimmed}
                    </div>
                  );
                }
                // 番号付きリスト（1. で始まる）
                else if (trimmed.match(/^\d+\.\s/)) {
                  return (
                    <div key={index} className="ml-6 mb-1">
                      <span className="font-semibold text-red-900">
                        {trimmed.match(/^\d+\./)?.[0]}
                      </span>
                      <span>{trimmed.replace(/^\d+\.\s/, " ")}</span>
                    </div>
                  );
                }
                // インデントされた項目（  - で始まる）
                else if (trimmed.startsWith("  - ")) {
                  return (
                    <div key={index} className="ml-8 mb-1 text-red-700">
                      {trimmed}
                    </div>
                  );
                }
                // 通常のテキスト
                else {
                  return (
                    <div key={index} className="mb-1 text-red-800">
                      {trimmed}
                    </div>
                  );
                }
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!job || !result) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const stats = result.statistics || {};
  const cisAnalysis = stats.cis_analysis || {};
  const scoreSummary = result.score_summary || {};

  // エクスポート機能
  const exportJSON = () => {
    if (!result || !jobId) return;
    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dsa_result_${stats.uniprot_id || jobId}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getJSONData = (): string => {
    if (!result) return "";
    return JSON.stringify(result, null, 2);
  };

  const exportCSV = () => {
    if (!result || !jobId) return;
    const csvContent = getCSVContent();
    const dataBlob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dsa_result_${stats.uniprot_id || jobId}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getCSVContent = (): string => {
    if (!result || !jobId) return "";
    const rows: string[][] = [];

    // ヘッダー
    rows.push(["項目", "値"]);

    // 基本情報
    rows.push(["UniProt ID", stats.uniprot_id || result.uniprot_id || ""]);
    rows.push(["エントリ数", stats.entries?.toString() || ""]);
    rows.push(["チェーン数", stats.chains?.toString() || ""]);
    rows.push(["残基数", stats.length?.toString() || ""]);
    rows.push(["残基カバレッジ (%)", stats.length_percent?.toString() || ""]);
    rows.push(["分解能 (Å)", stats.resolution?.toString() || ""]);
    rows.push(["UMF", stats.umf?.toString() || ""]);
    rows.push(["平均スコア", scoreSummary.mean_score?.toFixed(2) || ""]);
    rows.push(["標準偏差", scoreSummary.mean_std?.toFixed(2) || ""]);

    // Cis解析
    if (cisAnalysis.cis_num !== undefined) {
      rows.push(["Cisペア数", cisAnalysis.cis_num.toString()]);
      rows.push([
        "平均Cis距離 (Å)",
        cisAnalysis.cis_dist_mean?.toString() || "",
      ]);
      rows.push([
        "Cis距離標準偏差 (Å)",
        cisAnalysis.cis_dist_std?.toString() || "",
      ]);
      rows.push([
        "平均Cisスコア",
        cisAnalysis.cis_score_mean?.toString() || "",
      ]);
      rows.push(["Mix", cisAnalysis.mix?.toString() || ""]);
    }

    // PDB IDリスト
    if (stats.pdb_ids && stats.pdb_ids.length > 0) {
      rows.push(["使用PDB ID", stats.pdb_ids.join(", ")]);
    }

    // CSV文字列に変換
    return rows
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
  };

  const downloadImage = async (imageType: "heatmap" | "scatter") => {
    if (!jobId || !job?.result) return;

    const url =
      imageType === "heatmap"
        ? getResultUrl(jobId, "heatmap.png")
        : getResultUrl(jobId, "dist_score.png");

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `dsa_${imageType}_${stats.uniprot_id || jobId}_${new Date().toISOString().split("T")[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(imageUrl);
    } catch (err) {
      console.error("Failed to download image:", err);
      alert("画像のダウンロードに失敗しました");
    }
  };

  const getImageBlob = async (
    imageType: "heatmap" | "scatter",
  ): Promise<Blob | null> => {
    if (!jobId || !job?.result) return null;

    const url =
      imageType === "heatmap"
        ? getResultUrl(jobId, "heatmap.png")
        : getResultUrl(jobId, "dist_score.png");

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.blob();
    } catch (err) {
      console.error(`Failed to fetch ${imageType} image:`, err);
      return null;
    }
  };

  const downloadAll = async () => {
    if (!jobId || !result) return;

    try {
      const zip = new JSZip();
      const dateStr = new Date().toISOString().split("T")[0];
      const baseName = `dsa_result_${stats.uniprot_id || jobId}_${dateStr}`;

      // JSONを追加
      const jsonData = getJSONData();
      if (jsonData) {
        zip.file(`${baseName}.json`, jsonData);
      }

      // CSVを追加
      const csvContent = getCSVContent();
      if (csvContent) {
        zip.file(`${baseName}.csv`, "\uFEFF" + csvContent);
      }

      // 画像を追加
      if (job?.result?.heatmap_url) {
        const heatmapBlob = await getImageBlob("heatmap");
        if (heatmapBlob) {
          zip.file(`${baseName}_heatmap.png`, heatmapBlob);
        }
      }

      if (job?.result?.scatter_url) {
        const scatterBlob = await getImageBlob("scatter");
        if (scatterBlob) {
          zip.file(`${baseName}_scatter.png`, scatterBlob);
        }
      }

      // ZIPファイルを生成してダウンロード
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to create ZIP file:", err);
      alert("ZIPファイルの作成に失敗しました");
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <Link
            href="/analysis"
            className="inline-flex items-center text-blue-600 hover:underline text-sm sm:text-base mb-2 sm:mb-0"
          >
            <span className="mr-1">←</span>
            Home に戻る
          </Link>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {jobId && (
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/analysis/result?job_id=${jobId}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (err) {
                    console.error("Failed to copy URL:", err);
                    // フォールバック: テキストエリアを使用
                    const textArea = document.createElement("textarea");
                    textArea.value = url;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                      document.execCommand("copy");
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (fallbackErr) {
                      console.error("Fallback copy failed:", fallbackErr);
                    }
                    document.body.removeChild(textArea);
                  }
                }}
                className="bg-green-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-green-700 text-xs sm:text-sm md:text-base flex items-center gap-2 whitespace-nowrap"
              >
                {copied ? (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    コピーしました！
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    リンクをコピー
                  </>
                )}
              </button>
            )}
            {jobId && result && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-blue-700 text-xs sm:text-sm md:text-base flex items-center gap-2 whitespace-nowrap"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  エクスポート
                </button>
                {showExportMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowExportMenu(false)}
                    ></div>
                    <div className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-2 w-full sm:w-56 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                      <div className="py-1">
                        <button
                          onClick={async () => {
                            await downloadAll();
                            setShowExportMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-200"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          全てをダウンロード
                        </button>
                        <button
                          onClick={() => {
                            exportJSON();
                            setShowExportMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          JSON形式でエクスポート
                        </button>
                        <button
                          onClick={() => {
                            exportCSV();
                            setShowExportMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          CSV形式でエクスポート
                        </button>
                        {job?.result?.heatmap_url && (
                          <button
                            onClick={() => {
                              downloadImage("heatmap");
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            ヒートマップをダウンロード
                          </button>
                        )}
                        {job?.result?.scatter_url && (
                          <button
                            onClick={() => {
                              downloadImage("scatter");
                              setShowExportMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                              />
                            </svg>
                            散布図をダウンロード
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {jobId && (
              <button
                onClick={() => {
                  const currentIds =
                    new URLSearchParams(window.location.search).get("ids") ||
                    "";
                  const ids = currentIds
                    ? currentIds.split(",").filter(Boolean)
                    : [];
                  if (!ids.includes(jobId)) {
                    ids.push(jobId);
                  }
                  window.location.href = `/analysis/compare?ids=${ids.join(",")}`;
                }}
                className="bg-purple-600 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-purple-700 text-xs sm:text-sm md:text-base w-full sm:w-auto whitespace-nowrap"
              >
                Compareに追加 / Add to Compare
              </button>
            )}
          </div>
        </div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 break-words">
          DSA (Distance Scoring Analysis) 解析結果 -{" "}
          <span className="text-blue-600">
            {stats.uniprot_id || result.uniprot_id}
          </span>
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-8 break-all">
          ジョブ ID: <span className="font-mono">{jobId}</span>
        </p>

        <div className="space-y-4 sm:space-y-8">
          {/* 解析概要 */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* 解析概要 Overview */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">
                  解析概要 Overview
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">
                      UniProt ID
                    </p>
                    <p className="text-base sm:text-lg font-semibold break-words">
                      {stats.uniprot_id || result.uniprot_id}
                    </p>
                  </div>
                  {stats.entries && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        エントリ数 (Entries)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {stats.entries}
                      </p>
                    </div>
                  )}
                  {stats.chains && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        チェーン数 (Chains)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {stats.chains}
                      </p>
                    </div>
                  )}
                  {stats.length && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        残基数 (Length)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {stats.length}
                      </p>
                    </div>
                  )}
                  {stats.length_percent && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        残基カバレッジ (Length%)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {stats.length_percent}%
                      </p>
                    </div>
                  )}
                  {stats.resolution && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        分解能 (Resolution)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {stats.resolution} Å
                      </p>
                    </div>
                  )}
                  {stats.umf && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">UMF</p>
                      <p className="text-base sm:text-lg font-semibold text-blue-600">
                        {stats.umf}
                      </p>
                    </div>
                  )}
                  {scoreSummary.mean_score && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        ペアスコア平均 (Average Pair Score)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {scoreSummary.mean_score.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {scoreSummary.mean_std && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        ペアスコア標準偏差 (Pair Score Standard Deviation)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {scoreSummary.mean_std.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {cisAnalysis.cis_num !== undefined && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Cisペア数 (Cis Pair Count)
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-purple-600">
                        {cisAnalysis.cis_num}
                      </p>
                    </div>
                  )}
                  {cisAnalysis.cis_num !== undefined && stats.length && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Cis/Length(%)
                      </p>
                      <p className="text-base sm:text-lg font-semibold">
                        {((cisAnalysis.cis_num / stats.length) * 100).toFixed(
                          2,
                        )}
                        %
                      </p>
                    </div>
                  )}
                  {cisAnalysis.mix !== undefined && (
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Mix (Cis/Trans混在)
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-orange-600">
                        {cisAnalysis.mix}
                      </p>
                    </div>
                  )}
                </div>

                {/* 使用PDB IDリスト */}
                {stats.pdb_ids && stats.pdb_ids.length > 0 && (
                  <div className="mt-4 sm:mt-6">
                    <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      使用 PDB ID
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stats.pdb_ids.map((pdbId: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm"
                        >
                          {pdbId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Cisペプチド結合解析結果 */}
              {cisAnalysis.cis_num !== undefined && cisAnalysis.cis_num > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">
                    Cisペプチド結合解析結果
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div>
                      <p className="text-xs sm:text-sm text-gray-600">
                        Cisペア数 (Cis Pair Count)
                      </p>
                      <p className="text-base sm:text-lg font-semibold text-purple-600">
                        {cisAnalysis.cis_num}
                      </p>
                    </div>
                    {cisAnalysis.cis_dist_mean !== undefined && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          平均Cis距離 (Average Cis Distance)
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {cisAnalysis.cis_dist_mean} Å
                        </p>
                      </div>
                    )}
                    {cisAnalysis.cis_dist_std !== undefined && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          Cis距離標準偏差 (Cis Distance Standard Deviation)
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {cisAnalysis.cis_dist_std} Å
                        </p>
                      </div>
                    )}
                    {cisAnalysis.cis_score_mean !== undefined && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          平均Cisスコア (Average Cis Score)
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {cisAnalysis.cis_score_mean}
                        </p>
                      </div>
                    )}
                    {cisAnalysis.mix !== undefined && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          Mix (Cis/Trans混在)
                        </p>
                        <p className="text-base sm:text-lg font-semibold text-orange-600">
                          {cisAnalysis.mix}
                        </p>
                      </div>
                    )}
                    {cisAnalysis.threshold !== undefined && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          閾値 (Threshold)
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {cisAnalysis.threshold} Å
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Cisペアリスト */}
                  {cisAnalysis.cis_pair_list &&
                    cisAnalysis.cis_pair_list.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Cisペアリスト (最初の20個)
                        </p>
                        <div className="text-sm text-gray-600 break-words overflow-x-auto">
                          <p className="inline">
                            {cisAnalysis.cis_pair_list.join(", ")}
                            {cisAnalysis.cis_pair_total &&
                              cisAnalysis.cis_pair_total > 20 && (
                                <span>
                                  {" "}
                                  ... (他{cisAnalysis.cis_pair_total - 20}個)
                                </span>
                              )}
                          </p>
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* ヒートマップ */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">
                DSA Score Heatmap
              </h2>
              {job.result?.heatmap_url && (
                <div className="flex justify-center overflow-x-auto">
                  <img
                    src={getResultUrl(jobId!, "heatmap.png")}
                    alt="DSA Score Heatmap"
                    className="w-full sm:w-auto sm:max-w-full md:max-w-2xl h-auto rounded-lg shadow-md"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Distance-Score Plot */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">
                Distance-Score Plot
              </h2>
              {job.result?.scatter_url && (
                <div className="flex justify-center overflow-x-auto">
                  <img
                    src={getResultUrl(jobId!, "dist_score.png")}
                    alt="Distance vs Score"
                    className="w-full sm:w-auto sm:max-w-full md:max-w-2xl h-auto rounded-lg shadow-md"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3D Structure Viewer */}
          {pdbList.length > 0 && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">
                  3D Structure Viewer (Mol*)
                </h2>
                <div className="mb-3 sm:mb-4">
                  <label
                    htmlFor="pdb-select"
                    className="block text-xs sm:text-sm font-medium text-gray-700 mb-2"
                  >
                    PDB構造を選択
                  </label>
                  <select
                    id="pdb-select"
                    value={selectedPdbId || ""}
                    onChange={(e) => setSelectedPdbId(e.target.value)}
                    className="w-full sm:w-1/2 md:w-1/3 px-3 sm:px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                  >
                    {pdbList.map((pdbId) => (
                      <option key={pdbId} value={pdbId}>
                        {pdbId}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPdbId && jobId && (
                  <div className="w-full" style={{ minHeight: "600px" }}>
                    <Suspense
                      fallback={
                        <div className="w-full h-[600px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-gray-500 text-sm">読み込み中...</p>
                        </div>
                      }
                    >
                      <MolstarViewer
                        key={selectedPdbId}
                        pdbId={selectedPdbId}
                        className="w-full"
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
              <p>Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
