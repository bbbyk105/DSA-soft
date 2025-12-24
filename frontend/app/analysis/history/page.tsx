"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  listAnalyses,
  rerunAnalysis,
  cancelAnalysis,
  deleteAnalysis,
  type AnalysisSummary,
} from "@/app/lib/api/analyses";

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター状態
  const [uniprotId, setUniprotId] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Compare selection
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      setCompareIds(idsParam.split(",").filter(Boolean));
    }
  }, [searchParams]);

  useEffect(() => {
    fetchAnalyses();
  }, [uniprotId, method, status, fromDate, toDate]);

  // 進行中のジョブをポーリング
  useEffect(() => {
    const hasRunningJobs = analyses.some(
      (a) => a.status === "queued" || a.status === "running"
    );

    if (!hasRunningJobs) return;

    const interval = setInterval(() => {
      fetchAnalyses();
    }, 2000); // 2秒ごとに更新

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses.length, analyses.map((a) => a.status).join(",")]);

  const fetchAnalyses = async () => {
    setLoading(true);
    setError(null);

    try {
      const filters: any = {};
      if (uniprotId) filters.uniprot_id = uniprotId;
      if (method) filters.method = method;
      if (status) filters.status = status;
      if (fromDate) filters.from = fromDate;
      if (toDate) filters.to = toDate;
      filters.limit = 100;

      console.log("[History] Fetching analyses with filters:", filters);
      const data = await listAnalyses(filters);
      console.log("[History] Received analyses:", data);
      setAnalyses(data);
    } catch (err) {
      console.error("[History] Error fetching analyses:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch analyses");
    } finally {
      setLoading(false);
    }
  };

  const handleRerun = async (id: string) => {
    try {
      const result = await rerunAnalysis(id);
      router.push(`/analysis/result?job_id=${result.analysis_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rerun analysis");
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("解析を終了しますか？この操作は取り消せません。")) {
      return;
    }
    try {
      await cancelAnalysis(id);
      // 履歴を再取得
      fetchAnalyses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel analysis");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("解析を削除しますか？この操作は取り消せません。")) {
      return;
    }
    try {
      console.log("[History] Deleting analysis:", id);
      await deleteAnalysis(id);
      console.log("[History] Analysis deleted successfully");
      // 履歴を再取得
      fetchAnalyses();
    } catch (err) {
      console.error("[History] Error deleting analysis:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete analysis";
      alert(`削除に失敗しました: ${errorMessage}`);
    }
  };

  const handleDuplicate = (id: string) => {
    router.push(`/analysis?prefill=${id}`);
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const goToCompare = () => {
    if (compareIds.length > 0) {
      router.push(`/analysis/compare?ids=${compareIds.join(",")}`);
    }
  };

  const formatMetric = (metrics: any, key: string): string => {
    if (!metrics || metrics[key] === undefined || metrics[key] === null) {
      return "-";
    }
    const value = metrics[key];
    if (typeof value === "number") {
      if (
        key.includes("percent") ||
        key === "mean_score" ||
        key === "mean_std"
      ) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    return String(value);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link
            href="/analysis"
            className="inline-flex items-center text-blue-600 hover:underline"
          >
            <span className="mr-1">←</span>
            Home に戻る
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-8">解析履歴 / Analysis History</h1>

        {/* 検索フィルター */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4">検索 / Search</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                UniProt ID
              </label>
              <input
                type="text"
                value={uniprotId}
                onChange={(e) => setUniprotId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
                placeholder="部分一致"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Any</option>
                <option value="X-ray">X-ray</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Any</option>
                <option value="queued">Queued</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Compare selection */}
        {compareIds.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6 flex items-center justify-between">
            <span className="text-blue-800">
              {compareIds.length} 件選択中 / {compareIds.length} selected
            </span>
            <button
              onClick={goToCompare}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              比較 / Compare
            </button>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* テーブル */}
        {loading ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>Loading...</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>No analyses found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      選択
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      作成日時
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      UniProt ID
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Entries
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      Length%
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      UMF
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      mean_score
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      cis_num
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {analyses.map((analysis) => (
                    <tr key={analysis.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={compareIds.includes(analysis.id)}
                          onChange={() => toggleCompare(analysis.id)}
                          disabled={
                            analysis.status === "cancelled" ||
                            analysis.status === "failed"
                          }
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(analysis.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {analysis.uniprot_id}
                      </td>
                      <td className="px-4 py-3 text-sm">{analysis.method}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              analysis.status === "done"
                                ? "bg-green-100 text-green-800"
                                : analysis.status === "failed"
                                ? "bg-red-100 text-red-800"
                                : analysis.status === "cancelled"
                                ? "bg-orange-100 text-orange-800"
                                : analysis.status === "running"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {analysis.status}
                          </span>
                          {(analysis.status === "queued" ||
                            analysis.status === "running") &&
                            analysis.progress !== undefined && (
                              <div className="w-full">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                      width: `${Math.min(
                                        Math.max(analysis.progress, 0),
                                        100
                                      )}%`,
                                    }}
                                  ></div>
                                </div>
                                <p className="text-xs text-gray-600 mt-1">
                                  {Math.min(
                                    Math.max(analysis.progress, 0),
                                    100
                                  )}
                                  %
                                </p>
                              </div>
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "entries")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "length_percent")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "umf")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "mean_score")}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "cis_num")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                `/analysis/result?job_id=${analysis.id}`
                              )
                            }
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleDuplicate(analysis.id)}
                            className="text-green-600 hover:underline text-sm"
                          >
                            Duplicate
                          </button>
                          {(analysis.status === "queued" ||
                            analysis.status === "running") && (
                            <button
                              onClick={() => handleCancel(analysis.id)}
                              className="text-red-600 hover:underline text-sm font-medium"
                            >
                              終了
                            </button>
                          )}
                          {analysis.status === "done" && (
                            <button
                              onClick={() => handleRerun(analysis.id)}
                              className="text-purple-600 hover:underline text-sm"
                            >
                              Rerun
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(analysis.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    }>
      <HistoryContent />
    </Suspense>
  );
}
