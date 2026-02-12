package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	_ "github.com/lib/pq"
)

type DB struct {
	sql *sql.DB
}

func NewDB(databaseURL string) (*DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}

	w := &DB{sql: db}
	if err := w.runMigrations(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return w, nil
}

func (d *DB) Close() error {
	if d == nil || d.sql == nil {
		return nil
	}
	return d.sql.Close()
}

func (d *DB) runMigrations() error {
	migrationsDir, err := migrationsPath()
	if err != nil {
		return err
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		// migrationsディレクトリが存在しない場合はスキップ（エラーにしない）
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read migrations dir: %w", err)
	}

	var files []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, filepath.Join(migrationsDir, e.Name()))
		}
	}
	sort.Strings(files)

	for _, p := range files {
		sqlBytes, err := os.ReadFile(p)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", p, err)
		}
		stmt := strings.TrimSpace(string(sqlBytes))
		if stmt == "" {
			continue
		}
		if _, err := d.sql.Exec(stmt); err != nil {
			return fmt.Errorf("apply migration %s: %w", filepath.Base(p), err)
		}
	}
	return nil
}

func migrationsPath() (string, error) {
	// 環境変数で指定されている場合はそれを使用
	if envPath := os.Getenv("MIGRATIONS_DIR"); envPath != "" {
		return filepath.Abs(envPath)
	}
	
	// Resolve to "<repo>/backend/migrations" regardless of cwd.
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("resolve migrations path: runtime.Caller failed")
	}
	// thisFile: <repo>/backend/storage/db.go (or /app/storage/db.go in container)
	backendDir := filepath.Clean(filepath.Join(filepath.Dir(thisFile), ".."))
	migrationsDir := filepath.Join(backendDir, "migrations")
	
	// 絶対パスに変換
	absPath, err := filepath.Abs(migrationsDir)
	if err != nil {
		return "", fmt.Errorf("resolve migrations absolute path: %w", err)
	}
	return absPath, nil
}

