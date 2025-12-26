package api

import (
	"context"
	"dsa-api/jobs"
	"dsa-api/storage"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type Routes struct {
	jobManager *jobs.Manager
	db         *storage.DB
	r2         *storage.R2Client
	ctx        context.Context
	storageDir string
}

func NewRoutes(jobManager *jobs.Manager, db *storage.DB, r2 *storage.R2Client) *Routes {
	return &Routes{
		jobManager: jobManager,
		db:         db,
		r2:         r2,
		ctx:        context.Background(),
		storageDir: jobManager.GetStorageDir(),
	}
}

type CreateJobRequest struct {
	UniProtID string                 `json:"uniprot_id"`
	Params    map[string]interface{} `json:"params"`
}

func (r *Routes) SetupRoutes(app *fiber.App) {
	api := app.Group("/api")

	// ジョブ作成
	api.Post("/jobs", r.createJob)

	// ジョブ状態取得
	api.Get("/jobs/:id", r.getJob)

	// 結果ファイル取得
	api.Get("/jobs/:id/result.json", r.getResultJSON)
	api.Get("/jobs/:id/heatmap.png", r.getHeatmap)
	api.Get("/jobs/:id/dist_score.png", r.getScatter)
	
	// PDBファイル取得
	api.Get("/jobs/:id/pdb/:pdbid", r.getPDBFile)
	api.Get("/jobs/:id/pdb-list", r.getPDBList)

	// Analysis API (Phase 2)
	// より具体的なルートを先に定義（パラメータ付きルートより前に）
	api.Get("/analyses", r.listAnalyses)
	api.Get("/analyses/compare", r.compareAnalyses)
	
	// メトリクス更新（別パスで競合を回避）
	api.Post("/update-metrics", r.updateMetricsForAll)
	
	// Analysis API (Phase 1)
	// パラメータ付きルートは最後に定義
	api.Get("/analyses/:id/result", r.getAnalysisResult)
	api.Get("/analyses/:id/artifacts/:name", r.getAnalysisArtifact)
	api.Post("/analyses/:id/rerun", r.rerunAnalysis)
	api.Post("/analyses/:id/cancel", r.cancelAnalysis)
	api.Get("/analyses/:id", r.getAnalysis)
	api.Delete("/analyses/:id", r.deleteAnalysis)
}

func (r *Routes) createJob(c *fiber.Ctx) error {
	var req CreateJobRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.UniProtID == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "uniprot_id is required",
		})
	}

	// デフォルトパラメータ
	params := req.Params
	if params == nil {
		params = make(map[string]interface{})
	}
	if _, ok := params["sequence_ratio"]; !ok {
		params["sequence_ratio"] = 0.7
	}
	if _, ok := params["min_structures"]; !ok {
		params["min_structures"] = 5
	}
	if _, ok := params["xray_only"]; !ok {
		params["xray_only"] = true
	}
	if _, ok := params["negative_pdbid"]; !ok {
		params["negative_pdbid"] = ""
	}
	if _, ok := params["cis_threshold"]; !ok {
		params["cis_threshold"] = 3.3
	}
	if _, ok := params["proc_cis"]; !ok {
		params["proc_cis"] = true
	}

	// Cookie同意をチェック（オプショナル - 厳密にチェックしない）
	// CookieからセッションIDを取得、なければ生成
	sessionID := c.Cookies("dsa_session_id")
	if sessionID == "" {
		sessionID = uuid.New().String()
		// セッションIDをCookieに設定
		c.Cookie(&fiber.Cookie{
			Name:     "dsa_session_id",
			Value:    sessionID,
			Expires:  time.Now().Add(30 * 24 * time.Hour), // 30日間
			HTTPOnly: true,  // XSS対策
			SameSite: "Lax", // CSRF対策
			Secure:   false, // HTTPSの場合はtrueに
			Path:     "/",
		})
	}

	// パラメータにセッションIDを追加
	params["session_id"] = sessionID

	job, err := r.jobManager.CreateJob(req.UniProtID, params)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"job_id": job.ID,
		"status": job.Status,
	})
}

func (r *Routes) getJob(c *fiber.Ctx) error {
	jobID := c.Params("id")
	job, err := r.jobManager.GetJob(jobID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Job not found",
		})
	}

	return c.JSON(job)
}

