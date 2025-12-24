"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { compareAnalyses, listAnalyses, type AnalysisSummary } from "@/app/lib/api/analyses";

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalSelectedIds, setModalSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      setError("No analysis IDs provided");
      setLoading(false);
      return;
    }

    const ids = idsParam.split(",").filter(Boolean);
    if (ids.length === 0) {
      setError("No valid analysis IDs");
      setLoading(false);
      return;
    }

    setSelectedIds(ids);
    fetchComparisons(ids);
    fetchAllAnalyses();
  }, [searchParams]);

  const fetchComparisons = async (ids: string[]) => {
    setLoading(true);
    setError(null);

    try {
      const data = await compareAnalyses(ids);
      setAnalyses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch comparisons");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAnalyses = async () => {
    try {
      const data = await listAnalyses({ limit: 100 });
      setAllAnalyses(data);
    } catch (err) {
      console.error("Failed to fetch all analyses:", err);
    }
  };

  const removeAnalysis = (idToRemove: string) => {
    const newIds = selectedIds.filter((id) => id !== idToRemove);
    if (newIds.length === 0) {
      router.push("/analysis/history");
      return;
    }
    updateUrlAndFetch(newIds);
  };

  const addAnalyses = () => {
    if (modalSelectedIds.length === 0) return;
    const newIds = [...new Set([...selectedIds, ...modalSelectedIds])];
    updateUrlAndFetch(newIds);
    setShowAddModal(false);
    setModalSelectedIds([]);
  };

  const toggleModalSelection = (id: string) => {
    setModalSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const updateUrlAndFetch = (ids: string[]) => {
    setSelectedIds(ids);
    const newUrl = `/analysis/compare?ids=${ids.join(",")}`;
    router.push(newUrl);
    fetchComparisons(ids);
  };

  const formatMetric = (metrics: any, key: string): string => {
    if (!metrics || metrics[key] === undefined || metrics[key] === null) {
      return "-";
    }
    const value = metrics[key];
    if (typeof value === "number") {
      if (key.includes("percent") || key === "mean_score" || key === "mean_std" || key.includes("dist")) {
        return value.toFixed(2);
      }
      return value.toString();
    }
    return String(value);
  };

  const formatDiff = (base: any, current: any, key: string): string => {
    if (!base || !current) return "";
    const baseValue = base[key];
    const currentValue = current[key];
    if (baseValue === undefined || currentValue === undefined || baseValue === null || currentValue === null) {
      return "";
    }
    if (typeof baseValue === "number" && typeof currentValue === "number") {
      const diff = currentValue - baseValue;
      if (diff === 0) return "";
      const sign = diff > 0 ? "+" : "";
      return `(${sign}${diff.toFixed(2)})`;
    }
    return "";
  };

  const baseAnalysis = analyses.length > 0 ? analyses[0] : null;
  const availableAnalyses = allAnalyses.filter(
    (a) => !selectedIds.includes(a.id) && a.status === "done"
  );

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/analysis/history"
            className="inline-flex items-center text-blue-600 hover:underline"
          >
            <span className="mr-1">←</span>
            History に戻る
          </Link>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            + 解析を追加 / Add Analysis
          </button>
        </div>

        <h1 className="text-3xl font-bold mb-8">解析比較 / Analysis Compare</h1>

        {analyses.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded">
            {analyses.length} 件の解析を比較中 / Comparing {analyses.length} analyses
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>Loading...</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>No analyses to compare.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium border-r">指標 / Metric</th>
                    {analyses.map((analysis) => (
                      <th key={analysis.id} className="px-4 py-3 text-left text-sm font-medium relative">
                        <button
                          onClick={() => removeAnalysis(analysis.id)}
                          className="absolute top-1 right-1 text-red-600 hover:text-red-800 text-lg font-bold"
                          title="削除 / Remove"
                        >
                          ×
                        </button>
                        <div className="font-bold">{analysis.uniprot_id}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(analysis.created_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">{analysis.method}</div>
                        <button
                          onClick={() => router.push(`/analysis/result?job_id=${analysis.id}`)}
                          className="mt-2 text-blue-600 hover:underline text-xs"
                        >
                          View
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Entries</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "entries")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "entries")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Chains</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "chains")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "chains")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Length%</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "length_percent")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "length_percent")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">UMF</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "umf")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "umf")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">mean_score</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "mean_score")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "mean_score")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">cis_num</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "cis_num")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "cis_num")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">cis_dist_mean</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "cis_dist_mean")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "cis_dist_mean")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Resolution</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "resolution")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "resolution")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">mean_std</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "mean_std")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "mean_std")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">cis_dist_std</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {formatMetric(analysis.metrics, "cis_dist_std")}
                        {baseAnalysis && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDiff(baseAnalysis.metrics, analysis.metrics, "cis_dist_std")}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Created At</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {new Date(analysis.created_at).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium border-r">Method</td>
                    {analyses.map((analysis) => (
                      <td key={analysis.id} className="px-4 py-3 text-sm">
                        {analysis.method}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add Analysis Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-2xl font-bold">解析を追加 / Add Analysis</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setModalSelectedIds([]);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {availableAnalyses.length === 0 ? (
                  <p className="text-gray-500">追加できる解析がありません。</p>
                ) : (
                  <div className="space-y-2">
                    {availableAnalyses.map((analysis) => (
                      <label
                        key={analysis.id}
                        className="flex items-center p-3 border rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={modalSelectedIds.includes(analysis.id)}
                          onChange={() => toggleModalSelection(analysis.id)}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{analysis.uniprot_id}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(analysis.created_at).toLocaleString()} - {analysis.method}
                          </div>
                          <div className="text-xs text-gray-400">
                            Entries: {formatMetric(analysis.metrics, "entries")} | 
                            Length%: {formatMetric(analysis.metrics, "length_percent")} | 
                            UMF: {formatMetric(analysis.metrics, "umf")}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-6 border-t flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {modalSelectedIds.length} 件選択中 / {modalSelectedIds.length} selected
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setModalSelectedIds([]);
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    キャンセル / Cancel
                  </button>
                  <button
                    onClick={addAnalyses}
                    disabled={modalSelectedIds.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    追加 / Add ({modalSelectedIds.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
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
      <CompareContent />
    </Suspense>
  );
}

