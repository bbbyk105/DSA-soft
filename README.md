# DSA Analysis - フルスタック実装

Jupyter Notebook で確立された DSA（Distance-based Structural Analysis）解析を、Web 上から再現可能に実行・可視化できるフルスタック基盤です。

## 構成

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend**: Go (Fiber) + 非同期ジョブ管理
- **Analysis**: Python (Biopython/NumPy/Matplotlib) - Notebook 資産を移植

## ディレクトリ構成

```
.
├── backend/          # Go API
│   ├── main.go
│   ├── jobs/        # ジョブ管理
│   └── api/          # ルーティング
├── python/           # Python解析モジュール
│   ├── dsa/         # DSA解析ロジック
│   └── dsa_cli.py   # CLIエントリーポイント
├── frontend/         # Next.jsアプリ
│   └── app/         # App Router
└── storage/          # ジョブ結果保存先（自動生成）
```

## セットアップ

### 前提条件

- Docker & Docker Compose
- Go 1.21+ (ローカル開発時)
- Python 3.11+ (ローカル開発時)
- Node.js 20+ (ローカル開発時)

### Docker Compose で起動

```bash
docker compose up --build
```

- Backend API: http://localhost:8080
- Frontend: http://localhost:3000

### ローカル開発

#### Backend

```bash
cd backend
go mod download
go run main.go
```

環境変数:

- `PORT`: ポート番号 (デフォルト: 8080)
- `STORAGE_DIR`: ストレージディレクトリ (デフォルト: ./storage)
- `PYTHON_PATH`: Python 実行パス (デフォルト: python3)
- `MAX_CONCURRENT`: 最大並列実行数 (デフォルト: 2)

#### Python

```bash
cd python
pip install -r requirements.txt
python -m dsa_cli run --uniprot P00915 --out ./test_output
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API 仕様

### POST /api/jobs

解析ジョブを作成

**Request:**

```json
{
  "uniprot_id": "P00915",
  "params": {
    "min_structures": 5,
    "sequence_ratio": 0.7,
    "xray_only": true,
    "negative_pdbid": ""
  }
}
```

**Response:**

```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

### GET /api/jobs/:id

ジョブ状態を取得

**Response:**

```json
{
  "job_id": "uuid",
  "status": "queued|running|done|failed",
  "progress": 0-100,
  "message": "Step x/y ...",
  "result": {
    "json_url": "/api/jobs/:id/result.json",
    "heatmap_url": "/api/jobs/:id/heatmap.png",
    "scatter_url": "/api/jobs/:id/dist_score.png"
  },
  "error_message": null
}
```

### GET /api/jobs/:id/result.json

### GET /api/jobs/:id/heatmap.png

### GET /api/jobs/:id/dist_score.png

結果ファイルを取得

## 使用方法

1. ブラウザで http://localhost:3000 にアクセス
2. UniProt ID を入力（例: P00915）
3. パラメータを設定
4. 「Run Analysis」をクリック
5. 進捗を確認（自動ポーリング）
6. 完了後、結果ページでヒートマップ・散布図を確認

## 出力ファイル

各ジョブの `storage/<job_id>/` ディレクトリに以下が生成されます:

- `status.json`: ジョブ状態
- `result.json`: 解析結果（統計情報）
- `heatmap.png`: DSA Score Heatmap
- `dist_score.png`: Distance vs Score 散布図

## パラメータ説明

- **sequence_ratio**: 解析に使用する配列長の割合 (0.0-1.0, デフォルト: 0.7)
- **min_structures**: 最小構造数 (デフォルト: 5)
- **xray_only**: X-ray 構造のみを使用 (デフォルト: true)
- **negative_pdbid**: 除外する PDB ID（カンマまたはスペース区切り）

## 注意事項

- Notebook の計算ロジックを正として実装しています
- 解析には時間がかかる場合があります（PDB ダウンロード・計算処理）
- 失敗時は `status=failed` と `error_message` が返されます
- 並列実行数は `MAX_CONCURRENT` で制限されます（デフォルト: 2）

## トラブルシューティング

### Python 依存関係のエラー

```bash
cd python
pip install --upgrade -r requirements.txt
```

### Go モジュールのエラー

```bash
cd backend
go mod tidy
```

### ポート競合

`docker-compose.yml` または環境変数でポートを変更してください。

## ライセンス

（プロジェクトのライセンスに従う）
