package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type AnalysisRecord struct {
	ID        string
	UniProtID string
	Method    string
	Status    string
	Params    map[string]interface{}

	CreatedAt  time.Time
	StartedAt  *time.Time
	FinishedAt *time.Time
	Progress   *int
	Metrics    map[string]interface{}

	ErrorMessage *string

	R2Prefix   *string
	ResultKey  *string
	HeatmapKey *string
	ScatterKey *string
	LogsKey    *string

	BackendVersion *string
	GitCommit      *string

	SessionID string
}

func (d *DB) CreateAnalysis(r *AnalysisRecord) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}
	if r == nil {
		return fmt.Errorf("analysis record is nil")
	}

	paramsJSON, err := json.Marshal(r.Params)
	if err != nil {
		return fmt.Errorf("marshal params: %w", err)
	}

	_, err = d.sql.Exec(
		`INSERT INTO analyses
			(id, uniprot_id, method, status, params, created_at, session_id)
		  VALUES ($1,$2,$3,$4,$5,$6,$7)
		  ON CONFLICT (id) DO NOTHING`,
		r.ID, r.UniProtID, r.Method, r.Status, paramsJSON, r.CreatedAt, nullIfEmpty(r.SessionID),
	)
	if err != nil {
		return fmt.Errorf("insert analysis: %w", err)
	}
	return nil
}

func (d *DB) GetAnalysis(id string) (*AnalysisRecord, error) {
	if d == nil || d.sql == nil {
		return nil, fmt.Errorf("db not initialized")
	}

	row := d.sql.QueryRow(`
		SELECT
			id, uniprot_id, method, status, params,
			created_at, started_at, finished_at, progress, metrics,
			error_message,
			r2_prefix, result_key, heatmap_key, scatter_key, logs_key,
			backend_version, git_commit,
			COALESCE(session_id, '')
		FROM analyses
		WHERE id = $1
	`, id)

	var rec AnalysisRecord
	var paramsBytes []byte
	var metricsBytes []byte

	err := row.Scan(
		&rec.ID, &rec.UniProtID, &rec.Method, &rec.Status, &paramsBytes,
		&rec.CreatedAt, &rec.StartedAt, &rec.FinishedAt, &rec.Progress, &metricsBytes,
		&rec.ErrorMessage,
		&rec.R2Prefix, &rec.ResultKey, &rec.HeatmapKey, &rec.ScatterKey, &rec.LogsKey,
		&rec.BackendVersion, &rec.GitCommit,
		&rec.SessionID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("scan analysis: %w", err)
	}

	rec.Params = make(map[string]interface{})
	if len(paramsBytes) > 0 {
		_ = json.Unmarshal(paramsBytes, &rec.Params)
	}
	if len(metricsBytes) > 0 {
		rec.Metrics = make(map[string]interface{})
		_ = json.Unmarshal(metricsBytes, &rec.Metrics)
	}
	return &rec, nil
}

func (d *DB) ListAnalyses(filters map[string]interface{}) ([]*AnalysisRecord, error) {
	if d == nil || d.sql == nil {
		return nil, fmt.Errorf("db not initialized")
	}

	where := make([]string, 0)
	args := make([]interface{}, 0)
	arg := func(v interface{}) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if v, ok := filters["session_id"].(string); ok && v != "" {
		where = append(where, "session_id = "+arg(v))
	}
	if v, ok := filters["uniprot_id"].(string); ok && v != "" {
		where = append(where, "uniprot_id ILIKE "+arg("%"+v+"%"))
	}
	if v, ok := filters["method"].(string); ok && v != "" {
		where = append(where, "method = "+arg(v))
	}
	if v, ok := filters["status"].(string); ok && v != "" {
		where = append(where, "status = "+arg(v))
	}
	if v, ok := filters["from"].(string); ok && v != "" {
		where = append(where, "created_at >= "+arg(v))
	}
	if v, ok := filters["to"].(string); ok && v != "" {
		// include the date by treating it as end of day
		where = append(where, "created_at <= "+arg(v))
	}

	limit := 100
	if v, ok := filters["limit"].(int); ok && v > 0 {
		limit = v
	}
	offset := 0
	if v, ok := filters["offset"].(int); ok && v >= 0 {
		offset = v
	}

	query := `
		SELECT
			id, uniprot_id, method, status, params,
			created_at, started_at, finished_at, progress, metrics,
			error_message,
			r2_prefix, result_key, heatmap_key, scatter_key, logs_key,
			backend_version, git_commit,
			COALESCE(session_id, '')
		FROM analyses
	`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY created_at DESC "
	query += fmt.Sprintf(" LIMIT %s OFFSET %s", arg(limit), arg(offset))

	rows, err := d.sql.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("query analyses: %w", err)
	}
	defer rows.Close()

	var out []*AnalysisRecord
	for rows.Next() {
		var rec AnalysisRecord
		var paramsBytes []byte
		var metricsBytes []byte
		if err := rows.Scan(
			&rec.ID, &rec.UniProtID, &rec.Method, &rec.Status, &paramsBytes,
			&rec.CreatedAt, &rec.StartedAt, &rec.FinishedAt, &rec.Progress, &metricsBytes,
			&rec.ErrorMessage,
			&rec.R2Prefix, &rec.ResultKey, &rec.HeatmapKey, &rec.ScatterKey, &rec.LogsKey,
			&rec.BackendVersion, &rec.GitCommit,
			&rec.SessionID,
		); err != nil {
			return nil, fmt.Errorf("scan analyses: %w", err)
		}
		rec.Params = make(map[string]interface{})
		if len(paramsBytes) > 0 {
			_ = json.Unmarshal(paramsBytes, &rec.Params)
		}
		if len(metricsBytes) > 0 {
			rec.Metrics = make(map[string]interface{})
			_ = json.Unmarshal(metricsBytes, &rec.Metrics)
		}
		out = append(out, &rec)
	}
	return out, rows.Err()
}

