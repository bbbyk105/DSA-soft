const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface JobParams {
  sequence_ratio?: number;
  min_structures?: number;
  xray_only?: boolean;
  negative_pdbid?: string;
  cis_threshold?: number;
  proc_cis?: boolean;
}

export interface Job {
  job_id: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  message: string;
  result?: {
    json_url: string;
    heatmap_url: string;
    scatter_url: string;
  };
  error_message?: string;
}

export async function createJob(
  uniprotId: string,
  params: JobParams = {}
): Promise<{ job_id: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uniprot_id: uniprotId,
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create job");
  }

  return response.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get job");
  }

  return response.json();
}

export function getResultUrl(jobId: string, filename: string): string {
  return `${API_BASE_URL}/api/jobs/${jobId}/${filename}`;
}
