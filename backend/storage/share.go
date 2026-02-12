package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type ShareRecord struct {
	ID                 string
	ShareID            string
	AnalysisID         string
	CreatedAt          time.Time
	ExpiresAt          time.Time
	CreatedBySessionID *string
}

type ShareMeta struct {
	ShareID    string    `json:"share_id"`
	AnalysisID string    `json:"analysis_id"`
	UniProtID  string    `json:"uniprot_id"`
	Method     string    `json:"method"`
	CreatedAt  time.Time `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
	Metrics    map[string]interface{} `json:"metrics,omitempty"`
	ExpiresAt  time.Time `json:"expires_at"`
}

func (d *DB) CreateShare(analysisID string, shareToken string, expiresAt time.Time, createdBySessionID string) (*ShareRecord, error) {
	if d == nil || d.sql == nil {
		return nil, fmt.Errorf("db not initialized")
	}
	id := uuid.New()
	now := time.Now()

	var createdBy *string
	if createdBySessionID != "" {
		createdBy = &createdBySessionID
	}

	_, err := d.sql.Exec(`
		INSERT INTO shares (id, share_id, analysis_id, created_at, expires_at, created_by_session_id)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, id, shareToken, analysisID, now, expiresAt, createdBy)
	if err != nil {
		return nil, fmt.Errorf("insert share: %w", err)
	}

	return &ShareRecord{
		ID:                 id.String(),
		ShareID:            shareToken,
		AnalysisID:         analysisID,
		CreatedAt:          now,
		ExpiresAt:          expiresAt,
		CreatedBySessionID: createdBy,
	}, nil
}

// GetShareMetaByToken returns share meta for external display and the expires_at for 410 checks.
// If not found, it returns sql.ErrNoRows.
func (d *DB) GetShareMetaByToken(shareToken string) (*ShareMeta, error) {
	if d == nil || d.sql == nil {
		return nil, fmt.Errorf("db not initialized")
	}

	row := d.sql.QueryRow(`
		SELECT
			s.share_id,
			s.analysis_id,
			a.uniprot_id,
			a.method,
			a.created_at,
			a.finished_at,
			a.metrics,
			s.expires_at
		FROM shares s
		JOIN analyses a ON a.id = s.analysis_id
		WHERE s.share_id = $1
	`, shareToken)

	var meta ShareMeta
	var metricsBytes []byte
	if err := row.Scan(
		&meta.ShareID,
		&meta.AnalysisID,
		&meta.UniProtID,
		&meta.Method,
		&meta.CreatedAt,
		&meta.FinishedAt,
		&metricsBytes,
		&meta.ExpiresAt,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, err
		}
		return nil, fmt.Errorf("scan share meta: %w", err)
	}

	if len(metricsBytes) > 0 {
		meta.Metrics = make(map[string]interface{})
		// ignore parse error: keep it empty for public response
		_ = json.Unmarshal(metricsBytes, &meta.Metrics)
	}
	return &meta, nil
}

// GetShareAnalysisID returns the analysis_id and expires_at for a share token.
func (d *DB) GetShareAnalysisID(shareToken string) (analysisID string, expiresAt time.Time, err error) {
	if d == nil || d.sql == nil {
		return "", time.Time{}, fmt.Errorf("db not initialized")
	}

	row := d.sql.QueryRow(`SELECT analysis_id, expires_at FROM shares WHERE share_id = $1`, shareToken)
	if err := row.Scan(&analysisID, &expiresAt); err != nil {
		if err == sql.ErrNoRows {
			return "", time.Time{}, err
		}
		return "", time.Time{}, fmt.Errorf("scan share: %w", err)
	}
	return analysisID, expiresAt, nil
}

