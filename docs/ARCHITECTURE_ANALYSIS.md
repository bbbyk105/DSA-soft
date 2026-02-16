# DSA-soft アーキテクチャ分析レポート

**分析日**: 2025年2月  
**対象**: フルスタック DSA-soft リポジトリ（Next.js 16 / Go Fiber / Python / PostgreSQL / Cloudflare R2）

---

## 1. Current Architecture Summary（現状アーキテクチャ概要）

### 1.1 コンポーネント一覧

| コンポーネント | 技術 | 役割 |
|----------------|------|------|
| **frontend** | Next.js 16 (App Router, standalone) | UI・分析依頼・結果表示・履歴・比較 |
| **backend** | Go (Fiber) | REST API・ジョブ管理・Python 起動・DB/R2 仲介 |
| **python-base** | Python (Biopython/NumPy 等) | 解析ロジック（CLI として backend から実行） |
| **postgres** | PostgreSQL 15 | 分析メタデータ・履歴・セッション |
| **adminer** | Adminer latest | DB 管理 UI（開発用） |
| **storage** | Cloudflare R2 (S3 互換) | 結果 JSON・ヒートマップ・散布図・ログの永続化 |

### 1.2 接続関係（論理）

- **Frontend** → ブラウザから **Backend** の REST API に直接アクセス（`NEXT_PUBLIC_API_URL`）。
- **Backend** → **PostgreSQL**（接続文字列）、**R2**（S3 API）、**Python**（同一コンテナ内で `python3 -m dsa_cli run ...` を `exec`）。
- **Backend** は **python-base** のイメージに依存しないが、`./python` をボリュームでマウントし、entrypoint で pip インストールした上で `dsa-api` を起動。実質「backend コンテナ内に Python 環境が同居」。
- **Adminer** → **PostgreSQL** に接続して DB 操作。

### 1.3 データフロー概要

1. ユーザーが Frontend で UniProt ID とパラメータを入力 → `POST /api/jobs` で Backend に送信。
2. Backend がジョブを生成し、DB に `analyses` レコード作成。続けて `executeJob` を goroutine で非同期実行。
3. `executeJob` 内で `python3 -m dsa_cli run --uniprot ... --out <tempDir> ...` を実行。Python が PDB 取得・解析・result.json/heatmap.png/dist_score.png 生成。
4. 完了後、Backend が結果を R2 にアップロードし、DB の `analyses` を完了状態で更新。
5. Frontend は `GET /api/jobs/:id` や `GET /api/analyses` で状態・結果を取得。アーティファクトは R2 署名 URL または Backend 経由で取得。

---

## 2. Service Communication Flow（サービス間通信フロー）

```
[Browser]
    |
    | HTTP (NEXT_PUBLIC_API_URL, ビルド時に固定)
    v
[Frontend :3000]  -->  [Backend :8080]
                            |
                            | DATABASE_URL (postgres:5432)
                            v
                       [PostgreSQL :5432]
                            ^
                            | (adminer から接続)
                       [Adminer :8081→8080]

[Backend :8080]
    |
    | exec: python3 -m dsa_cli run ...
    | (同一コンテナ内、/app/python はボリュームでマウント)
    v
[Python CLI] --> UniProt/PDB (外部 HTTP) --> ローカル作業ディレクトリ
    |
    | 完了後 Backend が R2 に PutObject
    v
[Cloudflare R2] (R2_ENDPOINT, R2_BUCKET)
```

- **Frontend ↔ Backend**: 同一 Docker ネットワーク内。Frontend はビルド時の `NEXT_PUBLIC_API_URL` で Backend を参照（docker-compose では `http://localhost:8080`）。ブラウザが Backend に直接リクエストするため、本番では CORS と API の URL が重要。
- **Backend ↔ PostgreSQL**: `DATABASE_URL`（例: `postgres://user:pass@postgres:5432/dsa?sslmode=disable`）。内部ネットワークのみ。
- **Backend ↔ R2**: HTTPS（R2_ENDPOINT）。Backend からのみ。
- **Python**: Backend プロセスが子プロセスとして起動。キューは Backend 内のメモリ（セマフォ `MAX_CONCURRENT=2`）で制御。Cron 等の外部ジョブキューはなし。