func (d *DB) CountAnalyses() (int, error) {
	if d == nil || d.sql == nil {
		return 0, fmt.Errorf("db not initialized")
	}
	var n int
	if err := d.sql.QueryRow(`SELECT COUNT(*) FROM analyses`).Scan(&n); err != nil {
		return 0, fmt.Errorf("count analyses: %w", err)
	}
	return n, nil
}

func (d *DB) GetOldestAnalysis() (*AnalysisRecord, error) {
	if d == nil || d.sql == nil {
		return nil, fmt.Errorf("db not initialized")
	}
	row := d.sql.QueryRow(`
		SELECT id, uniprot_id, method, status, params, created_at,
		       started_at, finished_at, progress, metrics, error_message,
		       r2_prefix, result_key, heatmap_key, scatter_key, logs_key,
		       backend_version, git_commit,
		       COALESCE(session_id,'')
		FROM analyses
		ORDER BY created_at ASC
		LIMIT 1
	`)
	var rec AnalysisRecord
	var paramsBytes []byte
	var metricsBytes []byte
	err := row.Scan(
		&rec.ID, &rec.UniProtID, &rec.Method, &rec.Status, &paramsBytes, &rec.CreatedAt,
		&rec.StartedAt, &rec.FinishedAt, &rec.Progress, &metricsBytes, &rec.ErrorMessage,
		&rec.R2Prefix, &rec.ResultKey, &rec.HeatmapKey, &rec.ScatterKey, &rec.LogsKey,
		&rec.BackendVersion, &rec.GitCommit,
		&rec.SessionID,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get oldest analysis: %w", err)
	}
	rec.Params = make(map[string]interface{})
	if len(paramsBytes) > 0 {
		_ = json.Unmarshal(paramsBytes, &rec.Params)
	}
	if len(metricsBytes) > 0 {
		rec.Metrics = make(map[string]interface{})
		_ = json.Unmarshal(metricsBytes, &rec.Metrics)
	}
	return &rec, nil
}

func (d *DB) UpdateAnalysisStatus(id string, status string, progress *int, message string, startedAt *time.Time) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}

	// finished_at is set when transitioning to a terminal state.
	var finishedAt *time.Time
	if status == "done" || status == "failed" || status == "cancelled" {
		now := time.Now()
		finishedAt = &now
	}

	_, err := d.sql.Exec(`
		UPDATE analyses
		SET status = $2,
		    progress = COALESCE($3, progress),
		    started_at = COALESCE($4, started_at),
		    finished_at = COALESCE($5, finished_at)
		WHERE id = $1
	`, id, status, progress, startedAt, finishedAt)
	if err != nil {
		return fmt.Errorf("update analysis status: %w", err)
	}
	return nil
}

func (d *DB) FailAnalysis(id string, errorMessage string) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}
	now := time.Now()
	_, err := d.sql.Exec(`
		UPDATE analyses
		SET status = 'failed',
		    error_message = $2,
		    finished_at = $3
		WHERE id = $1
	`, id, errorMessage, now)
	if err != nil {
		return fmt.Errorf("fail analysis: %w", err)
	}
	return nil
}

func (d *DB) CompleteAnalysis(id string, metrics map[string]interface{}, r2Prefix, resultKey, heatmapKey, scatterKey, logsKey string) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}
	now := time.Now()
	metricsJSON, _ := json.Marshal(metrics)

	_, err := d.sql.Exec(`
		UPDATE analyses
		SET status = 'done',
		    metrics = COALESCE($2, metrics),
		    r2_prefix = NULLIF($3,''),
		    result_key = NULLIF($4,''),
		    heatmap_key = NULLIF($5,''),
		    scatter_key = NULLIF($6,''),
		    logs_key = NULLIF($7,''),
		    finished_at = $8
		WHERE id = $1
	`, id, metricsJSON, r2Prefix, resultKey, heatmapKey, scatterKey, logsKey, now)
	if err != nil {
		return fmt.Errorf("complete analysis: %w", err)
	}
	return nil
}

func (d *DB) UpdateMetricsFromResult(id string, metrics map[string]interface{}) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}
	metricsJSON, _ := json.Marshal(metrics)
	_, err := d.sql.Exec(`
		UPDATE analyses
		SET metrics = $2
		WHERE id = $1
	`, id, metricsJSON)
	if err != nil {
		return fmt.Errorf("update metrics: %w", err)
	}
	return nil
}

func (d *DB) DeleteAnalysis(id string) error {
	if d == nil || d.sql == nil {
		return fmt.Errorf("db not initialized")
	}
	_, err := d.sql.Exec(`DELETE FROM analyses WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete analysis: %w", err)
	}
	return nil
}

func nullIfEmpty(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

