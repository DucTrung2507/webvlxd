from flask import Flask, render_template, request, send_file
import pdfplumber
from fpdf import FPDF
from io import BytesIO
from pdf2image import convert_from_path
import pytesseract


import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    pdf_file = request.files.get('pdf_file')

    # Kiểm tra file hợp lệ
    if not pdf_file or not pdf_file.filename.endswith('.pdf'):
        return "Vui lòng tải lên một file PDF hợp lệ.", 400

    # Lấy thông tin từ form
    font_name = request.form.get('font_name', 'Arial')
    font_size = int(request.form.get('font_size', 40))
    x_pos = float(request.form.get('x_pos', 10))
    y_pos = float(request.form.get('y_pos', 50))
    align = request.form.get('align', 'C')

    # Lưu file tạm để xử lý
    temp_path = "temp.pdf"
    pdf_file.save(temp_path)
    
    lines = []
    try:
        with pdfplumber.open(temp_path) as pdf:
            # Duyệt qua từng trang của file PDF
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    # Nếu có text, tách và thêm từng dòng vào list
                    lines.extend(text.splitlines())
                else:
                    # Nếu không có text (PDF dạng ảnh), chuyển trang đó thành ảnh để OCR
                    images = convert_from_path(temp_path, first_page=i+1, last_page=i+1)
                    for image in images:
                        ocr_text = pytesseract.image_to_string(image)
                        lines.extend(ocr_text.splitlines())
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)  # Log chi tiết
        return f"Internal server error: {e}", 500

    os.remove(temp_path)  # Xóa file tạm sau khi xử lý

    # Xử lý các ký tự không thuộc Latin-1, tránh lỗi khi mã hóa
    clean_lines = [line.encode('latin1', errors='ignore').decode('latin1') for line in lines]

    # Tạo một PDF mới với mỗi dòng được đưa lên một trang riêng
    output_pdf = FPDF(format='A4')
    for line in clean_lines:
        if line.strip():  # Bỏ qua dòng trống
            output_pdf.add_page()
            output_pdf.set_font(font_name, style='', size=font_size)
            output_pdf.set_xy(x_pos, y_pos)
            page_width = output_pdf.w - 2 * output_pdf.l_margin
            output_pdf.cell(page_width, 10, line, align=align)

    # Xuất file PDF ra bộ nhớ và gửi về cho người dùng
    pdf_bytes = BytesIO()
    pdf_bytes.write(output_pdf.output(dest='S').encode('latin1', errors='ignore'))
    pdf_bytes.seek(0)
    
    return send_file(pdf_bytes, mimetype='application/pdf', as_attachment=True, download_name="output.pdf")

if __name__ == '__main__':
    app.run(debug=True)
