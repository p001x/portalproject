FROM python:3.11-slim

# Set working directory
WORKDIR /app

# (System geospatial libraries removed to force fast pre-built wheel installation)

# Create a user to avoid running as root (Hugging Face Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy the backend code and install dependencies
COPY --chown=user backend $HOME/app/backend
RUN pip install --no-cache-dir python-multipart $HOME/app/backend


# Copy the sector shapefiles needed for Rwanda study areas
COPY --chown=user sectrstu $HOME/app/sectrstu

# Copy the local vector datasets needed for Accessibility
COPY --chown=user ["dataset vector", "$HOME/app/dataset vector"]

# Set the working directory to backend so uvicorn finds main.py easily
WORKDIR $HOME/app/backend

# Expose port 8080 (Cloud Run standard)
EXPOSE 8080

# Run the FastAPI app with multi-worker concurrency
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 4 --timeout-keep-alive 65"
