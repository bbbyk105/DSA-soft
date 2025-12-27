package main

import (
	"dsa-api/storage"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

func main() {
	// .envファイルを読み込む
	if err := godotenv.Load(); err != nil {
		fmt.Printf("Warning: .env file not found: %v\n", err)
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		fmt.Fprintf(os.Stderr, "DATABASE_URL environment variable is required\n")
		os.Exit(1)
	}

	db, err := storage.NewDB(databaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	storageDir := os.Getenv("STORAGE_DIR")
	if storageDir == "" {
		storageDir = "./storage"
	}

	// すべての解析を取得
	records, err := db.ListAnalyses(map[string]interface{}{"limit": 1000})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to list analyses: %v\n", err)
		os.Exit(1)
	}

	updated := 0
	for _, record := range records {
		// メトリクスが既に存在する場合はスキップ
		if record.Metrics != nil && len(record.Metrics) > 0 {
			continue
		}

		// result.jsonを読み込む
		resultPath := filepath.Join(storageDir, record.ID, "result.json")
		if _, err := os.Stat(resultPath); os.IsNotExist(err) {
			fmt.Printf("Skipping %s: result.json not found\n", record.ID)
			continue
		}

		resultData, err := os.ReadFile(resultPath)
		if err != nil {
			fmt.Printf("Failed to read result.json for %s: %v\n", record.ID, err)
			continue
		}

		var result map[string]interface{}
		if err := json.Unmarshal(resultData, &result); err != nil {
			fmt.Printf("Failed to parse result.json for %s: %v\n", record.ID, err)
			continue
		}

		// メトリクスを更新
		if err := db.UpdateMetricsFromResult(record.ID, result); err != nil {
			fmt.Printf("Failed to update metrics for %s: %v\n", record.ID, err)
			continue
		}

		fmt.Printf("Updated metrics for %s\n", record.ID)
		updated++
	}

	fmt.Printf("Updated %d analyses\n", updated)
}


