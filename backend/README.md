# GovernIQ Backend API

FastAPI-powered backend service for the Governance Graph Builder.

## Requirements
- Python 3.11+
- `uv` (recommended) or `pip`

## Setup & Running
```bash
# Create and activate virtual environment
uv venv
.venv\Scripts\activate  # On Windows
# source .venv/bin/activate  # On Unix/macOS

# Install dependencies
uv pip install -e ".[dev]"

# Copy environment variables
cp .env.example .env

# Run development server
uvicorn app.main:app --reload --port 8000
```

## Running Verification Commands
```bash
ruff check .
ruff format --check .
mypy app
pytest
```
