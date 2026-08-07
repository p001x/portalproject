FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if any are needed for geospatial libraries (e.g. gdal)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the pyproject.toml and install dependencies
COPY pyproject.toml /app/
# (Optional) If there is a uv.lock, we could use uv, but pip is simpler
RUN pip install --no-cache-dir .

# Copy the backend code
COPY backend /app/backend

# Copy the sector shapefiles needed for Rwanda study areas
COPY sectrstu /app/sectrstu

# Copy the local vector datasets needed for Accessibility
COPY "dataset vector" "/app/dataset vector"

# Set the working directory to backend so uvicorn finds main.py easily
WORKDIR /app/backend

# Expose port 8000 (Koyeb default for web services)
EXPOSE 8000

# Run the FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
