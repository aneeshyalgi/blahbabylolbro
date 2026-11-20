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

# Install Python dependencies. PyTorch (needed by sentence-transformers) is installed first as the CPU-only build:
# the default build from PyPI pulls about 2 GB of NVIDIA CUDA libraries that this server cannot use, which made the
# build slow and broke the download on Render. requirements.txt then keeps the installed CPU build.
RUN pip install --no-cache-dir --trusted-host download.pytorch.org --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple "torch==2.15.0+cpu"
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
ENV RELEASE_NOTES_DIR=/data/uploads/release_notes
ENV RWA_DATABASE_PATH=/data/rwa_data.db

# Prepare writable data directories for local container runs.
RUN mkdir -p /data/uploads/datasets /data/uploads/code /data/uploads/release_notes /data/results

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
