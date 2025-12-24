"use client";

import { useEffect, useState, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createJob, type JobParams } from "@/lib/api";
import { getAnalysis, listAnalyses, type AnalysisSummary } from "@/app/lib/api/analyses";

function AnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uniprotId, setUniprotId] = useState("");
  const [params, setParams] = useState<JobParams>({
    sequence_ratio: 0.2,
    min_structures: 5,
    xray_only: true,
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
              xray_only: analysis.params.method === "X-ray",
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
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">DSA Analysis</h1>
          <Link
            href="/analysis/history"
            className="text-blue-600 hover:underline font-medium"
          >
            解析履歴 / History →
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white p-8 rounded-lg shadow-md mb-8"
        >
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* 左列 */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="uniprot_id"
                  className="block text-sm font-medium mb-2"
                >
                  UniProt ID(s) (複数の場合はカンマまたはスペース区切り) *
                </label>
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
                  Method (PDB filter)
                </label>
                <select
                  id="method"
                  value={params.xray_only ? "X-ray" : "all"}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      xray_only: e.target.value === "X-ray",
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="X-ray">X-ray</option>
                  <option value="all">All</option>
                </select>
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
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">オプション</h3>
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
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">進行中の解析</h2>
            <div className="space-y-4">
              {runningAnalyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-lg">
                        {analysis.uniprot_id}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          analysis.status === "running"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {analysis.status === "running" ? "実行中" : "待機中"}
                      </span>
                      <span className="text-sm text-gray-500">
                        {analysis.method}
                      </span>
                    </div>
                    <Link
                      href={`/analysis/result?job_id=${analysis.id}`}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      詳細を見る →
                    </Link>
                  </div>
                  {(analysis.status === "queued" ||
                    analysis.status === "running") &&
                    analysis.progress !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600">進捗</span>
                          <span className="text-sm font-medium text-gray-700">
                            {Math.min(
                              Math.max(analysis.progress, 0),
                              100
                            )}%
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
                  <div className="mt-2 text-xs text-gray-500">
                    作成日時:{" "}
                    {new Date(analysis.created_at).toLocaleString()}
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
    <Suspense fallback={
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-lg shadow-md">
            <p>読み込み中...</p>
          </div>
        </div>
      </div>
    }>
      <AnalysisContent />
    </Suspense>
  );
}
