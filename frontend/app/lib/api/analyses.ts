import type {
  Analysis,
  AnalysisSummary,
  AnalysisParams,
} from "@/app/lib/types/analysis";

export type { AnalysisSummary };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface ListAnalysesFilters {
  uniprot_id?: string;
  method?: string;
  status?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  limit?: number;
  offset?: number;
}

export interface RerunOverrides {
  method?: "all" | "X-ray";
  sequence_ratio?: number;
  min_structures?: number;
  cis_threshold?: number;
  proc_cis?: boolean;
  negative_pdb_ids?: string[];
}

/**
 * List analyses with optional filters
 */
export async function listAnalyses(
  filters?: ListAnalysesFilters
): Promise<AnalysisSummary[]> {
  const params = new URLSearchParams();
  if (filters?.uniprot_id) params.append("uniprot_id", filters.uniprot_id);
  if (filters?.method) params.append("method", filters.method);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.from) params.append("from", filters.from);
  if (filters?.to) params.append("to", filters.to);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  if (filters?.offset) params.append("offset", filters.offset.toString());

  const url = `${API_BASE_URL}/api/analyses${
    params.toString() ? `?${params.toString()}` : ""
  }`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to list analyses" }));
    throw new Error(error.error || "Failed to list analyses");
  }

  return response.json();
}

/**
 * Get a single analysis by ID
 */
export async function getAnalysis(id: string): Promise<Analysis> {
  const response = await fetch(`${API_BASE_URL}/api/analyses/${id}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to get analysis" }));
    throw new Error(error.error || "Failed to get analysis");
  }

  return response.json();
}

/**
 * Rerun an analysis (create a new analysis with same or overridden params)
 */
export async function rerunAnalysis(
  id: string,
  overrides?: RerunOverrides
): Promise<{ analysis_id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyses/${id}/rerun`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(overrides || {}),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to rerun analysis" }));
    throw new Error(error.error || "Failed to rerun analysis");
  }

  return response.json();
}

/**
 * Compare multiple analyses
 */
export async function compareAnalyses(
  ids: string[]
): Promise<AnalysisSummary[]> {
  const params = new URLSearchParams();
  params.append("ids", ids.join(","));

  const response = await fetch(
    `${API_BASE_URL}/api/analyses/compare?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to compare analyses" }));
    throw new Error(error.error || "Failed to compare analyses");
  }

  const data = await response.json();
  return data.analyses || [];
}

/**
 * Cancel a running or queued analysis
 */
export async function cancelAnalysis(
  id: string
): Promise<{ message: string; analysis_id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/analyses/${id}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to cancel analysis" }));
    throw new Error(error.error || "Failed to cancel analysis");
  }

  return response.json();
}

/**
 * Delete an analysis
 */
export async function deleteAnalysis(
  id: string
): Promise<{ message: string; analysis_id: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/analyses/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
      throw new Error(error.error || "Failed to delete analysis");
    }

    return response.json();
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error("ネットワークエラー: バックエンドに接続できませんでした");
    }
    throw err;
  }
}