---

## 3. Port Exposure Analysis（ポート公開分析）

| サービス | コンテナ内ポート | ホスト公開 | 用途 |
|----------|------------------|------------|------|
| frontend | 3000 | **3000** | Next.js アプリ（ユーザー向け） |
| backend | 8080 | **8080** | REST API（フロント＋直接呼び出し） |
| postgres | 5432 | **5433** | DB（ホストから 5433 でアクセス可能） |
| adminer | 8080 | **8081** | DB 管理 UI |

- **外部公開の意図**  
  - 3000, 8080: ユーザー／フロントがアクセスするため、本番ではリバースプロキシ（Nginx/Cloudflare 等）の背後に置く想定。  
  - 5433: 開発時のホストからの接続用。本番では通常非公開推奨。  
  - 8081 (Adminer): 開発・デバッグ用。本番では公開しない推奨。

- **内部のみ**  
  - Backend → Postgres: コンテナ間は `postgres:5432`。ホストの 5433 は「開発用の余分な露出」。

---

## 4. Environment Variable Map（環境変数マップ）

### 4.1 docker-compose で渡している変数

| 変数 | 使用サービス | 内容 |
|------|--------------|------|
| POSTGRES_DB | postgres | DB 名（デフォルト: dsa） |
| POSTGRES_USER | postgres | DB ユーザー（デフォルト: dsa_user） |
| POSTGRES_PASSWORD | postgres | DB パスワード（必須） |
| DATABASE_URL | backend | 接続文字列（postgres:5432） |
| R2_ACCOUNT_ID | backend | R2 アカウント ID |
| R2_ACCESS_KEY_ID | backend | R2 アクセスキー |
| R2_SECRET_ACCESS_KEY | backend | R2 シークレットキー |
| R2_BUCKET | backend | バケット名 |
| R2_ENDPOINT | backend | R2 S3 互換エンドポイント URL |
| R2_PUBLIC_BASE_URL | backend | 未設定可。設定時は R2 公開 URL のベース（署名 URL の代替） |
| PORT | backend | 8080（固定） |
| STORAGE_DIR | backend | /app/storage |
| PYTHON_PATH | backend | python3 |
| PYTHON_DIR | backend | /app/python |
| MAX_CONCURRENT | backend | 2（実装では未使用で常に 2） |
| NEXT_PUBLIC_API_URL | frontend | ビルド時に埋め込み。compose では http://localhost:8080 |

### 4.2 バックエンドがコードで参照する変数（compose 未設定のもの）

- `MIGRATIONS_DIR`: マイグレーション SQL のディレクトリ（未設定時は実行ファイル相対で `migrations`）。
- `godotenv.Load()` で `.env` を読むため、ローカル実行時はルートの `.env` が使われる。

### 4.3 シークレットの取り扱い

- `.env` に **DATABASE_URL（パスワード含む）・R2 のキー類・POSTGRES_PASSWORD** が平文で存在。
- `.env` が Git に含まれていると、**本番の資格情報が漏洩するリスクが高い**。本番では必ず環境変数／シークレット管理（Vault・クラウドの Secrets Manager 等）に移行し、`.env` はリポジトリにコミットしない運用を推奨。

---

## 5. Production Risks（本番リスク）

### 5.1 セキュリティ

