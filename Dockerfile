FROM python:3.12-slim

ENV PATH="/usr/local/bin:$PATH"

# Set working directory
WORKDIR /app

# Install build dependencies and tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Download and install Stockfish
RUN wget https://github.com/official-stockfish/Stockfish/releases/download/sf_17/stockfish-ubuntu-x86-64-avx2.tar -O stockfish.tar \
    && tar -xf stockfish.tar \
    && mv stockfish/stockfish-ubuntu-x86-64-avx2 /usr/local/bin/stockfish \
    && chmod +x /usr/local/bin/stockfish \
    && rm -rf stockfish.tar stockfish

# Verify installation
RUN stockfish --version

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Command to run the application
CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "8080"]
