# Chế độ cây chủ đề (nút bấm gợi ý)

Khách nhận lá số xong sẽ thấy các nút chủ đề (Sự nghiệp, Tiền bạc, Tình duyên...). Khách bấm nút nào, bot luận mục đó rồi hiện các nút con. Mục có khóa 🔒 thì khách trả tiền riêng cho mục đó.

## Làm 4 bước

1. **Tải file lên GitHub** thay bản cũ như mọi lần. Vercel tự cập nhật. Bạn không cần chạy lệnh gì thêm.
2. **Bấm 🌳 trên đầu trang quản trị.** Ở khung "Chế độ cho từng Fanpage", chọn **Cây chủ đề** cho Fanpage muốn dùng. Fanpage nào để **Chế độ cũ** thì chạy y như trước.
3. **Sửa các nút trong 🌳:**
   - Gõ chữ trên nút (tối đa 20 ký tự).
   - Ô bên dưới là lời dặn AI luận gì khi khách bấm nút đó.
   - Muốn khóa mục: tick **🔒 Khóa**, nhập giá, tải ảnh QR của mục đó.
   - Bí ý: bấm **✨ AI gợi ý nút con** (hoặc **✨ AI gợi ý nút gốc**), AI thêm sẵn vài nút, bạn sửa lại cho hợp ý.
   - Nút cuối nhánh có thể tick **AI gợi ý câu hỏi tiếp cho khách**.
   - Xong bấm **Lưu thay đổi**.
4. **Bấm 💰**, điền **Tên người nhận** (bắt buộc nếu có mục khóa) và số tài khoản. Lưu lại.

## Thử trước khi cho khách dùng

Vào tab **Thử bot**, tick **Thử theo chế độ cây chủ đề**, nhắn thông tin sinh. Các nút hiện ra dưới tin nhắn, bấm thử như khách.

## Khi khách trả tiền

- Khách bấm mục khóa: bot gửi QR và số tiền của đúng mục đó, kèm nội dung chuyển khoản có mã riêng.
- Khách gửi ảnh chuyển khoản: bot đối chiếu tên người nhận và số tiền, rồi báo bạn.
- Bạn kiểm tra tiền vào tài khoản, mở hội thoại của khách, bấm **✅ Xác nhận đã nhận tiền**. Đúng mục khách vừa trả được mở (cả các nút con của mục đó).
- Khách trả gộp: bấm **Mở tất cả các mục**.
- **Thu hồi quyền xem** khóa lại các mục đã mở.

## Cần biết

- Mục khóa bị chặn bằng code. Khách gõ lách thì bot vẫn chặn.
- Khách gõ câu hỏi tự do không thuộc mục nào: AI trả lời ngắn trong phạm vi mục khách đang xem, tối đa theo "Số lượt hỏi thêm" trong ⚙️ (mặc định 3). Phần này chặn bằng lời dặn AI, không chặn bằng code như nút bấm.
- Nút chỉ hiện ở tin mới nhất của bot. Messenger cho tối đa 13 nút mỗi lần.
- Nếu đã quá 24 giờ kể từ tin cuối của khách, Messenger không cho bot nhắn thông báo mở mục. Bạn nhắn tay cho khách.
- QR tự tạo (khi bạn điền "Mã ngân hàng" như MB, VCB) dùng dịch vụ img.vietqr.io. Nếu QR không hiện đúng, bạn tải ảnh QR của mình lên từng mục.

## Mục khóa: ảnh giới thiệu gói và QR

Khi tick **🔒 Khóa** cho một mục, ngoài **Tải QR lên** bạn có thể bấm **Tải ảnh giới thiệu gói** (không bắt buộc). Khách bấm mục khóa thì bot gửi ảnh giới thiệu trước, rồi tới QR, rồi tin nhắn thông tin chuyển khoản. Gói mở hết cũng có ô ảnh giới thiệu riêng.

## Cuối nhánh