| リスク | 内容 |
|--------|------|
| **資格情報の露出** | `.env` に DB パスワード・R2 キーが平文。リポジトリに含めないこと。 |
| **Adminer 公開** | 8081 で誰でも DB に接続可能。本番では無効化するか、VPN/IP 制限のうえでのみ利用。 |
| **PostgreSQL ポート公開** | 5433 がホストにバインド。本番では backend からのみアクセスさせ、ホスト公開をやめる。 |
| **CORS 緩い** | `AllowOrigins: "*"`。本番では許可オリジンをフロントのオリジンに限定する推奨。 |
| **Cookie Secure 無効** | `Secure: false`。HTTPS 本番では `true` にすること。 |
| **POST /update-metrics** | 全分析のメトリクス一括更新。認証なし。本番では管理者専用または削除検討。 |

### 5.2 可用性・運用

| リスク | 内容 |
|--------|------|
| **ジョブ永続化** | キューはメモリのみ。Backend 再起動でキュー中のジョブは消失。DB には「分析レコード」は残るが再実行は手動。 |
| **単一プロセス** | Backend 1 台で Python も同プロセス内で実行。スケールアウトしにくい。 |
| **Python 依存のインストール** | entrypoint で pip 実行。起動が遅く、イメージの再現性が落ちやすい。本番ではマルチステージで Python 環境を固めたイメージ推奨。 |
| **MAX_CONCURRENT 未使用** | 環境変数を読んでおらず常に 2。必要ならコード修正。 |

### 5.3 開発専用の要素

- Adminer（本番では別手段で DB 管理）。
- `backend/main.go` の `app.Static("/", "./frontend/.next/static", ...)` は、コンテナ内に frontend ビルドが存在する構成でないと意味がない。現在の compose では frontend は別コンテナのため、この行は未使用に近い。
- `NEXT_PUBLIC_API_URL=http://localhost:8080` は開発用。本番ではフロントのオリジンや API ゲートウェイの URL に合わせる。

---

## 6. Recommended Production Architecture (VPS)

### 6.1 構成方針

- 1 台または少数の VPS で、Nginx をリバースプロキシとして前に立てる。
- Backend / Frontend は Docker で起動。PostgreSQL は同じ VPS のコンテナまたは別コンテナ。Adminer は本番では起動しない（または別ポート＋IP 制限）。
- ジョブは現状の「Backend 内 in-process + セマフォ」のまま運用可能。必要なら後から Redis + ワーカーに分離。

### 6.2 推奨構成図（テキスト）

```
                    [Internet]
                         |
                         v
                   [Nginx :80/443]
                    (SSL, 静的, リバースプロキシ)
                         |
         +---------------+---------------+
         |               |               |
         v               v               v
   /              /api            / (Next)
[Frontend]    [Backend :8080]   (optional: 同一 Nginx で配信)
  :3000              |
                     | postgres:5432 (内部のみ)
                     v
              [PostgreSQL]
                (port 非公開)
                     
              [Backend] --> R2 (HTTPS)
              [Backend] --> exec Python (同一コンテナ)
```

### 6.3 実施項目

- **Nginx**: 80/443 で受信。`/api` を Backend にプロキシ。`/` を Frontend（proxy_pass to 3000）にプロキシ。静的は Nginx で配信しても可。
- **環境変数**: `.env` はサーバー上にのみ配置し Git に含めない。または systemd/docker の EnvironmentFile で注入。
- **Frontend ビルド**: `NEXT_PUBLIC_API_URL=https://<your-domain>/api` のように本番 API のパスを指定してビルド。
- **compose 本番用**:  
  - adminer サービス削除またはコメントアウト。  
  - postgres の `ports: "5433:5432"` を削除（必要なら `127.0.0.1:5433:5432` に限定）。  
  - CORS を Nginx のホスト名／オリジンに合わせて制限。  
- **Cookie**: `Secure: true`、`SameSite` は Lax のまま。
- **R2**: 既存のまま。必要なら R2_PUBLIC_BASE_URL で公開 URL を返すようにする。

---

## 7. Recommended Production Architecture (Cloud)

### 7.1 構成方針

