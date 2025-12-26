package jobs

import (
	"context"
	"dsa-api/storage"
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
	StatusQueued   JobStatus = "queued"
	StatusRunning  JobStatus = "running"
	StatusDone     JobStatus = "done"
	StatusFailed   JobStatus = "failed"
	StatusCancelled JobStatus = "cancelled"
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
	// For cancellation
	cmd    *exec.Cmd
	cancel context.CancelFunc
	mu     sync.Mutex
}

type JobResult struct {
	JSONURL    string `json:"json_url"`
	HeatmapURL string `json:"heatmap_url"`
	ScatterURL string `json:"scatter_url"`
}

type Manager struct {
	jobs         map[string]*Job
	mu           sync.RWMutex
	storageDir   string
	pythonPath   string
	maxConcurrent int
	semaphore    chan struct{}
	// Optional: DB and R2 for persistence
	db  *storage.DB
	r2  *storage.R2Client
	ctx context.Context
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
		ctx:          context.Background(),
	}
}

func NewManagerWithPersistence(storageDir, pythonPath string, maxConcurrent int, db *storage.DB, r2 *storage.R2Client) *Manager {
	m := NewManager(storageDir, pythonPath, maxConcurrent)
	m.db = db
	m.r2 = r2
	return m
}

func (m *Manager) CreateJob(uniprotID string, params map[string]interface{}) (*Job, error) {
	jobID := uuid.New().String()
	
	// DBがある場合はローカルディレクトリを作成しない（一時ディレクトリをexecuteJobで使用）
	// DBがない場合のみ従来通りローカルに保存
	if m.db == nil {
		jobDir := filepath.Join(m.storageDir, jobID)
		if err := os.MkdirAll(jobDir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create job directory: %w", err)
		}
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

	// DBに記録（オプショナル）
	if m.db != nil {
		method := "all"
		if xrayOnly, ok := params["xray_only"].(bool); ok && xrayOnly {
			method = "X-ray"
		}
		// セッションIDを取得
		sessionID := ""
		if sid, ok := params["session_id"].(string); ok {
			sessionID = sid
		}

		record := &storage.AnalysisRecord{
			ID:        jobID,
			UniProtID: uniprotID,
			Method:    method,
			Status:    "queued",
			Params:    params,
			CreatedAt: job.CreatedAt,
			SessionID: sessionID,
		}
		if err := m.db.CreateAnalysis(record); err != nil {
			fmt.Printf("[WARN] Failed to create analysis in DB: %v\n", err)
			// DBエラーは無視して続行（既存の動作を維持）
		}
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
		// DBから読み込む（DBがある場合）
		if m.db != nil {
			record, err := m.db.GetAnalysis(jobID)
			if err == nil {
				// DBから取得できた場合、Jobに変換
				job = &Job{
					ID:        record.ID,
					Status:    JobStatus(record.Status),
					Progress:  0,
					Message:   "",
					UniProtID: record.UniProtID,
					Params:    record.Params,
					CreatedAt: record.CreatedAt,
					UpdatedAt: record.CreatedAt,
				}
				if record.Progress != nil {
					job.Progress = *record.Progress
				}
				if record.ErrorMessage != nil {
					job.ErrorMessage = *record.ErrorMessage
				}
				if record.FinishedAt != nil {
					job.UpdatedAt = *record.FinishedAt
				} else if record.StartedAt != nil {
					job.UpdatedAt = *record.StartedAt
				}
				// 結果URLを設定
				if record.ResultKey != nil || record.HeatmapKey != nil || record.ScatterKey != nil {
					job.Result = &JobResult{
						JSONURL:    fmt.Sprintf("/api/analyses/%s/result.json", jobID),
						HeatmapURL: fmt.Sprintf("/api/analyses/%s/heatmap.png", jobID),
						ScatterURL: fmt.Sprintf("/api/analyses/%s/dist_score.png", jobID),
					}
				}
				return job, nil
			}
		}
		// DBがない場合、またはDBから取得できなかった場合はディスクから読み込む（フォールバック）
		return m.loadJob(jobID)
	}
	return job, nil
}

func (m *Manager) CancelJob(jobID string) error {
	fmt.Printf("[DEBUG] CancelJob called for: %s\n", jobID)
	
	m.mu.Lock()
	defer m.mu.Unlock()

	job, exists := m.jobs[jobID]
	if !exists {
		fmt.Printf("[DEBUG] Job not found in memory: %s, trying to load from disk\n", jobID)
		// ディスクから読み込む
		var err error
		job, err = m.loadJob(jobID)
		if err != nil {
			fmt.Printf("[ERROR] Failed to load job from disk: %v\n", err)
			return fmt.Errorf("job not found: %w", err)
		}
		// メモリに追加（後でステータス更新するため）
		m.jobs[jobID] = job
	}

	fmt.Printf("[DEBUG] Job found: %s, status: %s\n", jobID, job.Status)

	// ジョブが実行中またはキュー待ちの場合のみキャンセル可能
	if job.Status != StatusQueued && job.Status != StatusRunning {
		fmt.Printf("[WARN] Job %s is not cancellable (status: %s)\n", jobID, job.Status)
		return fmt.Errorf("job is not cancellable (status: %s)", job.Status)
	}

	// キャンセル関数を呼び出し
	job.mu.Lock()
	if job.cancel != nil {
		fmt.Printf("[DEBUG] Calling cancel function for job: %s\n", jobID)
		job.cancel()
	} else {
		fmt.Printf("[WARN] Cancel function is nil for job: %s\n", jobID)
	}
	
	// コマンドプロセスを強制終了
	if job.cmd != nil {
		if job.cmd.Process != nil {
			fmt.Printf("[DEBUG] Killing process for job: %s, PID: %d\n", jobID, job.cmd.Process.Pid)
			if err := job.cmd.Process.Kill(); err != nil {
				fmt.Printf("[WARN] Failed to kill process: %v\n", err)
			} else {
				fmt.Printf("[DEBUG] Process killed successfully for job: %s\n", jobID)
			}
		} else {
			fmt.Printf("[WARN] Process is nil for job: %s\n", jobID)
		}
	} else {
		fmt.Printf("[WARN] Command is nil for job: %s\n", jobID)
		// プロセスIDをファイルから読み込んで強制終了を試みる（DBがない場合のみ）
		if m.db == nil {
			jobDir := filepath.Join(m.storageDir, jobID)
			pidFile := filepath.Join(jobDir, "pid.txt")
			if pidData, err := os.ReadFile(pidFile); err == nil {
			var pid int
			if _, err := fmt.Sscanf(string(pidData), "%d", &pid); err == nil {
				fmt.Printf("[DEBUG] Found PID file, attempting to kill process: %d\n", pid)
				if proc, err := os.FindProcess(pid); err == nil {
					if err := proc.Kill(); err != nil {
						fmt.Printf("[WARN] Failed to kill process from PID file: %v\n", err)
					} else {
						fmt.Printf("[DEBUG] Process killed from PID file: %d\n", pid)
					}
				}
			}
			}
		}
	}
	job.mu.Unlock()

	// ステータスを更新
	fmt.Printf("[DEBUG] Updating job status to cancelled: %s\n", jobID)
	m.updateJobStatus(job, StatusCancelled, 0, "Analysis cancelled by user")

	// DBを更新（オプショナル）
	if m.db != nil {
		fmt.Printf("[DEBUG] Updating DB status to cancelled: %s\n", jobID)
		if err := m.db.UpdateAnalysisStatus(jobID, string(StatusCancelled), nil, "Analysis cancelled by user", nil); err != nil {
			fmt.Printf("[ERROR] Failed to update analysis status in DB: %v\n", err)
			return fmt.Errorf("failed to update database: %w", err)
		}
		fmt.Printf("[DEBUG] DB status updated successfully: %s\n", jobID)
	} else {
		fmt.Printf("[DEBUG] DB not configured, skipping DB update\n")
	}

	fmt.Printf("[DEBUG] CancelJob completed successfully for: %s\n", jobID)
	return nil
}

func (m *Manager) DeleteJob(jobID string) error {
	fmt.Printf("[DEBUG] DeleteJob called for: %s\n", jobID)
	
	m.mu.Lock()
	defer m.mu.Unlock()

	job, exists := m.jobs[jobID]
	if exists {
		fmt.Printf("[DEBUG] Job found in memory: %s, status: %s\n", jobID, job.Status)
		// 実行中のジョブをキャンセル
		if job.Status == StatusRunning || job.Status == StatusQueued {
			job.mu.Lock()
			if job.cancel != nil {
				job.cancel()
				fmt.Printf("[DEBUG] Context cancel function called for job: %s\n", jobID)
			}
			if job.cmd != nil && job.cmd.Process != nil {
				if err := job.cmd.Process.Kill(); err != nil {
					fmt.Printf("[WARN] Failed to kill process %d for job %s: %v\n", job.cmd.Process.Pid, jobID, err)
				} else {
					fmt.Printf("[DEBUG] Killed process %d for job: %s\n", job.cmd.Process.Pid, jobID)
				}
			} else {
				fmt.Printf("[WARN] Process is nil for job: %s\n", jobID)
			}
			job.mu.Unlock()
		}
		delete(m.jobs, jobID)
		fmt.Printf("[DEBUG] Job removed from memory: %s\n", jobID)
	} else {
		fmt.Printf("[DEBUG] Job not found in memory: %s (may be on disk only)\n", jobID)
		// メモリにない場合でも、実行中の可能性があるのでPIDファイルからプロセスを終了（DBがない場合のみ）
		if m.db == nil {
			jobDir := filepath.Join(m.storageDir, jobID)
			pidFile := filepath.Join(jobDir, "pid.txt")
			if pidData, err := os.ReadFile(pidFile); err == nil {
			var pid int
			if _, err := fmt.Sscanf(string(pidData), "%d", &pid); err == nil {
				fmt.Printf("[DEBUG] Found PID file for job %s, attempting to kill process: %d\n", jobID, pid)
				if proc, err := os.FindProcess(pid); err == nil {
					if err := proc.Kill(); err != nil {
						fmt.Printf("[WARN] Failed to kill process %d from PID file for job %s: %v\n", pid, jobID, err)
					} else {
						fmt.Printf("[DEBUG] Process killed from PID file: %d for job: %s\n", pid, jobID)
					}
				} else {
					fmt.Printf("[WARN] Failed to find process %d from PID file for job %s: %v\n", pid, jobID, err)
				}
			} else {
				fmt.Printf("[WARN] Failed to parse PID from file %s for job %s: %v\n", pidFile, jobID, err)
			}
		} else if !os.IsNotExist(err) {
			fmt.Printf("[WARN] Failed to read PID file %s for job %s: %v\n", pidFile, jobID, err)
		}
		}
	}

	// ストレージディレクトリを削除（DBがない場合のみ）
	if m.db == nil {
		jobDir := filepath.Join(m.storageDir, jobID)
		fmt.Printf("[DEBUG] Attempting to delete storage directory: %s\n", jobDir)
		if err := os.RemoveAll(jobDir); err != nil {
			fmt.Printf("[WARN] Failed to delete job directory: %v\n", err)
		} else {
			fmt.Printf("[DEBUG] Storage directory deleted: %s\n", jobDir)
		}
	} else {
		fmt.Printf("[DEBUG] DB configured, skipping local directory deletion (temp directory already removed)\n")
	}

	// R2から削除（オプショナル）
	// DBからR2キーを取得して削除を試みる
	if m.r2 != nil {
		r2Prefix := fmt.Sprintf("analysis/%s/", jobID)
		fmt.Printf("[DEBUG] Attempting to delete objects from R2 with prefix: %s\n", r2Prefix)
		if err := m.r2.DeleteObjectsWithPrefix(context.Background(), r2Prefix); err != nil {
			fmt.Printf("[ERROR] Failed to delete objects from R2 for %s: %v\n", jobID, err)
			// R2削除エラーは警告のみ（DB削除は続行）
		} else {
			fmt.Printf("[DEBUG] Successfully deleted objects from R2: %s\n", r2Prefix)
		}
	} else if m.db != nil {
		// R2が設定されていない場合でも、DBからR2キーを確認してログ出力
		record, err := m.db.GetAnalysis(jobID)
		if err == nil {
			if record.ResultKey != nil || record.HeatmapKey != nil || record.ScatterKey != nil {
				fmt.Printf("[WARN] R2 keys found in DB for %s but R2 is not configured. R2 objects will not be deleted.\n", jobID)
			}
		}
	}

	// DBから削除（オプショナル）
	if m.db != nil {
		fmt.Printf("[DEBUG] Attempting to delete from DB: %s\n", jobID)
		if err := m.db.DeleteAnalysis(jobID); err != nil {
			fmt.Printf("[ERROR] Failed to delete analysis from DB: %v\n", err)
			return fmt.Errorf("failed to delete from database: %w", err)
		}
		fmt.Printf("[DEBUG] Analysis deleted from DB: %s\n", jobID)
	} else {
		fmt.Printf("[DEBUG] DB not configured, skipping DB deletion\n")
	}

	fmt.Printf("[DEBUG] DeleteJob completed successfully for: %s\n", jobID)
	return nil
}

func (m *Manager) executeJob(job *Job) {
	// セマフォで並列実行数を制限
	m.semaphore <- struct{}{}
	defer func() { <-m.semaphore }()

	// キャンセル可能なコンテキストを作成
	jobCtx, cancel := context.WithCancel(m.ctx)
	job.mu.Lock()
	job.cancel = cancel
	job.mu.Unlock()

	m.updateJobStatus(job, StatusRunning, 10, "Starting analysis...")

	// 一時ディレクトリを作成（DBがある場合）
	var jobDir string
	var cleanupDir bool
	if m.db != nil {
		// 一時ディレクトリを使用
		tempDir, err := os.MkdirTemp("", fmt.Sprintf("dsa-job-%s-", job.ID))
		if err != nil {
			m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Failed to create temp directory: %v", err))
			return
		}
		jobDir = tempDir
		cleanupDir = true
		// 処理完了後に確実に削除
		defer func() {
			if cleanupDir {
				if err := os.RemoveAll(jobDir); err != nil {
					fmt.Printf("[WARN] Failed to remove temp directory %s: %v\n", jobDir, err)
				} else {
					fmt.Printf("[DEBUG] Temp directory removed: %s\n", jobDir)
				}
			}
		}()
	} else {
		// DBがない場合は従来通り
		jobDir = filepath.Join(m.storageDir, job.ID)
	}
	
	// デバッグ: ストレージディレクトリ情報
	fmt.Printf("[DEBUG] Manager storageDir: %s\n", m.storageDir)
	fmt.Printf("[DEBUG] JobDir: %s\n", jobDir)

	// Python CLIコマンドを構築（キャンセル可能なコンテキストを使用）
	cmd := exec.CommandContext(jobCtx, m.pythonPath, "-m", "dsa_cli", "run",
		"--uniprot", job.UniProtID,
		"--out", jobDir,
		"--sequence-ratio", fmt.Sprintf("%v", job.Params["sequence_ratio"]),
		"--min-structures", fmt.Sprintf("%v", job.Params["min_structures"]),
	)
	
	// ジョブにコマンドを保存（キャンセル時に使用）
	job.mu.Lock()
	job.cmd = cmd
	job.mu.Unlock()

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

	// コマンドを開始してプロセスIDを取得
	if err := cmd.Start(); err != nil {
		m.updateJobStatus(job, StatusFailed, 0, fmt.Sprintf("Failed to start command: %v", err))
		return
	}

	// プロセスIDをファイルに保存（後で強制終了するため）
	pidFile := filepath.Join(jobDir, "pid.txt")
	if cmd.Process != nil {
		pid := cmd.Process.Pid
		if err := os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", pid)), 0644); err != nil {
			fmt.Printf("[WARN] Failed to save PID file: %v\n", err)
		} else {
			fmt.Printf("[DEBUG] Saved PID %d to %s\n", pid, pidFile)
		}
	}

	// コマンド実行（キャンセルされた場合はcontext.Canceledエラーが返る）
	if err := cmd.Wait(); err != nil {
		// キャンセルされた場合は特別に処理
		if jobCtx.Err() == context.Canceled {
			fmt.Printf("[DEBUG] Job cancelled: %s\n", job.ID)
			m.updateJobStatus(job, StatusCancelled, 0, "Analysis cancelled by user")
			// PIDファイルを削除
			if err := os.Remove(pidFile); err != nil && !os.IsNotExist(err) {
				fmt.Printf("[WARN] Failed to remove PID file: %v\n", err)
			}
			return
		}
		fmt.Printf("[DEBUG] Command execution failed: %v\n", err)
		// もし result.json が生成されていれば、その中のエラー内容を優先してユーザーに伝える
		resultPath := filepath.Join(jobDir, "result.json")

		if data, readErr := os.ReadFile(resultPath); readErr == nil {
			var res map[string]interface{}
			if jsonErr := json.Unmarshal(data, &res); jsonErr == nil {
				if msg, ok := res["error"].(string); ok && msg != "" {
					m.updateJobStatus(job, StatusFailed, 0, msg)
					return
				}
			}
		}

		// result.json が無い / パースできない場合は従来通りのメッセージ
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

	// メトリクスを抽出
	metrics := m.extractMetrics(result)

	// R2にアップロード（オプショナル）
	var r2Prefix, resultKey, heatmapKey, scatterKey, logsKey string
	if m.r2 != nil {
		if err := m.uploadToR2(job, jobDir, result); err != nil {
			fmt.Printf("[WARN] Failed to upload to R2: %v\n", err)
			// R2エラーは無視して続行
		} else {
			// アップロード成功時のみキーを設定
			r2Prefix = fmt.Sprintf("analysis/%s", job.ID)
			resultKey = fmt.Sprintf("%s/result.json", r2Prefix)
			heatmapKey = fmt.Sprintf("%s/heatmap.png", r2Prefix)
			scatterKey = fmt.Sprintf("%s/dist_score.png", r2Prefix)
			// logs.txtは存在する場合のみ
			logsPath := filepath.Join(jobDir, "logs.txt")
			if _, err := os.Stat(logsPath); err == nil {
				logsKey = fmt.Sprintf("%s/logs.txt", r2Prefix)
			}
		}
	}

	// DBを更新（オプショナル、R2の成否に関わらず実行）
	if m.db != nil {
		if err := m.db.CompleteAnalysis(job.ID, metrics, r2Prefix, resultKey, heatmapKey, scatterKey, logsKey); err != nil {
			fmt.Printf("[WARN] Failed to update analysis in DB: %v\n", err)
			// DBエラーは無視して続行（既存の動作を維持）
		}
	}

	m.updateJobStatus(job, StatusDone, 100, "Analysis completed successfully")
	
	// PIDファイルを削除
	pidFile = filepath.Join(jobDir, "pid.txt")
	if err := os.Remove(pidFile); err != nil && !os.IsNotExist(err) {
		fmt.Printf("[WARN] Failed to remove PID file: %v\n", err)
	}

	// DBがある場合、一時ディレクトリはdeferで自動削除される
	// DBがない場合は従来通りローカルファイルを保持
	if m.db == nil {
		fmt.Printf("[DEBUG] DB not configured, keeping local files in: %s\n", jobDir)
	}
}

func (m *Manager) uploadToR2(job *Job, jobDir string, result map[string]interface{}) error {
	r2Prefix := fmt.Sprintf("analysis/%s", job.ID)

	// result.jsonをアップロード
	resultPath := filepath.Join(jobDir, "result.json")
	resultData, err := os.ReadFile(resultPath)
	if err != nil {
		return fmt.Errorf("failed to read result.json: %w", err)
	}
	resultKey := fmt.Sprintf("%s/result.json", r2Prefix)
	if err := m.r2.PutObject(m.ctx, resultKey, resultData, "application/json"); err != nil {
		return fmt.Errorf("failed to upload result.json: %w", err)
	}

	// heatmap.pngをアップロード
	heatmapPath := filepath.Join(jobDir, "heatmap.png")
	heatmapKey := fmt.Sprintf("%s/heatmap.png", r2Prefix)
	if data, err := os.ReadFile(heatmapPath); err == nil {
		if err := m.r2.PutObject(m.ctx, heatmapKey, data, "image/png"); err != nil {
			return fmt.Errorf("failed to upload heatmap.png: %w", err)
		}
	}

	// dist_score.pngをアップロード
	scatterPath := filepath.Join(jobDir, "dist_score.png")
	scatterKey := fmt.Sprintf("%s/dist_score.png", r2Prefix)
	if data, err := os.ReadFile(scatterPath); err == nil {
		if err := m.r2.PutObject(m.ctx, scatterKey, data, "image/png"); err != nil {
			return fmt.Errorf("failed to upload dist_score.png: %w", err)
		}
	}

	// logs.txtをアップロード（存在する場合）
	logsPath := filepath.Join(jobDir, "logs.txt")
	logsKey := fmt.Sprintf("%s/logs.txt", r2Prefix)
	if data, err := os.ReadFile(logsPath); err == nil {
		if err := m.r2.PutObject(m.ctx, logsKey, data, "text/plain"); err != nil {
			return fmt.Errorf("failed to upload logs.txt: %w", err)
		}
	}

	return nil
}

// ExtractMetrics extracts metrics from a result map (public method for API use)
func (m *Manager) ExtractMetrics(result map[string]interface{}) map[string]interface{} {
	return m.extractMetrics(result)
}

func (m *Manager) extractMetrics(result map[string]interface{}) map[string]interface{} {
	metrics := make(map[string]interface{})

	// statisticsから抽出
	if stats, ok := result["statistics"].(map[string]interface{}); ok {
		if entries, ok := stats["entries"].(float64); ok {
			metrics["entries"] = int(entries)
		}
		if chains, ok := stats["chains"].(float64); ok {
			metrics["chains"] = int(chains)
		}
		if length, ok := stats["length"].(float64); ok {
			metrics["length"] = int(length)
		}
		if lengthPercent, ok := stats["length_percent"].(float64); ok {
			metrics["length_percent"] = lengthPercent
		}
		if resolution, ok := stats["resolution"].(float64); ok {
			metrics["resolution"] = resolution
		}
		if umf, ok := stats["umf"].(float64); ok {
			metrics["umf"] = umf
		}

		// cis_analysisから抽出
		if cisAnalysis, ok := stats["cis_analysis"].(map[string]interface{}); ok {
			if cisNum, ok := cisAnalysis["cis_num"].(float64); ok {
				metrics["cis_num"] = int(cisNum)
			}
			if cisDistMean, ok := cisAnalysis["cis_dist_mean"].(float64); ok {
				metrics["cis_dist_mean"] = cisDistMean
			}
			if cisDistStd, ok := cisAnalysis["cis_dist_std"].(float64); ok {
				metrics["cis_dist_std"] = cisDistStd
			}
		}
	}

	// score_summaryから抽出
	if scoreSummary, ok := result["score_summary"].(map[string]interface{}); ok {
		if meanScore, ok := scoreSummary["mean_score"].(float64); ok {
			metrics["mean_score"] = meanScore
		}
		if meanStd, ok := scoreSummary["mean_std"].(float64); ok {
			metrics["mean_std"] = meanStd
		}
	}

	return metrics
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

	// DBを更新（オプショナル）
	if m.db != nil {
		progressPtr := &progress
		var startedAt *time.Time
		if status == StatusRunning && job.Progress > 0 {
			now := time.Now()
			startedAt = &now
		}
		if err := m.db.UpdateAnalysisStatus(job.ID, string(status), progressPtr, message, startedAt); err != nil {
			fmt.Printf("[WARN] Failed to update analysis status in DB: %v\n", err)
		}
		if status == StatusFailed {
			if err := m.db.FailAnalysis(job.ID, message); err != nil {
				fmt.Printf("[WARN] Failed to fail analysis in DB: %v\n", err)
			}
		}
	}
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