Ở nút cuối nhánh (không còn nút con), bot không hiện nút **Quay lại** và **Mục chính**; nếu bạn bật "AI gợi ý câu hỏi tiếp" thì chỉ hiện các câu gợi ý đó. Khách vẫn gõ "menu" để về danh sách chính. Ở giữa cây các nút này vẫn hiện.

## Xem cây gọn

Nút nào đang khóa có ổ khóa 🔒 to ngay bên trái dòng, dòng nền vàng nhạt kèm giá. Nút con của một mục khóa hiện ổ khóa mờ (khách trả tiền mục cha thì mở luôn). Nút cha ghi "🔒 n mục con" nếu bên trong có mục khóa.

Trong 🌳 mỗi nút là một dòng gọn: tên nút, 🔒 kèm giá, QR/🖼/📝/✨ nếu đã có, và "n nút con" hoặc "cuối nhánh". Dòng nào có lỗi (thiếu chữ, chữ quá 20 ký tự, khóa mà chưa có giá) hiện ⚠️ ngay trên dòng. Bấm vào dòng để mở phần sửa. **Mở hết** và **Thu gọn hết** nằm phía trên danh sách. Mỗi cấp có màu vạch bên trái riêng. Nút mới thêm tự mở sẵn để bạn gõ luôn.

## Gửi phiếu và chờ trước khi gửi lá số

- Công tắc **📝 Gửi phiếu: BẬT/TẮT** nằm trên đầu trang. Tắt thì bot không gửi nút phiếu, khách nhắn thông tin sinh bằng tin nhắn. Khách xin form thì bot gửi mẫu chữ ở ô "Lời mời điền phiếu" (⚙️).
- Khi đã nhận đủ thông tin (dù khách điền phiếu hay nhắn chữ), bot nhắn câu báo đợi, hiện "đang gõ" khoảng 10 giây rồi mới gửi ảnh lá số. Câu báo và số giây (0 đến 30) sửa trong ⚙️.

## Danh sách đánh số

Danh sách "1. ... 2. ..." chỉ hiện ở màn hình chọn mục (sau khi gửi lá số, hoặc khi khách quay về danh sách). Sau mỗi câu luận bot chỉ gửi nội dung, không kèm danh sách hay câu hỏi lặp lại; các nút vẫn nằm bên dưới.

## Icon và thanh toán

- Bot không gửi icon (emoji) cho khách: tin chữ, nút gợi ý và danh sách đều tự bỏ icon, kể cả ổ khóa trước tên mục khóa. Trong trang quản trị bạn vẫn thấy ổ khóa để biết mục nào khóa. Muốn cho phép lại icon, đặt biến ALLOW_EMOJI = 1 trên Vercel rồi Redeploy.
- Khách bấm mục khóa mà bot báo "chờ chủ shop bổ sung thông tin thanh toán": mã QR không đủ. Cần có **giá hợp lệ** của mục và **Tên người nhận** trong 💰 (đúng như trên biên lai). Điền Tên người nhận, bấm Lưu thay đổi là được. Trang 🌳 sẽ hiện dòng đỏ nhắc khi bạn có mục khóa mà chưa điền tên này.

## Khách hỏi thêm trong một mục

Khách đang xem một mục (ví dụ Tình duyên 2027) rồi gõ câu hỏi cụ thể ("năm sau tôi có con không"): bot trả lời đúng câu hỏi đó theo lá số, trong phạm vi mục đang xem. Bot không gửi lại bài của mục. Khách gõ "xem tình duyên" (chỉ muốn mở mục) thì bot gửi bài của mục như khi bấm nút. Mục khóa vẫn bị chặn bằng code.

## Cách gọi khách

Bot chỉ xưng "mình" và gọi khách là "bạn", không bao giờ gọi họ tên hay tên riêng. Chữ {name} trong mọi câu mẫu bạn tự soạn (lời chào, mời chuyển khoản, báo nhận tiền...) sẽ tự thành "bạn". Họ tên khách không được đưa cho AI, và nếu AI lỡ viết đủ họ tên thì bot tự đổi thành "bạn". Thông báo gửi riêng cho chủ shop vẫn ghi tên khách để bạn biết là ai.
