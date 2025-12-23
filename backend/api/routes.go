package api

import (
	"dsa-api/jobs"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
)

type Routes struct {
	jobManager *jobs.Manager
}

func NewRoutes(jobManager *jobs.Manager) *Routes {
	return &Routes{
		jobManager: jobManager,
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
