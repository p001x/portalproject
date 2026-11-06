FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Ensure real-time unbuffered logging, pre-configured writable cache directories, and Cloud Run port
ENV PYTHONUNBUFFERED=1 \
    MPLCONFIGDIR=/tmp/matplotlib \
    PORT=8080

# Copy the backend code and install dependencies
COPY backend /app/backend
RUN pip install --no-cache-dir python-multipart /app/backend && \
    python -c "import matplotlib.pyplot; import geopandas"

# Copy the sector shapefiles needed for Rwanda study areas
COPY sectrstu /app/sectrstu

# Copy the local vector datasets needed for Accessibility
COPY ["dataset vector", "/app/dataset vector"]

# Set the working directory to backend so uvicorn finds main.py easily
WORKDIR /app/backend

# Expose port 8080 (Cloud Run standard)
EXPOSE 8080

# Run the FastAPI app directly with exec python -m uvicorn for instant startup, signal handling, and Cloud Run PORT binding
CMD exec python -m uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1 --timeout-keep-alive 65
