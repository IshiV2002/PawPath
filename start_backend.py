"""Run with the Python interpreter from your project environment."""
from pathlib import Path
import sys
import uvicorn

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    print("Open http://127.0.0.1:8000/docs in your browser.")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
