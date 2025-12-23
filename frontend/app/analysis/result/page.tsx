"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getJob, getResultUrl, type Job } from "@/lib/api";

function ResultContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "heatmap" | "scatter">(
    "summary"
  );

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
            getResultUrl(jobId, "result.json")
          );
          if (resultResponse.ok) {
            try {
              const text = await resultResponse.text();
              // 空文字列や余分な文字を除去
              const cleanedText = text.trim();
              if (cleanedText) {
                const resultData = JSON.parse(cleanedText);
                setResult(resultData);
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
                }`
              );
            }
          } else {
            setError(
              `Failed to fetch result: ${resultResponse.status} ${resultResponse.statusText}`
            );
          }
        } else if (jobData.status === "failed") {
          setError(jobData.error_message || "Analysis failed");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch results"
        );
      }
    };

    fetchData();
  }, [jobId]);

  if (error) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded">
            <p className="font-bold">Error:</p>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!job || !result) {
    return (
      <div className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const stats = result.statistics || {};
  const cisAnalysis = stats.cis_analysis || {};
  const scoreSummary = result.score_summary || {};

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">
          DSA 解析結果 - {stats.uniprot_id || result.uniprot_id}
        </h1>
        <p className="text-sm text-gray-600 mb-8">ジョブ ID: {jobId}</p>

        {/* タブ */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab("summary")}
                className={`px-6 py-3 font-medium ${
                  activeTab === "summary"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                解析概要
              </button>
              <button
                onClick={() => setActiveTab("heatmap")}
                className={`px-6 py-3 font-medium ${
                  activeTab === "heatmap"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                ヒートマップ
              </button>
              <button
                onClick={() => setActiveTab("scatter")}
                className={`px-6 py-3 font-medium ${
                  activeTab === "scatter"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Distance-Score Plot
              </button>
            </nav>
          </div>

          {/* コンテンツ */}
          <div className="p-6">
            {activeTab === "summary" && (
              <div className="space-y-6">
                {/* 解析概要 Overview */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-2xl font-bold mb-4">解析概要 Overview</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">UniProt ID</p>
                      <p className="text-lg font-semibold">
                        {stats.uniprot_id || result.uniprot_id}
                      </p>
                    </div>
                    {stats.entries && (
                      <div>
                        <p className="text-sm text-gray-600">
                          エントリ数 (Entries)
                        </p>
                        <p className="text-lg font-semibold">{stats.entries}</p>
                      </div>
                    )}
                    {stats.chains && (
                      <div>
                        <p className="text-sm text-gray-600">
                          チェーン数 (Chains)
                        </p>
                        <p className="text-lg font-semibold">{stats.chains}</p>
                      </div>
                    )}
                    {stats.length && (
                      <div>
                        <p className="text-sm text-gray-600">残基数 (Length)</p>
                        <p className="text-lg font-semibold">{stats.length}</p>
                      </div>
                    )}
                    {stats.length_percent && (
                      <div>
                        <p className="text-sm text-gray-600">
                          残基カバレッジ (Length%)
                        </p>
                        <p className="text-lg font-semibold">
                          {stats.length_percent}%
                        </p>
                      </div>
                    )}
                    {stats.resolution && (
                      <div>
                        <p className="text-sm text-gray-600">
                          分解能 (Resolution)
                        </p>
                        <p className="text-lg font-semibold">
                          {stats.resolution} Å
                        </p>
                      </div>
                    )}
                    {stats.umf && (
                      <div>
                        <p className="text-sm text-gray-600">UMF</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {stats.umf}
                        </p>
                      </div>
                    )}
                    {scoreSummary.mean_score && (
                      <div>
                        <p className="text-sm text-gray-600">
                          ペアスコア平均 (Average Pair Score)
                        </p>
                        <p className="text-lg font-semibold">
                          {scoreSummary.mean_score.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {scoreSummary.mean_std && (
                      <div>
                        <p className="text-sm text-gray-600">
                          ペアスコア標準偏差 (Pair Score Standard Deviation)
                        </p>
                        <p className="text-lg font-semibold">
                          {scoreSummary.mean_std.toFixed(2)}
                        </p>
                      </div>
                    )}
                    {cisAnalysis.cis_num !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600">
                          Cisペア数 (Cis Pair Count)
                        </p>
                        <p className="text-lg font-semibold text-purple-600">
                          {cisAnalysis.cis_num}
                        </p>
                      </div>
                    )}
                    {cisAnalysis.cis_num !== undefined && stats.length && (
                      <div>
                        <p className="text-sm text-gray-600">Cis/Length(%)</p>
                        <p className="text-lg font-semibold">
                          {((cisAnalysis.cis_num / stats.length) * 100).toFixed(
                            2
                          )}
                          %
                        </p>
                      </div>
                    )}
                    {cisAnalysis.mix !== undefined && (
                      <div>
                        <p className="text-sm text-gray-600">
                          Mix (Cis/Trans混在)
                        </p>
                        <p className="text-lg font-semibold text-orange-600">
                          {cisAnalysis.mix}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 使用PDB IDリスト */}
                  {stats.pdb_ids && stats.pdb_ids.length > 0 && (
                    <div className="mt-6">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        使用 PDB ID
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stats.pdb_ids.map((pdbId: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-gray-100 rounded text-sm"
                          >
                            {pdbId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cisペプチド結合解析結果 */}
                {cisAnalysis.cis_num !== undefined &&
                  cisAnalysis.cis_num > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h2 className="text-2xl font-bold mb-4">
                        Cisペプチド結合解析結果
                      </h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-600">
                            Cisペア数 (Cis Pair Count)
                          </p>
                          <p className="text-lg font-semibold text-purple-600">
                            {cisAnalysis.cis_num}
                          </p>
                        </div>
                        {cisAnalysis.cis_dist_mean !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600">
                              平均Cis距離 (Average Cis Distance)
                            </p>
                            <p className="text-lg font-semibold">
                              {cisAnalysis.cis_dist_mean} Å
                            </p>
                          </div>
                        )}
                        {cisAnalysis.cis_dist_std !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600">
                              Cis距離標準偏差 (Cis Distance Standard Deviation)
                            </p>
                            <p className="text-lg font-semibold">
                              {cisAnalysis.cis_dist_std} Å
                            </p>
                          </div>
                        )}
                        {cisAnalysis.cis_score_mean !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600">
                              平均Cisスコア (Average Cis Score)
                            </p>
                            <p className="text-lg font-semibold">
                              {cisAnalysis.cis_score_mean}
                            </p>
                          </div>
                        )}
                        {cisAnalysis.mix !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600">
                              Mix (Cis/Trans混在)
                            </p>
                            <p className="text-lg font-semibold text-orange-600">
                              {cisAnalysis.mix}
                            </p>
                          </div>
                        )}
                        {cisAnalysis.threshold !== undefined && (
                          <div>
                            <p className="text-sm text-gray-600">
                              閾値 (Threshold)
                            </p>
                            <p className="text-lg font-semibold">
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
                            <p className="text-sm text-gray-600">
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
                        )}
                    </div>
                  )}
              </div>
            )}

            {activeTab === "heatmap" && (
              <div>
                <h2 className="text-2xl font-bold mb-4">DSA Score Heatmap</h2>
                {job.result?.heatmap_url && (
                  <div className="flex justify-center">
                    <img
                      src={getResultUrl(jobId!, "heatmap.png")}
                      alt="DSA Score Heatmap"
                      className="max-w-full h-auto rounded-lg shadow-md"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "scatter" && (
              <div>
                <h2 className="text-2xl font-bold mb-4">Distance-Score Plot</h2>
                {job.result?.scatter_url && (
                  <div className="flex justify-center">
                    <img
                      src={getResultUrl(jobId!, "dist_score.png")}
                      alt="Distance vs Score"
                      className="max-w-full h-auto rounded-lg shadow-md"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8 bg-gray-50">
          <div className="max-w-6xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md">
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
