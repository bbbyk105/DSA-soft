"use client";

import { useEffect, useState, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createJob, type JobParams } from "@/lib/api";
import {
  getAnalysis,
  listAnalyses,
  type AnalysisSummary,
} from "@/app/lib/api/analyses";

function AnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uniprotId, setUniprotId] = useState("");
  const [params, setParams] = useState<JobParams>({
    sequence_ratio: 0.2,
    min_structures: 5,
    method: "X-ray",
    negative_pdbid: "",
    cis_threshold: 3.3,
    proc_cis: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [runningAnalyses, setRunningAnalyses] = useState<AnalysisSummary[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

  // Prefill機能: URLパラメータから分析IDを取得してフォームを初期化
  useEffect(() => {
    const prefillId = searchParams.get("prefill");
    if (prefillId && !loadingPrefill) {
      setLoadingPrefill(true);
      getAnalysis(prefillId)
        .then((analysis) => {
          // UniProt IDを設定
          if (analysis.summary.uniprot_id) {
            setUniprotId(analysis.summary.uniprot_id);
          }

          // パラメータを設定
          if (analysis.params) {
            const newParams: JobParams = {
              sequence_ratio: analysis.params.sequence_ratio ?? 0.2,
              min_structures: analysis.params.min_structures ?? 5,
              method: analysis.params.method || "X-ray",
              negative_pdbid: analysis.params.negative_pdb_ids?.join(",") ?? "",
              cis_threshold: analysis.params.cis_threshold ?? 3.3,
              proc_cis: analysis.params.proc_cis ?? true,
            };
            setParams(newParams);
          }
        })
        .catch((err) => {
          console.error("Failed to load analysis for prefill:", err);
          setError("Failed to load analysis parameters");
        })
        .finally(() => {
          setLoadingPrefill(false);
        });
    }
  }, [searchParams, loadingPrefill]);

  // 進行中の解析を取得
  const fetchRunningAnalyses = useCallback(async () => {
    setLoadingAnalyses(true);
    try {
      const data = await listAnalyses({ limit: 50 });
      const running = data.filter(
        (a) => a.status === "queued" || a.status === "running"
      );
      setRunningAnalyses(running);
    } catch (err) {
      console.error("Failed to fetch running analyses:", err);
    } finally {
      setLoadingAnalyses(false);
    }
  }, []);

  // 初回読み込み時とジョブ作成後に実行中の解析を取得
  useEffect(() => {
    fetchRunningAnalyses();
  }, [fetchRunningAnalyses]);

  // 進行中のジョブのIDリストをメモ化
  const runningJobIds = useMemo(
    () =>
      runningAnalyses
        .filter((a) => a.status === "queued" || a.status === "running")
        .map((a) => a.id)
        .join(","),
    [runningAnalyses]
  );

  // 進行中のジョブをポーリング
  useEffect(() => {
    if (!runningJobIds) return;

    const interval = setInterval(() => {
      fetchRunningAnalyses();
    }, 2000); // 2秒ごとに更新

    return () => clearInterval(interval);
  }, [runningJobIds, fetchRunningAnalyses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      // UniProt IDのバリデーション（複数対応）
      const ids = uniprotId
        .split(/[,\s]+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (ids.length === 0) {
        throw new Error("UniProt ID is required");
      }

      // すべてのIDを検証しつつ、ジョブをそれぞれ作成
      const createdJobIds: string[] = [];

      for (const rawId of ids) {
        const id = rawId.toUpperCase();
        if (
          !/^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(
            id
          )
        ) {
          throw new Error(`Invalid UniProt ID format: ${id}`);
        }

        const result = await createJob(id, params);
        createdJobIds.push(result.job_id);
      }

      if (createdJobIds.length > 0) {
        setSuccessMessage(
          `${createdJobIds.length}件の解析ジョブを作成しました。`
        );
        // フォームをリセット
        setUniprotId("");
        // 進行中の解析を再取得
        await fetchRunningAnalyses();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">
            DSA (Distance Scoring Analysis)
          </h1>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="text-blue-600 hover:underline font-medium text-sm sm:text-base"
            >
              使い方を見る →
            </Link>
            <Link
              href="/analysis/history"
              className="text-blue-600 hover:underline font-medium text-sm sm:text-base"
            >
              解析履歴 / History →
            </Link>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white p-4 sm:p-6 md:p-8 rounded-lg shadow-md mb-6 sm:mb-8"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
            {/* 左列 */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="uniprot_id"
                    className="block text-sm font-medium"
                  >
                    UniProt ID(s) (複数の場合はカンマまたはスペース区切り) *
                  </label>
                  <a
                    href="https://www.uniprot.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    UniProt IDを調べる →
                  </a>
                </div>
                <input
                  type="text"
                  id="uniprot_id"
                  value={uniprotId}
                  onChange={(e) => setUniprotId(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., C6H0Y9"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="method"
                  className="block text-sm font-medium mb-2"
                >
                  構造決定手法 (Method)
                </label>
                <select
                  id="method"
                  value={params.method || "X-ray"}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      method: e.target.value as "X-ray" | "NMR" | "EM" | "all",
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="X-ray">X-ray結晶構造解析</option>
                  <option value="NMR">NMR（核磁気共鳴）</option>
                  <option value="EM">電子顕微鏡（EM）</option>
                  <option value="all">全て (X-ray, NMR, 電子顕微鏡)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  構造決定手法を選択してください。「全て」を選択すると、X-ray、NMR、電子顕微鏡の全てのデータを使用して解析します。
                </p>
              </div>

              <div>
                <label
                  htmlFor="cis_threshold"
                  className="block text-sm font-medium mb-2"
                >
                  Cis threshold (Å)
                </label>
                <input
                  type="number"
                  id="cis_threshold"
                  step="0.1"
                  min="0"
                  value={params.cis_threshold || 3.3}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      cis_threshold: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">cis判定の距離閾値</p>
              </div>
            </div>

            {/* 右列 */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="sequence_ratio"
                  className="block text-sm font-medium mb-2"
                >
                  Sequence ratio
                </label>
                <input
                  type="number"
                  id="sequence_ratio"
                  step="0.1"
                  min="0"
                  max="1"
                  value={params.sequence_ratio || 0.2}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      sequence_ratio: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  配列アライメント閾値 (0.0-1.0)
                </p>
              </div>

              <div>
                <label
                  htmlFor="negative_pdbid"
                  className="block text-sm font-medium mb-2"
                >
                  Negative PDB ID (除外するPDB ID)
                </label>
                <input
                  type="text"
                  id="negative_pdbid"
                  value={params.negative_pdbid || ""}
                  onChange={(e) =>
                    setParams({ ...params, negative_pdbid: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="例: 1AAA 1BBB または 1AAA,1BBB"
                />
                <p className="text-xs text-gray-500 mt-1">
                  スペースまたはカンマ区切り
                </p>
              </div>
            </div>
          </div>

          {/* オプションセクション */}
          <div className="mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-medium mb-2 sm:mb-3">
              オプション
            </h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={params.proc_cis ?? true}
                  onChange={(e) =>
                    setParams({ ...params, proc_cis: e.target.checked })
                  }
                  className="mr-2"
                />
                <span>Cis解析</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mr-2"
                />
                <span>ヒートマップ生成</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? "解析を開始中..." : "解析を開始"}
          </button>
        </form>

        {/* 進行中のタスク */}
        {runningAnalyses.length > 0 && (
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">
              進行中の解析
            </h2>
            <div className="space-y-3 sm:space-y-4">
              {runningAnalyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:bg-gray-50"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-medium text-base sm:text-lg">
                        {analysis.uniprot_id}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          analysis.status === "running"
                            ? "bg-blue-100 text-blue-800"
                            : analysis.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {analysis.status === "running"
                          ? "実行中"
                          : analysis.status === "failed"
                          ? "失敗"
                          : "待機中"}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500">
                        {analysis.method}
                      </span>
                    </div>
                    <Link
                      href={`/analysis/result?job_id=${analysis.id}`}
                      className="text-blue-600 hover:underline text-xs sm:text-sm self-start sm:self-auto"
                    >
                      詳細を見る →
                    </Link>
                  </div>
                  {analysis.status === "failed" && analysis.error_message && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg text-xs sm:text-sm text-red-800">
                      <div className="flex items-start mb-2">
                        <svg
                          className="w-4 h-4 mr-1.5 mt-0.5 text-red-600 flex-shrink-0"
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
                        <strong className="text-red-900">エラー:</strong>
                      </div>
                      <div className="ml-5 whitespace-pre-line leading-relaxed">
                        {analysis.error_message.split("\n").map((line, i) => {
                          const trimmed = line.trim();
                          if (trimmed.match(/^【.*】/)) {
                            return (
                              <div
                                key={i}
                                className="font-bold text-red-900 mt-2 mb-1 first:mt-0"
                              >
                                {trimmed}
                              </div>
                            );
                          } else if (trimmed.match(/^\d+\.\s/)) {
                            return (
                              <div key={i} className="ml-4 mb-1">
                                {trimmed}
                              </div>
                            );
                          } else if (trimmed.startsWith("  - ")) {
                            return (
                              <div key={i} className="ml-6 mb-0.5">
                                {trimmed}
                              </div>
                            );
                          } else if (trimmed !== "") {
                            return (
                              <div key={i} className="mb-1">
                                {trimmed}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  )}
                  {(analysis.status === "queued" ||
                    analysis.status === "running") &&
                    analysis.progress !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">進捗</span>
                          <span className="text-sm font-medium text-gray-700">
                            {Math.min(Math.max(analysis.progress, 0), 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                Math.max(analysis.progress, 0),
                                100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                  <div className="mt-2 text-xs text-gray-500 break-words">
                    作成日時: {new Date(analysis.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <Link
                href="/analysis/history"
                className="text-blue-600 hover:underline text-sm"
              >
                すべての解析履歴を見る →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white p-4 sm:p-6 md:p-8 rounded-lg shadow-md">
              <p>読み込み中...</p>
            </div>
          </div>
        </div>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}
