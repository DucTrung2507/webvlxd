# Chọn base image là Python 3.9 slim
FROM python:3.9-slim

# Thiết lập môi trường không cần tương tác khi cài đặt gói qua apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Cập nhật hệ thống và cài đặt các gói cần thiết:
# - tesseract-ocr: cho OCR (sử dụng với pytesseract)
# - poppler-utils: cho pdf2image (chuyển PDF sang ảnh)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tesseract-ocr \
      poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Copy file requirements.txt và cài đặt các thư viện Python
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy toàn bộ source code vào image
COPY . .

# Expose cổng 5000 (Flask thường chạy trên cổng 5000)
EXPOSE 5000

# Chạy ứng dụng bằng gunicorn (server sản xuất cho Flask)
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000"]