func (r *Routes) getResultJSON(c *fiber.Ctx) error {
	return r.serveFile(c, "result.json", "application/json")
}

func (r *Routes) getHeatmap(c *fiber.Ctx) error {
	return r.serveFile(c, "heatmap.png", "image/png")
}

func (r *Routes) getScatter(c *fiber.Ctx) error {
	return r.serveFile(c, "dist_score.png", "image/png")
}

func (r *Routes) getPDBFile(c *fiber.Ctx) error {
	jobID := c.Params("id")
	pdbID := c.Params("pdbid")
	
	job, err := r.jobManager.GetJob(jobID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Job not found",
		})
	}

	if job.Status != jobs.StatusDone {
		return c.Status(409).JSON(fiber.Map{
			"error": "File not ready",
			"status": job.Status,
		})
	}

	// PDBファイルのパスを取得 (work/pdb_files/{pdbid}.cif)
	storageDir := r.jobManager.GetStorageDir()
	pdbPath := filepath.Join(storageDir, jobID, "work", "pdb_files", fmt.Sprintf("%s.cif", pdbID))

	if _, err := os.Stat(pdbPath); os.IsNotExist(err) {
		return c.Status(404).JSON(fiber.Map{
			"error": "PDB file not found",
		})
	}

	c.Set("Content-Type", "chemical/x-cif")
	c.Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s.cif\"", pdbID))
	return c.SendFile(pdbPath)
}

func (r *Routes) getPDBList(c *fiber.Ctx) error {
	jobID := c.Params("id")
	
	job, err := r.jobManager.GetJob(jobID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Job not found",
		})
	}

	if job.Status != jobs.StatusDone {
		return c.Status(409).JSON(fiber.Map{
			"error": "Job not ready",
			"status": job.Status,
		})
	}

	// result.jsonからPDB IDリストを取得
	storageDir := r.jobManager.GetStorageDir()
	resultPath := filepath.Join(storageDir, jobID, "result.json")
	
	resultData, err := os.ReadFile(resultPath)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Result file not found",
		})
	}

	var result map[string]interface{}
	if err := json.Unmarshal(resultData, &result); err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": "Failed to parse result",
		})
	}

	stats, ok := result["statistics"].(map[string]interface{})
	if !ok {
		return c.Status(500).JSON(fiber.Map{
			"error": "Invalid result format",
		})
	}

	pdbIDs, ok := stats["pdb_ids"].([]interface{})
	if !ok {
		// pdb_idsが存在しない場合は空配列を返す
		return c.JSON(fiber.Map{
			"pdb_ids": []string{},
		})
	}

	// interface{}のスライスをstringのスライスに変換
	pdbIDList := make([]string, 0, len(pdbIDs))
	for _, id := range pdbIDs {
		if str, ok := id.(string); ok {
			pdbIDList = append(pdbIDList, str)
		}
	}

	return c.JSON(fiber.Map{
		"pdb_ids": pdbIDList,
	})
}

func (r *Routes) serveFile(c *fiber.Ctx, filename, contentType string) error {
	jobID := c.Params("id")
	job, err := r.jobManager.GetJob(jobID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Job not found",
		})
	}

	if job.Status != jobs.StatusDone {
		return c.Status(409).JSON(fiber.Map{
			"error": "File not ready",
			"status": job.Status,
		})
	}

	// ファイルパスを取得
	storageDir := r.jobManager.GetStorageDir()
	filePath := filepath.Join(storageDir, jobID, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(404).JSON(fiber.Map{
			"error": "File not found",
		})
	}

	c.Set("Content-Type", contentType)
	c.Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", filename))
	return c.SendFile(filePath)
}

// Analysis API handlers

func (r *Routes) getAnalysis(c *fiber.Ctx) error {
	id := c.Params("id")

	// まずDBから取得を試みる
	if r.db != nil {
		record, err := r.db.GetAnalysis(id)
		if err == nil {
			// DBから取得できた場合
			response := r.analysisRecordToResponse(record)
			return c.JSON(response)
		}
	}

	// DBにない場合は既存のJob APIから取得
	job, err := r.jobManager.GetJob(id)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "Analysis not found",
		})
	}

	// JobをAnalysis形式に変換
	response := r.jobToAnalysisResponse(job)
	return c.JSON(response)
}

