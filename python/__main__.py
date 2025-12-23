"""DSA CLI entry point for python -m dsa_cli"""

import sys
import os

# モジュールのパスを追加
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dsa_cli import main

if __name__ == "__main__":
    main()
