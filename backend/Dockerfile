# Backend Dockerfile for RWA Project
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads/code uploads/datasets results

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV APP_DATA_ROOT=/data
ENV DATASETS_DIR=/data/uploads/datasets
ENV CODE_DIR=/data/uploads/code
ENV RESULTS_DIR=/data/results
ENV RWA_DATABASE_PATH=/data/rwa_data.db

# Prepare writable data directories for local container runs.
RUN mkdir -p /data/uploads/datasets /data/uploads/code /data/results

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
