# Use a lightweight Python base image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies (for Ollama and other tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama (for local Mistral inference)
RUN curl -fsSL https://ollama.ai/install.sh | sh

# Set up the working directory
WORKDIR /app

# Copy project files and install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY idea_manager.py .
COPY .env.example .env

# Make the script executable
RUN chmod +x idea_manager.py

# Create the ~/.ideas directory for persistent storage
RUN mkdir -p /root/.ideas

# Set the entrypoint to run the CLI
ENTRYPOINT ["python", "idea_manager.py"]
CMD ["--help"]
