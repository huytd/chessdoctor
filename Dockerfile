FROM python:3.10-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including Stockfish and build dependencies
RUN apk add --no-cache \
    stockfish \
    gcc \
    musl-dev \
    libffi-dev \
    && ln -s /usr/bin/stockfish /usr/local/bin/stockfish

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Command to run the application
CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "8080"]