func (r *Routes) getAnalysisResult(c *fiber.Ctx) error {
	id := c.Params("id")

	// R2から取得を試みる
	if r.db != nil && r.r2 != nil {
		record, err := r.db.GetAnalysis(id)
		if err == nil && record.ResultKey != nil {
			data, err := r.r2.GetObject(r.ctx, *record.ResultKey)
			if err == nil {
				c.Set("Content-Type", "application/json")
				return c.Send(data)
			}
		}
	}

	// R2にない場合は既存のファイルシステムから取得
	return r.getResultJSON(c)
}

func (r *Routes) getAnalysisArtifact(c *fiber.Ctx) error {
	id := c.Params("id")
	name := c.Params("name")

	// R2から取得を試みる
	if r.db != nil && r.r2 != nil {
		record, err := r.db.GetAnalysis(id)
		if err == nil {
			var key *string
			var contentType string

			switch name {
			case "heatmap.png":
				key = record.HeatmapKey
				contentType = "image/png"
			case "dist_score.png":
				key = record.ScatterKey
				contentType = "image/png"
			case "logs.txt":
				key = record.LogsKey
				contentType = "text/plain"
			}

			if key != nil {
				data, err := r.r2.GetObject(r.ctx, *key)
				if err == nil {
					c.Set("Content-Type", contentType)
					return c.Send(data)
				}
			}
		}
	}

	// R2にない場合は既存のファイルシステムから取得
	switch name {
	case "heatmap.png":
		return r.getHeatmap(c)
	case "dist_score.png":
		return r.getScatter(c)
	default:
		return c.Status(404).JSON(fiber.Map{
			"error": "Artifact not found",
		})
	}
}

func (r *Routes) analysisRecordToResponse(record *storage.AnalysisRecord) fiber.Map {
	summary := fiber.Map{
		"id":         record.ID,
		"uniprot_id": record.UniProtID,
		"method":     record.Method,
		"status":     record.Status,
		"created_at": record.CreatedAt.Format(time.RFC3339),
	}
	if record.Progress != nil {
		summary["progress"] = *record.Progress
	}
	response := fiber.Map{
		"summary": summary,
		"params":  record.Params,
	}

	if record.Metrics != nil {
		response["metrics"] = record.Metrics
		response["summary"].(fiber.Map)["metrics"] = record.Metrics
	}

	artifacts := fiber.Map{}
	if record.ResultKey != nil {
		if r.r2 != nil {
			// 署名URLを生成（10分有効）
			if url, err := r.r2.GetSignedURL(r.ctx, *record.ResultKey, 10*time.Minute); err == nil {
				artifacts["result_url"] = url
			} else if publicURL := r.r2.GetPublicURL(*record.ResultKey); publicURL != "" {
				artifacts["result_url"] = publicURL
			}
		} else {
			artifacts["result_url"] = fmt.Sprintf("/api/analyses/%s/result", record.ID)
		}
	}
	if record.HeatmapKey != nil {
		if r.r2 != nil {
			if url, err := r.r2.GetSignedURL(r.ctx, *record.HeatmapKey, 10*time.Minute); err == nil {
				artifacts["heatmap_url"] = url
			} else if publicURL := r.r2.GetPublicURL(*record.HeatmapKey); publicURL != "" {
				artifacts["heatmap_url"] = publicURL
			}
		} else {
			artifacts["heatmap_url"] = fmt.Sprintf("/api/analyses/%s/artifacts/heatmap.png", record.ID)
		}
	}
	if record.ScatterKey != nil {
		if r.r2 != nil {
			if url, err := r.r2.GetSignedURL(r.ctx, *record.ScatterKey, 10*time.Minute); err == nil {
				artifacts["scatter_url"] = url
			} else if publicURL := r.r2.GetPublicURL(*record.ScatterKey); publicURL != "" {
				artifacts["scatter_url"] = publicURL
			}
		} else {
			artifacts["scatter_url"] = fmt.Sprintf("/api/analyses/%s/artifacts/dist_score.png", record.ID)
		}
	}
	if len(artifacts) > 0 {
		response["artifacts"] = artifacts
	}

	if record.StartedAt != nil {
		response["started_at"] = record.StartedAt.Format(time.RFC3339)
	}
	if record.FinishedAt != nil {
		response["finished_at"] = record.FinishedAt.Format(time.RFC3339)
	}
	if record.ErrorMessage != nil {
		response["error_message"] = *record.ErrorMessage
	}

	return response
}

