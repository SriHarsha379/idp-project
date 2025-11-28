# Use a Python base image with Tesseract support
FROM python:3.11-slim-bookworm

# Install Tesseract and poppler (required by pdf2image)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libsm6 libxext6 libxrender1 \
    poppler-utils && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ./python /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000
