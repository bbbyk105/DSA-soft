package main

import (
	"context"
	"dsa-api/storage"
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

func main() {
	// プロジェクトルートの.envファイルを読み込む
	// 実行時の作業ディレクトリがbackendの場合、../.env がプロジェクトルート
	envPaths := []string{
		"../.env",                    // backend から実行時
		"../../.env",                 // backend/cmd から実行時
		"../../../.env",              // backend/cmd/delete_all_r2 から実行時
		filepath.Join("..", "..", "..", ".env"), // 絶対パス計算用
	}
	
	var envLoaded bool
	for _, envPath := range envPaths {
		if err := godotenv.Load(envPath); err == nil {
			envLoaded = true
			fmt.Printf("Loaded .env from: %s\n", envPath)
			break
		}
	}
	
	if !envLoaded {
		fmt.Printf("Warning: .env file not found in any of the tried paths\n")
	}

	r2AccountID := os.Getenv("R2_ACCOUNT_ID")
	r2AccessKeyID := os.Getenv("R2_ACCESS_KEY_ID")
	r2SecretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	r2Bucket := os.Getenv("R2_BUCKET")
	r2Endpoint := os.Getenv("R2_ENDPOINT")

	if r2AccountID == "" || r2AccessKeyID == "" || r2SecretAccessKey == "" || r2Bucket == "" || r2Endpoint == "" {
		fmt.Fprintf(os.Stderr, "R2 environment variables are required\n")
		fmt.Fprintf(os.Stderr, "Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT\n")
		os.Exit(1)
	}

	r2, err := storage.NewR2Client(r2AccountID, r2AccessKeyID, r2SecretAccessKey, r2Bucket, r2Endpoint, "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create R2 client: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	prefix := "analysis/"

	fmt.Printf("Deleting all objects with prefix: %s\n", prefix)
	fmt.Printf("This will delete ALL analysis results in R2. Are you sure? (yes/no): ")
	
	var confirmation string
	fmt.Scanln(&confirmation)
	
	if confirmation != "yes" {
		fmt.Println("Cancelled.")
		os.Exit(0)
	}

	if err := r2.DeleteObjectsWithPrefix(ctx, prefix); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to delete objects: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("All objects deleted successfully")
}

