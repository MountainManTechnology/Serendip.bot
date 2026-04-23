FROM python:3.12-slim

WORKDIR /app

# Install system deps for lxml/readability
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY services/agent/pyproject.toml ./
RUN pip install --no-cache-dir ".[dev]" 2>/dev/null || pip install --no-cache-dir .

COPY services/agent/ .

CMD ["python", "-m", "worker"]
