package jobs

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

type JobStatus string

const (
	StatusQueued  JobStatus = "queued"
	StatusRunning JobStatus = "running"
	StatusDone    JobStatus = "done"
	StatusFailed  JobStatus = "failed"
)

type Job struct {
	ID          string                 `json:"job_id"`
	Status      JobStatus              `json:"status"`
	Progress    int                    `json:"progress"`
	Message     string                 `json:"message"`
	UniProtID   string                 `json:"uniprot_id"`
	Params      map[string]interface{} `json:"params"`
	Result      *JobResult              `json:"result,omitempty"`
	ErrorMessage string                `json:"error_message,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

type JobResult struct {
	JSONURL    string `json:"json_url"`
	HeatmapURL string `json:"heatmap_url"`
	ScatterURL string `json:"scatter_url"`
}

type Manager struct {
	jobs      map[string]*Job
	mu        sync.RWMutex
	storageDir string
	pythonPath string
	maxConcurrent int
	semaphore    chan struct{}
}

func NewManager(storageDir, pythonPath string, maxConcurrent int) *Manager {
	if maxConcurrent <= 0 {
		maxConcurrent = 2
	}
	return &Manager{
		jobs:         make(map[string]*Job),
		storageDir:   storageDir,
		pythonPath:   pythonPath,
		maxConcurrent: maxConcurrent,
		semaphore:    make(chan struct{}, maxConcurrent),
	}
}

func (m *Manager) CreateJob(uniprotID string, params map[string]interface{}) (*Job, error) {
	jobID := uuid.New().String()
	jobDir := filepath.Join(m.storageDir, jobID)
	
	if err := os.MkdirAll(jobDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create job directory: %w", err)
	}

	job := &Job{
		ID:        jobID,
		Status:    StatusQueued,
		Progress:  0,
		Message:   "Job queued",
		UniProtID: uniprotID,
		Params:    params,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	m.mu.Lock()
	m.jobs[jobID] = job
	m.mu.Unlock()

	// ステータスファイルを保存
	if err := m.saveStatus(job); err != nil {
		return nil, err
	}

	// 非同期でジョブを実行
	go m.executeJob(job)

	return job, nil
}

func (m *Manager) GetJob(jobID string) (*Job, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	job, exists := m.jobs[jobID]
	if !exists {
		// ディスクから読み込む
		return m.loadJob(jobID)
	}
	return job, nil
}

func (m *Manager) executeJob(job *Job) {
	// セマフォで並列実行数を制限
	m.semaphore <- struct{}{}
	defer func() { <-m.semaphore }()

	m.updateJobStatus(job, StatusRunning, 10, "Starting analysis...")

	jobDir := filepath.Join(m.storageDir, job.ID)
	
	// デバッグ: ストレージディレクトリ情報
	fmt.Printf("[DEBUG] Manager storageDir: %s\n", m.storageDir)
	fmt.Printf("[DEBUG] JobDir: %s\n", jobDir)

	// Python CLIコマンドを構築
	cmd := exec.Command(m.pythonPath, "-m", "dsa_cli", "run",
		"--uniprot", job.UniProtID,
		"--out", jobDir,
		"--sequence-ratio", fmt.Sprintf("%v", job.Params["sequence_ratio"]),
		"--min-structures", fmt.Sprintf("%v", job.Params["min_structures"]),
	)

	if xrayOnly, ok := job.Params["xray_only"].(bool); ok && xrayOnly {
		cmd.Args = append(cmd.Args, "--xray-only")
	}

	if negativePDB, ok := job.Params["negative_pdbid"].(string); ok && negativePDB != "" {
		cmd.Args = append(cmd.Args, "--negative-pdbid", negativePDB)
	}

	if cisThreshold, ok := job.Params["cis_threshold"].(float64); ok {
		cmd.Args = append(cmd.Args, "--cis-threshold", fmt.Sprintf("%.1f", cisThreshold))
	}

	if procCis, ok := job.Params["proc_cis"].(bool); ok && procCis {
		cmd.Args = append(cmd.Args, "--proc-cis")
	}

	// 作業ディレクトリを設定（Pythonモジュールのルート）
	// storageDirから見て、親ディレクトリのpythonディレクトリを探す
	storageAbs, err := filepath.Abs(m.storageDir)
	if err != nil {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Failed to resolve storage path: %v", err))
		return
	}
	
	// デバッグ: パス情報をログ出力
	fmt.Printf("[DEBUG] storageDir: %s\n", m.storageDir)
	fmt.Printf("[DEBUG] storageAbs: %s\n", storageAbs)
	
	// storageDirがbackend/storageの場合、backendの親（okada）からpythonを探す
	// まず、storageの親（backend）を取得
	parentDir := filepath.Dir(storageAbs)
	// 次に、backendの親（okada）を取得
	rootDir := filepath.Dir(parentDir)
	// okada/pythonを探す
	pythonDir := filepath.Join(rootDir, "python")
	
	fmt.Printf("[DEBUG] parentDir: %s\n", parentDir)
	fmt.Printf("[DEBUG] rootDir: %s\n", rootDir)
	fmt.Printf("[DEBUG] pythonDir (first try): %s\n", pythonDir)
	
	// Pythonディレクトリの存在確認
	if _, err := os.Stat(pythonDir); os.IsNotExist(err) {
		fmt.Printf("[DEBUG] First pythonDir not found, trying alternative...\n")
		// もし見つからなければ、storageの親から直接探す（storageがokada直下にある場合）
		altPythonDir := filepath.Join(parentDir, "python")
		fmt.Printf("[DEBUG] pythonDir (alternative): %s\n", altPythonDir)
		if _, err := os.Stat(altPythonDir); os.IsNotExist(err) {
			// さらに、環境変数で指定されたパスを試す
			if envPythonDir := os.Getenv("PYTHON_DIR"); envPythonDir != "" {
				envPythonDir, _ = filepath.Abs(envPythonDir)
				fmt.Printf("[DEBUG] pythonDir (from env PYTHON_DIR): %s\n", envPythonDir)
				if _, err := os.Stat(envPythonDir); err == nil {
					pythonDir = envPythonDir
				} else {
					errorMsg := fmt.Sprintf("Python directory not found. Tried:\n1. %s\n2. %s\n3. %s (from env)\nStorage: %s", pythonDir, altPythonDir, envPythonDir, storageAbs)
					fmt.Printf("[DEBUG] %s\n", errorMsg)
					m.updateJobStatus(job, StatusFailed, 0, errorMsg)
					return
				}
			} else {
				errorMsg := fmt.Sprintf("Python directory not found. Tried:\n1. %s\n2. %s\nStorage: %s\nHint: Set PYTHON_DIR environment variable", pythonDir, altPythonDir, storageAbs)
				fmt.Printf("[DEBUG] %s\n", errorMsg)
				m.updateJobStatus(job, StatusFailed, 0, errorMsg)
				return
			}
		} else {
			pythonDir = altPythonDir
		}
	}
	
	fmt.Printf("[DEBUG] Using pythonDir: %s\n", pythonDir)
	
	// Pythonディレクトリの最終確認
	if _, err := os.Stat(pythonDir); os.IsNotExist(err) {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Python directory does not exist: %s", pythonDir))
		return
	}
	
	// dsa_cli.pyの存在確認
	dsaCliPath := filepath.Join(pythonDir, "dsa_cli.py")
	if _, err := os.Stat(dsaCliPath); os.IsNotExist(err) {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("dsa_cli.py not found in: %s", pythonDir))
		return
	}
	fmt.Printf("[DEBUG] dsa_cli.py found at: %s\n", dsaCliPath)
	
	cmd.Dir = pythonDir
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, "PYTHONPATH="+pythonDir)
	
	fmt.Printf("[DEBUG] Command directory: %s\n", cmd.Dir)
	fmt.Printf("[DEBUG] Command: %s %v\n", cmd.Path, cmd.Args)
	
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	m.updateJobStatus(job, StatusRunning, 20, "Running Python analysis...")

	// コマンド実行
	if err := cmd.Run(); err != nil {
		fmt.Printf("[DEBUG] Command execution failed: %v\n", err)
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Analysis failed: %v", err))
		return
	}
	fmt.Printf("[DEBUG] Command executed successfully\n")

	// Python処理完了後の進捗更新
	m.updateJobStatus(job, StatusRunning, 60, "Processing result files...")

	// 結果ファイルの存在確認
	resultPath := filepath.Join(jobDir, "result.json")
	if _, err := os.Stat(resultPath); os.IsNotExist(err) {
		m.updateJobStatus(job, StatusFailed, 0, "Result file not found")
		return
	}

	// result.jsonを読み込んでエラーチェック
	resultData, err := os.ReadFile(resultPath)
	if err != nil {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Failed to read result: %v", err))
		return
	}

	var result map[string]interface{}
	if err := json.Unmarshal(resultData, &result); err != nil {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Failed to parse result: %v", err))
		return
	}

	// 結果JSONのパース完了時点でさらに進捗を更新
	m.updateJobStatus(job, StatusRunning, 80, "Finalizing analysis result...")

	if status, ok := result["status"].(string); ok && status == "failed" {
		errorMsg := "Analysis failed"
		if errMsg, ok := result["error"].(string); ok {
			errorMsg = errMsg
		}
		m.updateJobStatus(job, StatusFailed, 0, errorMsg)
		return
	}

	// 結果URLを設定
	job.Result = &JobResult{
		JSONURL:    fmt.Sprintf("/api/jobs/%s/result.json", job.ID),
		HeatmapURL: fmt.Sprintf("/api/jobs/%s/heatmap.png", job.ID),
		ScatterURL: fmt.Sprintf("/api/jobs/%s/dist_score.png", job.ID),
	}

	m.updateJobStatus(job, StatusDone, 100, "Analysis completed successfully")
}

func (m *Manager) updateJobStatus(job *Job, status JobStatus, progress int, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job.Status = status
	job.Progress = progress
	job.Message = message
	job.UpdatedAt = time.Now()

	if status == StatusFailed {
		job.ErrorMessage = message
	}

	m.saveStatus(job)
}

func (m *Manager) saveStatus(job *Job) error {
	jobDir := filepath.Join(m.storageDir, job.ID)
	statusPath := filepath.Join(jobDir, "status.json")

	statusData := map[string]interface{}{
		"status":   job.Status,
		"progress": job.Progress,
		"message":  job.Message,
	}

	if job.ErrorMessage != "" {
		statusData["error_message"] = job.ErrorMessage
	}

	data, err := json.MarshalIndent(statusData, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(statusPath, data, 0644)
}

func (m *Manager) loadJob(jobID string) (*Job, error) {
	jobDir := filepath.Join(m.storageDir, jobID)
	statusPath := filepath.Join(jobDir, "status.json")

	data, err := os.ReadFile(statusPath)
	if err != nil {
		return nil, fmt.Errorf("job not found: %w", err)
	}

	var statusData map[string]interface{}
	if err := json.Unmarshal(data, &statusData); err != nil {
		return nil, err
	}

	job := &Job{
		ID:        jobID,
		Status:    JobStatus(statusData["status"].(string)),
		Progress:  int(statusData["progress"].(float64)),
		Message:   statusData["message"].(string),
		UpdatedAt: time.Now(),
	}

	if errorMsg, ok := statusData["error_message"].(string); ok {
		job.ErrorMessage = errorMsg
	}

	// 結果ファイルの存在確認
	resultPath := filepath.Join(jobDir, "result.json")
	if _, err := os.Stat(resultPath); err == nil {
		job.Result = &JobResult{
			JSONURL:    fmt.Sprintf("/api/jobs/%s/result.json", jobID),
			HeatmapURL: fmt.Sprintf("/api/jobs/%s/heatmap.png", jobID),
			ScatterURL: fmt.Sprintf("/api/jobs/%s/dist_score.png", jobID),
		}
	}

	return job, nil
}

func (m *Manager) GetStorageDir() string {
	return m.storageDir
}
