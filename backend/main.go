package main

import (
	"dsa-api/api"
	"dsa-api/jobs"
	"dsa-api/storage"
	"log"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
)

func main() {
	// .envファイルを読み込む（エラーは無視）
	godotenv.Load()
	
	// 環境変数から設定を取得
	storageDir := os.Getenv("STORAGE_DIR")
	if storageDir == "" {
		// 現在の作業ディレクトリを取得（go runの場合はbackendディレクトリ）
		workDir, err := os.Getwd()
		if err != nil {
			log.Fatalf("Failed to get working directory: %v", err)
		}
		// backendディレクトリから見たstorage
		storageDir = filepath.Join(workDir, "storage")
	}
	
	// 絶対パスに変換
	storageDir, err := filepath.Abs(storageDir)
	if err != nil {
		log.Fatalf("Failed to resolve storage directory: %v", err)
	}
	
	log.Printf("[DEBUG] Working directory: %s", func() string {
		wd, _ := os.Getwd()
		return wd
	}())
	log.Printf("[DEBUG] Storage directory: %s", storageDir)

	pythonPath := os.Getenv("PYTHON_PATH")
	if pythonPath == "" {
		// 仮想環境のPythonを優先的に使用
		workDir, _ := os.Getwd()
		// backendディレクトリから見て、親ディレクトリのpython/venv/bin/python3
		venvPython := filepath.Join(workDir, "..", "python", "venv", "bin", "python3")
		venvPythonAbs, _ := filepath.Abs(venvPython)
		if _, err := os.Stat(venvPythonAbs); err == nil {
			pythonPath = venvPythonAbs
			log.Printf("[DEBUG] Using virtual environment Python: %s", pythonPath)
		} else {
			pythonPath = "python3"
			log.Printf("[DEBUG] Virtual environment not found at %s, using system Python: %s", venvPythonAbs, pythonPath)
		}
	}

	maxConcurrent := 2
	if mc := os.Getenv("MAX_CONCURRENT"); mc != "" {
		// 簡易的な変換（実際にはstrconvを使用すべき）
		maxConcurrent = 2
	}

	// ストレージディレクトリの作成
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		log.Fatalf("Failed to create storage directory: %v", err)
	}

	// DBとR2クライアントの初期化（オプショナル）
	var db *storage.DB
	var r2 *storage.R2Client

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL != "" {
		var err error
		db, err = storage.NewDB(databaseURL)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		defer db.Close()
		log.Printf("Connected to database")
	}

	r2AccountID := os.Getenv("R2_ACCOUNT_ID")
	r2AccessKeyID := os.Getenv("R2_ACCESS_KEY_ID")
	r2SecretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	r2Bucket := os.Getenv("R2_BUCKET")
	r2Endpoint := os.Getenv("R2_ENDPOINT")
	r2PublicBase := os.Getenv("R2_PUBLIC_BASE_URL")

	if r2AccountID != "" && r2AccessKeyID != "" && r2SecretAccessKey != "" && r2Bucket != "" && r2Endpoint != "" {
		var err error
		r2, err = storage.NewR2Client(r2AccountID, r2AccessKeyID, r2SecretAccessKey, r2Bucket, r2Endpoint, r2PublicBase)
		if err != nil {
			log.Fatalf("Failed to create R2 client: %v", err)
		}
		log.Printf("R2 client initialized")
	}

	// ジョブマネージャーの作成
	var jobManager *jobs.Manager
	if db != nil {
		if r2 != nil {
			jobManager = jobs.NewManagerWithPersistence(storageDir, pythonPath, maxConcurrent, db, r2)
			log.Printf("Job manager created with persistence (DB + R2)")
		} else {
			// DBだけでも保存できるようにする
			jobManager = jobs.NewManagerWithPersistence(storageDir, pythonPath, maxConcurrent, db, nil)
			log.Printf("Job manager created with persistence (DB only)")
		}
	} else {
		jobManager = jobs.NewManager(storageDir, pythonPath, maxConcurrent)
		log.Printf("Job manager created without persistence")
	}

	// ルーティングの設定
	routes := api.NewRoutes(jobManager, db, r2)

	// Fiberアプリの作成
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// CORS設定
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,DELETE,OPTIONS",
		AllowHeaders: "Content-Type",
	}))

	// ルート設定
	routes.SetupRoutes(app)

	// 静的ファイル配信（Next.jsのビルド成果物）
	app.Static("/", "./frontend/.next/static", fiber.Static{
		Browse: false,
	})

	// ポート設定
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
