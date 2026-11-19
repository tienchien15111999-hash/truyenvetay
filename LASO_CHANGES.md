# Bản sửa lá số — 16/11/2026

## Chạy và kiểm tra

Dùng Node.js 20 trở lên:

```sh
npm ci
npm test
npm run build
npm start
```

Lá số kiểm tra:
`/api/laso?name=Nguy%E1%BB%85n%20V%C4%83n%20An&gender=nam&date=1995-08-15&hour=13&viewYear=2026`

Thêm `&format=json` để kiểm tra dữ liệu được dùng để vẽ. `lunar=1` nhận ngày âm lịch; `leap=1` chọn tháng nhuận. Ngày theo YYYY-MM-DD, giờ nguyên từ 0–23. Ảnh kiểm tra có sẵn: `examples/nguyen-van-an.png`.

## Đã sửa

- Không cắt phụ tinh bằng slice(0,7). Chiều cao ảnh tăng theo số hàng sao, giữ đủ cả hai cột.
- Tứ Hóa được lấy từ cả chính tinh và phụ tinh, hiển thị thành sao độc lập; dữ liệu bot và ảnh cùng dùng generateLaSo.
- Bổ sung vòng Bác Sĩ và vòng Thái Tuế theo bộ tên Việt; phân biệt Quan Phù và Quan Phủ, tránh sao trùng tên.
- Bổ sung Thiên Y, Thiên Giải, Địa Giải, Giải Thần, Văn Tinh, Đường Phù, Quốc Ấn, Thiên La, Địa Võng, Lưu Hà, Đẩu Quân, Kiếp Sát, Đào Hoa.
- Hỏa/Linh tính theo chiều âm dương và giới tính; chuyển Hỏa Tinh của mẫu từ Thìn sang Dần.
- Bảng miếu/vượng/đắc/hãm riêng cho 13 chính tinh và 8 phụ tinh; ký hiệu Đ thay D/L không rõ nghĩa. Thiên Phủ giữ bảng iztro vì chưa có bảng Việt đầy đủ thống nhất với mẫu.
- Chuẩn hóa Tử Nữ → Tử Tức, Phụng Các → Phượng Các, Thiên Diêu → Thiên Riêu, Đài Phụ → Thai Phụ, Sỹ → Sĩ.
- Hiển thị nạp âm, âm dương, thuận/nghịch lý, quan hệ Mệnh–Cục, can chi năm xem, ngày âm/dương và giờ.
- Chân cung hiển thị chi tiểu hạn, Trường Sinh, tháng hạn. Tháng hạn tính từ tiểu hạn năm xem, tháng và giờ sinh, không gán cố định theo chỉ số cung.
- Tuổi mụ dựa trên năm âm lịch sinh; kiểm tra đầu vào và tháng nhuận không tồn tại; lỗi trả HTTP 400.
- Ghim iztro 2.6.5 cùng package-lock.json để cài đặt lặp lại không tự đổi quy tắc tính.

## Đối chiếu mẫu và giới hạn

Mẫu Nguyễn Văn An: Mệnh Sửu, Thân tại Phúc Đức/Mão, Hỏa Lục Cục, Sơn Đầu Hỏa, 32 tuổi; Tuần Thân–Dậu, Triệt Ngọ–Mùi. Hóa Lộc và Kỵ tại Thân, Quyền tại Tý, Khoa tại Dậu. Tháng 1 tại Dậu, tháng 9 tại Tỵ.

Không coi ảnh chụp là một đặc tả tuyệt đối cho mọi trường hợp. Hai ảnh đính kèm không thống nhất: ảnh trang web có Chủ Thân Thiên Tướng, ảnh thứ hai Thiên Cơ; Thai/Dưỡng cũng khác nhau. Bản sửa giữ Chủ Thân theo chi năm sinh của iztro (Hợi → Thiên Cơ), Thai tại Thìn và Dưỡng tại Mão theo vòng Trường Sinh của engine. Không gán cứng thông tin của một người vào thuật toán.

Thiên Giải dùng phép nhảy hai cung theo tháng; các trường phái có thể dùng phép khác. Độ sáng Thiên Phủ và một số phụ tinh vẫn theo engine hoặc để trống nếu không có bảng, không tự đoán. Màu sao và thứ tự hai cột không sao chép nguyên mẫu. Các sao riêng của hệ Trung Châu như Thiên Vu, Âm Sát, Thiên Nguyệt, Niên Giải không đưa vào profile hiển thị Việt này; Tuần/Triệt hiện bằng nhãn thay cho tạp diệu cùng nghĩa.

Phần đổi lịch vẫn dùng iztro/lunar-lite; chưa thay bằng bộ lịch thiên văn Việt Nam UTC+7 độc lập. Ngày gần sóc, Tết, tháng nhuận và giờ Tý muộn cần đối chiếu lịch Việt trước khi dùng làm chuẩn nghiệp vụ. Giờ 23 dùng chỉ số Tý muộn của iztro; tháng nhuận sau ngày 15 dùng tháng kế tiếp theo fixLeap=true. Đây là bản bổ sung/sửa lỗi có kiểm thử, không phải cam kết khớp AItuvi 100% cho mọi ngày sinh. Chưa triển khai lớp sao lưu niên/đại vận riêng: năm xem hiện điều khiển tuổi, tiểu hạn và tháng hạn, không biến các sao gốc thành sao lưu.

## Nguồn quy tắc để bảo trì

- Cấu trúc và dữ liệu iztro: https://docs.iztro.com/vi_VN/type-definition
- Đối chiếu công thức Việt và bảng độ sáng truyền thống: https://github.com/doanguyen/lasotuvi (App.py, AmDuong.py, DiaBan.py). Bản sửa triển khai lớp JS riêng trên iztro, không đóng gói mã Python tham chiếu.
- Ảnh do người dùng cung cấp để đối chiếu trường hợp sinh 15/08/1995 giờ Mùi.

## Kiểm thử

Các bộ test sẵn có, thêm fixture mẫu, âm/dương lịch tương đương, tháng nhuận, ngày giờ lỗi, và 100 tổ hợp 10 can × 2 giới tính × 5 giờ. Kiểm tra đủ 14 chính tinh, bốn Hóa, hai cung Tuần/hai cung Triệt, một cung Thân, đủ 12 tháng hạn, không trùng phụ tinh. Đây là kiểm tra hồi quy và cấu trúc, không thay thế bộ dữ liệu chuẩn độc lập cho mọi ngày sinh.
