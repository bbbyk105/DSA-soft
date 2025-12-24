"use client";

import { useEffect, useState, Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  listAnalyses,
  rerunAnalysis,
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

  // fetchAnalysesをuseCallbackでメモ化
  const fetchAnalyses = useCallback(async () => {
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
      setError(err instanceof Error ? err.message : "解析の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [uniprotId, method, status, fromDate, toDate]);

  // フィルター変更時にフェッチ
  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  // 進行中のジョブのIDリストをメモ化
  const runningJobIds = useMemo(
    () =>
      analyses
        .filter((a) => a.status === "queued" || a.status === "running")
        .map((a) => a.id)
        .join(","),
    [analyses]
  );

  // 進行中のジョブをポーリング
  useEffect(() => {
    if (!runningJobIds) return;

    const interval = setInterval(() => {
      fetchAnalyses();
    }, 2000); // 2秒ごとに更新

    return () => clearInterval(interval);
  }, [runningJobIds, fetchAnalyses]);

  const handleRerun = async (id: string) => {
    try {
      const result = await rerunAnalysis(id);
      router.push(`/analysis/result?job_id=${result.analysis_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "再実行に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("解析を削除しますか？この操作は取り消せません。")) {
      return;
    }
    try {
      console.log("[History] Deleting analysis:", id);
      console.log(
        "[History] API_BASE_URL:",
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
      );

      // 即座にローカル状態から削除（楽観的更新）
      setAnalyses((prev) => prev.filter((a) => a.id !== id));

      const result = await deleteAnalysis(id);
      console.log("[History] Analysis deleted successfully:", result);

      // 履歴を再取得して最新状態を反映
      await fetchAnalyses();
    } catch (err) {
      console.error("[History] Error deleting analysis:", err);
      console.error("[History] Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      // エラーが発生した場合は再取得して元に戻す
      await fetchAnalyses();

      const errorMessage =
        err instanceof Error ? err.message : "解析の削除に失敗しました";
      alert(
        `削除に失敗しました: ${errorMessage}\n\n詳細はブラウザのコンソールを確認してください。`
      );
    }
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

        <h1 className="text-3xl font-bold mb-8">解析履歴</h1>

        {/* 検索フィルター */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4">検索</h2>
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
              <label className="block text-sm font-medium mb-2">手法</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              >
                <option value="">すべて</option>
                <option value="X-ray">X-ray</option>
                <option value="all">すべて</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                ステータス
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              >
                <option value="">すべて</option>
                <option value="queued">待機中</option>
                <option value="running">実行中</option>
                <option value="done">完了</option>
                <option value="failed">失敗</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">開始日</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">終了日</label>
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
            <span className="text-blue-800">{compareIds.length} 件選択中</span>
            <button
              onClick={goToCompare}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              比較
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
            <p>読み込み中...</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>解析が見つかりませんでした。</p>
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
                      手法
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      ステータス
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      エントリ数
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      長さ%
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      UMF
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      平均スコア
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">
                      cis数
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
                            {analysis.status === "done"
                              ? "完了"
                              : analysis.status === "failed"
                              ? "失敗"
                              : analysis.status === "cancelled"
                              ? "キャンセル"
                              : analysis.status === "running"
                              ? "実行中"
                              : analysis.status === "queued"
                              ? "待機中"
                              : analysis.status}
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
                            開く
                          </button>
                          {analysis.status === "done" && (
                            <button
                              onClick={() => handleRerun(analysis.id)}
                              className="text-purple-600 hover:underline text-sm"
                            >
                              再実行
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
    <Suspense
      fallback={
        <div className="min-h-screen p-8 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <p>読み込み中...</p>
            </div>
          </div>
        </div>
      }
    >
      <HistoryContent />
    </Suspense>
  );
}
