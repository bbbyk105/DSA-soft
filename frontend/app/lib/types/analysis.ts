// Analysis types for the DSA application

export type AnalysisStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface AnalysisParams {
  uniprot_ids: string[];
  method: "all" | "X-ray";
  sequence_ratio: number;
  min_structures: number;
  cis_threshold: number;
  proc_cis: boolean;
  negative_pdb_ids?: string[];
}

export interface Metrics {
  entries?: number;
  chains?: number;
  length?: number;
  length_percent?: number;
  resolution?: number;
  umf?: number;
  mean_score?: number;
  mean_std?: number;
  cis_num?: number;
  cis_dist_mean?: number;
  cis_dist_std?: number;
}

export interface AnalysisSummary {
  id: string;
  uniprot_id: string;
  method: string;
  status: AnalysisStatus;
  created_at: string;
  progress?: number;
  metrics?: Metrics;
}

export interface AnalysisArtifacts {
  result_url?: string;
  heatmap_url?: string;
  scatter_url?: string;
  logs_url?: string;
}

export interface Analysis {
  summary: AnalysisSummary;
  params: AnalysisParams;
  metrics?: Metrics;
  artifacts?: AnalysisArtifacts;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
}

export interface CompareResponse {
  analyses: AnalysisSummary[];
}
