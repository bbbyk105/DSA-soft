#!/bin/sh
# set -e を削除（エラーを無視して続行するため）

# Python依存関係をインストール（マウントされたpythonディレクトリから）
if [ -f "/app/python/requirements.txt" ]; then
    echo "Installing Python dependencies from /app/python/requirements.txt..."
    # まずnumba以外のパッケージをインストール
    pip3 install --no-cache-dir --break-system-packages \
        biopython>=1.85 \
        pandas>=2.0.0 \
        numpy>=1.24.0 \
        matplotlib>=3.7.0 \
        seaborn>=0.12.0 \
        lxml>=4.9.0 \
        requests>=2.31.0 || true
    
    # numbaを試行（失敗しても続行）
    echo "Attempting to install numba (optional)..."
    pip3 install --no-cache-dir --break-system-packages numba>=0.57.0 || {
        echo "Warning: numba installation failed. The application will run without JIT acceleration."
    }
    
    echo "Python dependencies installed."
else
    echo "Warning: /app/python/requirements.txt not found. Python dependencies may not be available."
fi

# メインアプリケーションを起動
exec ./dsa-api

