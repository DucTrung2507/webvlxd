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
    temp_path = os.path.join("temp.pdf")
    pdf_file.save(temp_path)
    
    lines = []

    # Kiểm tra nội dung PDF (văn bản hoặc hình ảnh)
    try:
        with pdfplumber.open(temp_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    lines.extend(text.splitlines())
    except:
        # Nếu không đọc được văn bản, dùng OCR
        images = convert_from_path(temp_path)
        for image in images:
            text = pytesseract.image_to_string(image)
            lines.extend(text.splitlines())

    os.remove(temp_path)  # Xóa file tạm sau khi xử lý

    # Tạo PDF mới với mỗi dòng trên một trang riêng
    output_pdf = FPDF(format='A4')

    for line in lines:
        if line.strip():  # Bỏ dòng trống
            output_pdf.add_page()
            output_pdf.set_font(font_name, style='', size=font_size)
            output_pdf.set_xy(x_pos, y_pos)
            page_width = output_pdf.w - 2 * output_pdf.l_margin
            output_pdf.cell(page_width, 10, line, align=align)

    # Xuất file PDF ra bộ nhớ
    pdf_bytes = BytesIO()
    pdf_bytes.write(output_pdf.output(dest='S').encode("latin1", errors="ignore"))
    pdf_bytes.seek(0)

    return send_file(pdf_bytes, mimetype='application/pdf', as_attachment=True, download_name="output.pdf")

if __name__ == '__main__':
    app.run(debug=True)
