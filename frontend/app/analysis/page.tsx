"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createJob, getJob, type Job, type JobParams } from "@/lib/api";

export default function AnalysisPage() {
  const router = useRouter();
  const [uniprotId, setUniprotId] = useState("");
  const [params, setParams] = useState<JobParams>({
    sequence_ratio: 0.2,
    min_structures: 5,
    xray_only: true,
    negative_pdbid: "",
    cis_threshold: 3.3,
    proc_cis: true,
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    if (jobId) {
      const interval = setInterval(async () => {
        try {
          const jobData = await getJob(jobId);
          setJob(jobData);

          // 実際の進捗が現在表示より大きい場合は追いつかせる
          if (typeof jobData.progress === "number") {
            setDisplayProgress((prev) =>
              jobData.progress > prev ? jobData.progress : prev
            );
          }

          if (jobData.status === "done" || jobData.status === "failed") {
            clearInterval(interval);
            if (jobData.status === "done") {
              router.push(`/analysis/result?job_id=${jobId}`);
            }
          }
        } catch (err) {
          console.error("Failed to fetch job status:", err);
          clearInterval(interval);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [jobId, router]);

  // 擬似的にプログレスバーを滑らかに動かすエフェクト
  useEffect(() => {
    if (!job) return;

    // 完了 or 失敗時は確定値にする
    if (job.status === "done") {
      setDisplayProgress(100);
      return;
    }
    if (job.status === "failed") {
      // 失敗時は現在値を維持
      return;
    }

    // 実行中は 95% までゆっくり伸ばす
    const interval = setInterval(() => {
      setDisplayProgress((prev) => {
        if (prev >= 95) return prev;
        return prev + 2;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [job]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // UniProt IDのバリデーション（複数対応）
      const ids = uniprotId.split(/[,\s]+/).filter((id) => id.trim());
      if (ids.length === 0) {
        throw new Error("UniProt ID is required");
      }
      // 最初のIDのみ使用（複数対応は将来実装）
      const firstId = ids[0].trim().toUpperCase();
      if (
        !/^[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/.test(
          firstId
        )
      ) {
        throw new Error("Invalid UniProt ID format");
      }

      const result = await createJob(firstId, params);
      setJobId(result.job_id);
      setJob({
        job_id: result.job_id,
        status: result.status as Job["status"],
        progress: 0,
        message: "Job queued",
      });
      setDisplayProgress(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">DSA Analysis</h1>

        {!jobId ? (
          <form
            onSubmit={handleSubmit}
            className="bg-white p-8 rounded-lg shadow-md"
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
                  <p className="text-xs text-gray-500 mt-1">
                    cis判定の距離閾値
                  </p>
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isSubmitting ? "解析を開始中..." : "解析を開始"}
            </button>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">Job Status</h2>
            <div className="mb-4">
              <p className="text-sm text-gray-600">Job ID: {jobId}</p>
              <p className="text-sm text-gray-600">
                Status: {job?.status || "unknown"}
              </p>
              <p className="text-sm text-gray-600">
                Message: {job?.message || "Processing..."}
              </p>
            </div>

            {job && (
              <>
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${displayProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {Math.round(displayProgress)}%
                  </p>
                </div>

                {job.status === "failed" && (
                  <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
                    <p className="font-bold">Error:</p>
                    <p>{job.error_message || "Analysis failed"}</p>
                  </div>
                )}

                {job.status === "done" && (
                  <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded mb-4">
                    <p>Analysis completed successfully!</p>
                    <button
                      onClick={() =>
                        router.push(`/analysis/result?job_id=${jobId}`)
                      }
                      className="mt-2 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
                    >
                      View Results
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
