FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

# コンテナを起動し続ける（バックエンドから呼び出されるまで待機）
CMD ["tail", "-f", "/dev/null"]
