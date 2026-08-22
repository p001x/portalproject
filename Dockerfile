FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if any are needed for geospatial libraries (e.g. gdal)
RUN apt-get update && apt-get install -y \
    build-essential \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a user to avoid running as root (Hugging Face Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy the pyproject.toml and install dependencies
COPY --chown=user pyproject.toml $HOME/app/
RUN pip install --no-cache-dir .

# Copy the backend code
COPY --chown=user backend $HOME/app/backend

# Copy the sector shapefiles needed for Rwanda study areas
COPY --chown=user sectrstu $HOME/app/sectrstu

# Copy the local vector datasets needed for Accessibility
COPY --chown=user ["dataset vector", "$HOME/app/dataset vector"]

# Set the working directory to backend so uvicorn finds main.py easily
WORKDIR $HOME/app/backend

# Expose port 8000 (Render standard)
EXPOSE 8000

# Run the FastAPI app (Render will inject the PORT environment variable)
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
