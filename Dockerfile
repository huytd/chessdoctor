FROM python:3.10-alpine

# Set working directory
WORKDIR /app

# Install build dependencies and tools
RUN apk add --no-cache \
    build-base \
    wget \
    unzip

# Download and install Stockfish (using version 16 as an example)
RUN wget https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_linux_x64.zip && \
    unzip stockfish_16_linux_x64.zip && \
    mv stockfish_16_linux_x64/stockfish_16_x64 /usr/local/bin/stockfish && \
    chmod +x /usr/local/bin/stockfish && \
    rm -rf stockfish_16_linux_x64 stockfish_16_linux_x64.zip

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