- **Frontend**: Vercel / Netlify / Cloudflare Pages 等の静的＋SSR 対応ホスティング。ビルド時に `NEXT_PUBLIC_API_URL` を本番 API の URL に設定。
- **Backend**: コンテナとして Cloud Run / ECS / App Service 等で実行。オートスケール可能に。
- **PostgreSQL**: マネージド（Cloud SQL / RDS / Supabase 等）。VPC またはプライベート接続で Backend のみ接続。
- **R2**: 現状どおり。Backend から S3 互換 API でアクセス。
- **Python**: 現状は Backend コンテナ内で実行。負荷が高くなったら「Backend API」と「Python ワーカー」を分離し、ジョブキュー（Cloud Tasks / SQS / Redis 等）で非同期実行する構成を検討。

### 7.2 推奨構成図（テキスト）

```
[Users]
    |
    v
[CDN / Edge]  (optional)
    |
    +---> [Frontend: Vercel/Pages]  (NEXT_PUBLIC_API_URL → API URL)
    |
    +---> [API Gateway / Load Balancer]
              |
              v
         [Backend: Cloud Run / ECS]
              |
              +---> [Managed PostgreSQL]  (Private)
              +---> [Cloudflare R2]
              +---> (in-container) Python CLI
```

### 7.3 実施項目

- **Frontend**: ホスティングの環境変数で `NEXT_PUBLIC_API_URL` を本番 API に設定。CORS は Backend でそのオリジンに限定。
- **Backend**: マネージド DB の接続文字列をシークレットで注入。R2 キーもシークレット。Cloud Run ならコンカレンシー 1 で複数インスタンスに分散可能（ジョブは DB で状態管理されているため）。
- **ジョブキュー分離（将来）**: ジョブ受付は Backend、実行は別ワーカー（Python 専用コンテナ）にし、キュー経由でタスクを渡す構成にするとスケールしやすい。
- **Adminer**: 本番では使わない。DB 操作はマネージドのコンソールまたは VPN 経由の専用ツールに限定。

---

## 8. Simplified Architecture Diagram (Text)

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │
              NEXT_PUBLIC_API_URL (build-time)
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         v                 v                 v
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  Frontend    │  │   Backend    │  │   Adminer    │
  │  Next.js 16  │  │   Go Fiber   │  │  (dev only)  │
  │  :3000       │  │   :8080      │  │  :8081       │
  └──────────────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │
         │                 │  DATABASE_URL   │
         │                 ├────────────────┼──────────► ┌────────────┐
         │                 │                │           │ PostgreSQL│
         │                 │                └──────────► │  :5432    │
         │                 │                             └────────────┘
         │                 │
         │                 │  exec python3 -m dsa_cli
         │                 ├──────────────► [Python CLI] --> UniProt/PDB
         │                 │                     │
         │                 │                     v
         │                 │               (result.json, png)
         │                 │                     │
         │                 │  PutObject          │
         │                 ├─────────────────────┼──────► ┌────────────┐
         │                 │                     │        │  R2 (S3)   │
         │                 │  GetObject/SignedURL│        └────────────┘
         │                 └────────────────────┘
         │
         └─────────────────────────────────────────────────────────────
                          (API calls from browser to Backend)
```

---

## 9. 補足: Python 解析のトリガーとバックグラウンド

- **トリガー**: `POST /api/jobs` で Backend が `jobManager.CreateJob()` を呼ぶ。その中で `go m.executeJob(job)` により **同プロセス内 goroutine** で実行される。Cron や外部キューは使っていない。
- **並列数**: セマフォで 2（`MAX_CONCURRENT` はコード上未使用のため常に 2）。
- **永続化**: ジョブのメタデータは DB に保存。実行中・キュー中の「実行状態」は Backend のメモリのみ。再起動でキューは消えるが、DB の分析レコードは残る。
- **R2**: 解析完了後に Backend が result.json / heatmap.png / dist_score.png / logs.txt を R2 にアップロードし、DB にキーを保存。取得時は R2 から GetObject または署名/公開 URL で返す。

以上が、コードと docker-compose に基づく現状の整理と、VPS/Cloud 向けの本番構成の提案です。
