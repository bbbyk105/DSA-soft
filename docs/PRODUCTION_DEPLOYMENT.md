# 本番デプロイ（Hostinger VPS 想定）

80/443 のみ公開し、Nginx を入口にする構成です。

---

## 1. 本番用 compose

```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

- **postgres**: ポート公開なし（外部から直接接続不可）
- **backend**: `127.0.0.1:8080` のみ
- **frontend**: `127.0.0.1:3000` のみ
- **adminer**: 本番 compose には含めない

---

## 2. .env（本番）

`NEXT_PUBLIC_API_URL` は **オリジンのみ** にすること。フロントは `${API_BASE_URL}/api/jobs` のように `/api` を付けて呼ぶため、`/api` を付けると二重になる。

```bash
# 正: オリジンのみ
NEXT_PUBLIC_API_URL=https://your-domain.com

# 誤: /api を付けると /api/api/jobs になる
# NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

ドメイン未取得で IP で試す場合の例:

```bash
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP
```

※ 本番では HTTPS にすること。

---

## 3. Nginx（80/443 のみ公開）

**重要**: `location /api/` の `proxy_pass` は **末尾スラッシュなし**。  
末尾を `/` にすると Nginx が `/api` を落とし、バックエンドは `/api/jobs` を期待しているため 404 になる。

`/etc/nginx/sites-available/dsa-soft`:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # 末尾スラッシュなし → リクエスト /api/jobs がそのまま Backend の /api/jobs に渡る
  location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

有効化:

```bash
sudo ln -s /etc/nginx/sites-available/dsa-soft /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

ドメインがない場合は `server_name _;` でよい。

---

## 4. HTTPS（Let's Encrypt）

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 5. ファイアウォール（UFW）

- **開放**: 22, 80, 443
- **閉じる**: 3000, 8080, 8081, 5433（Nginx 経由のみ利用）

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 6. Adminer を本番で使う場合

本番で 8081 を公開するのは避け、必要なときだけ **SSH トンネル** で見る:

```bash
# 開発用 compose で Adminer を起動したうえで、ローカルから:
ssh -L 8081:127.0.0.1:8081 user@your-vps
# ブラウザで http://localhost:8081 にアクセス
```

本番用 compose には Adminer を入れず、開発用の `docker-compose.yml` を別途「一時的に」使う運用がおすすめ。

---

## 7. まとめ

| 項目 | 内容 |
|------|------|
| NEXT_PUBLIC_API_URL | `https://your-domain.com`（末尾 /api なし） |
| Nginx /api/ | `proxy_pass http://127.0.0.1:8080;`（末尾スラッシュなし） |
| 公開ポート | 80, 443 のみ（+ SSH 22） |
| Adminer | 本番 compose には含めず、必要なときは SSH トンネル |