func (r *Routes) jobToAnalysisResponse(job *jobs.Job) fiber.Map {
	method := "all"
	if xrayOnly, ok := job.Params["xray_only"].(bool); ok && xrayOnly {
		method = "X-ray"
	}

	response := fiber.Map{
		"summary": fiber.Map{
			"id":         job.ID,
			"uniprot_id": job.UniProtID,
			"method":     method,
			"status":     string(job.Status),
			"created_at": job.CreatedAt.Format(time.RFC3339),
		},
		"params": job.Params,
	}

	if job.Result != nil {
		artifacts := fiber.Map{
			"result_url":   job.Result.JSONURL,
			"heatmap_url":  job.Result.HeatmapURL,
			"scatter_url":  job.Result.ScatterURL,
		}
		response["artifacts"] = artifacts
	}

	if job.ErrorMessage != "" {
		response["error_message"] = job.ErrorMessage
	}

	return response
}

func (r *Routes) listAnalyses(c *fiber.Ctx) error {
	if r.db == nil {
		// データベースが設定されていない場合は空配列を返す（後方互換性のため）
		return c.JSON([]fiber.Map{})
	}

	filters := make(map[string]interface{})

	// CookieからセッションIDを取得してフィルタに追加
	sessionID := c.Cookies("dsa_session_id")
	if sessionID != "" {
		filters["session_id"] = sessionID
	}

	if uniprotID := c.Query("uniprot_id"); uniprotID != "" {
		filters["uniprot_id"] = uniprotID
	}
	if method := c.Query("method"); method != "" {
		filters["method"] = method
	}
	if status := c.Query("status"); status != "" {
		filters["status"] = status
	}
	if from := c.Query("from"); from != "" {
		filters["from"] = from
	}
	if to := c.Query("to"); to != "" {
		filters["to"] = to
	}
	if limitStr := c.Query("limit"); limitStr != "" {
		var limit int
		if _, err := fmt.Sscanf(limitStr, "%d", &limit); err == nil && limit > 0 {
			filters["limit"] = limit
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		var offset int
		if _, err := fmt.Sscanf(offsetStr, "%d", &offset); err == nil && offset >= 0 {
			filters["offset"] = offset
		}
	}

	records, err := r.db.ListAnalyses(filters)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	summaries := make([]fiber.Map, 0, len(records))
	for _, record := range records {
		summary := fiber.Map{
			"id":         record.ID,
			"uniprot_id": record.UniProtID,
			"method":     record.Method,
			"status":     record.Status,
			"created_at": record.CreatedAt.Format(time.RFC3339),
		}
		if record.Progress != nil {
			summary["progress"] = *record.Progress
		}
		if record.Metrics != nil {
			summary["metrics"] = record.Metrics
		}
		summaries = append(summaries, summary)
	}

	return c.JSON(summaries)
}

func (r *Routes) rerunAnalysis(c *fiber.Ctx) error {
	id := c.Params("id")

	// 元の分析を取得
	var originalParams map[string]interface{}
	var uniprotID string

	if r.db != nil {
		record, err := r.db.GetAnalysis(id)
		if err == nil {
			originalParams = record.Params
			uniprotID = record.UniProtID
		}
	}

	// DBにない場合は既存のJob APIから取得
	if originalParams == nil {
		job, err := r.jobManager.GetJob(id)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error": "Analysis not found",
			})
		}
		originalParams = job.Params
		uniprotID = job.UniProtID
	}

	// オーバーライドを取得
	var overrides map[string]interface{}
	if err := c.BodyParser(&overrides); err != nil {
		overrides = make(map[string]interface{})
	}

	// パラメータをマージ（オーバーライド優先）
	params := make(map[string]interface{})
	for k, v := range originalParams {
		params[k] = v
	}
	for k, v := range overrides {
		params[k] = v
	}

	// 新しいジョブを作成
	job, err := r.jobManager.CreateJob(uniprotID, params)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"analysis_id": job.ID,
	})
}

func (r *Routes) compareAnalyses(c *fiber.Ctx) error {
	if r.db == nil {
		return c.Status(503).JSON(fiber.Map{
			"error": "Database not configured",
		})
	}

	idsParam := c.Query("ids")
	if idsParam == "" {
		return c.Status(400).JSON(fiber.Map{
			"error": "ids parameter is required",
		})
	}

	// idsパラメータをカンマ区切りで分割
	ids := make([]string, 0)
	for _, id := range strings.Split(idsParam, ",") {
		id = strings.TrimSpace(id)
		if id != "" {
			ids = append(ids, id)
		}
	}

	if len(ids) == 0 {
		return c.Status(400).JSON(fiber.Map{
			"error": "At least one id is required",
		})
	}

	// 各分析を取得
	summaries := make([]fiber.Map, 0, len(ids))
	for _, id := range ids {
		record, err := r.db.GetAnalysis(id)
		if err != nil {
			// エラーは無視して続行（古いレコード等）
			continue
		}

		summary := fiber.Map{
			"id":         record.ID,
			"uniprot_id": record.UniProtID,
			"method":     record.Method,
			"status":     record.Status,
			"created_at": record.CreatedAt.Format(time.RFC3339),
		}
		if record.Metrics != nil {
			summary["metrics"] = record.Metrics
		}
		summaries = append(summaries, summary)
	}

	return c.JSON(fiber.Map{
		"analyses": summaries,
	})
}

func (r *Routes) cancelAnalysis(c *fiber.Ctx) error {
	id := c.Params("id")

	if err := r.jobManager.CancelJob(id); err != nil {
		return c.Status(400).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message":    "Analysis cancelled successfully",
		"analysis_id": id,
	})
}

func (r *Routes) deleteAnalysis(c *fiber.Ctx) error {
	id := c.Params("id")
	
	if id == "" {
		fmt.Printf("[ERROR] Delete request with empty ID\n")
		return c.Status(400).JSON(fiber.Map{
			"error": "Analysis ID is required",
		})
	}

	fmt.Printf("[DEBUG] Deleting analysis: %s\n", id)
	
	if err := r.jobManager.DeleteJob(id); err != nil {
		fmt.Printf("[ERROR] Failed to delete job %s: %v\n", id, err)
		return c.Status(500).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	fmt.Printf("[DEBUG] Analysis %s deleted successfully\n", id)
	
	response := fiber.Map{
		"message":    "Analysis deleted successfully",
		"analysis_id": id,
	}
	
	fmt.Printf("[DEBUG] Sending delete response: %+v\n", response)
	return c.JSON(response)
}

func (r *Routes) updateMetricsForAll(c *fiber.Ctx) error {
	if r.db == nil {
		return c.Status(503).JSON(fiber.Map{
			"error": "Database not configured",
		})
	}

	// すべての解析を取得
	records, err := r.db.ListAnalyses(map[string]interface{}{"limit": 1000})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	updated := 0
	skipped := 0
	errors := 0

	for _, record := range records {
		// メトリクスが既に存在する場合はスキップ
		if len(record.Metrics) > 0 {
			skipped++
			continue
		}

		// result.jsonを読み込む
		resultPath := filepath.Join(r.storageDir, record.ID, "result.json")
		if _, err := os.Stat(resultPath); os.IsNotExist(err) {
			skipped++
			continue
		}

		resultData, err := os.ReadFile(resultPath)
		if err != nil {
			errors++
			fmt.Printf("[WARN] Failed to read result.json for %s: %v\n", record.ID, err)
			continue
		}

		var result map[string]interface{}
		if err := json.Unmarshal(resultData, &result); err != nil {
			errors++
			fmt.Printf("[WARN] Failed to parse result.json for %s: %v\n", record.ID, err)
			continue
		}

		// メトリクスを抽出
		metrics := r.jobManager.ExtractMetrics(result)

		// メトリクスを更新
		if err := r.db.UpdateMetricsFromResult(record.ID, metrics); err != nil {
			errors++
			fmt.Printf("[WARN] Failed to update metrics for %s: %v\n", record.ID, err)
			continue
		}

		updated++
	}

	return c.JSON(fiber.Map{
		"message": "Metrics update completed",
		"updated": updated,
		"skipped": skipped,
		"errors":  errors,
	})
}
