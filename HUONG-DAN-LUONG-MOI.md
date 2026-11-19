# Cài gói năm và gói trọn đời

Trong **💰 Thu phí xem tử vi**, chọn **Miễn phí xem năm** hoặc **Thu phí cả hai gói** và bấm **Lưu thay đổi**. Năm xem lấy theo năm kế tiếp ở Việt Nam khi khách bắt đầu lập lá số.

- **Miễn phí** là mặc định. Bot gửi lá số, luận năm, mời xem trọn đời và trả lời câu hỏi miễn phí theo số lượt đã cài.
- **Thu phí**. Sau khi nhận đủ thông tin sinh, bot gửi ảnh lá số và hỏi khách chọn **1. Xem năm** hoặc **2. Xem trọn đời**. Khách chưa mua gói chỉ thấy lựa chọn, kể cả khi nhắn “xem tiếp” hoặc hỏi về công việc, tình duyên.
- Bạn có thể đổi lại chế độ bất cứ lúc nào. Chế độ mới áp dụng khi khách chưa đặt gói nhắn tiếp. Đơn đã gửi thông tin chuyển khoản giữ tên gói, giá và nội dung của đơn đó.

Để khách điền hoàn toàn trong Messenger, vào **Câu mở đầu**, tắt **Hiện nút mở phiếu web** rồi lưu. Nếu bật nút, bot gửi phiếu bằng nút bấm. Khi Messenger từ chối nút, bot mời khách nhắn thông tin trực tiếp. Màn hình web có thể hiển thị tên miền ở thanh trên. Để dùng tên shop, kết nối tên miền riêng với Vercel, đặt NEXT_PUBLIC_BASE_URL bằng địa chỉ HTTPS đó rồi triển khai lại.

Khi bật phiếu web, khách bấm **Điền phiếu lập lá số** trong tin nhắn mở đầu để điền trên điện thoại. Phiếu riêng của mỗi hội thoại dùng một lần trong vòng 12 giờ. Khách có thể nhắn **xin phiếu** để lấy lại liên kết, hoặc gửi thông tin trực tiếp trong chat. Khi khách bấm gửi, bot dùng dữ liệu trên phiếu để lập lá số. Để thử sau khi triển khai, vào **Thử bot**, nhắn **xin phiếu** rồi mở nút trong câu trả lời.

Form hỏi thêm tình trạng hôn nhân để bot tư vấn tình cảm, gia đạo phù hợp với hoàn cảnh khách chia sẻ. Nếu đã đủ thông tin sinh mà còn thiếu mục này, bot hỏi thêm một lần. Khách có thể nhắn “bỏ qua” để tiếp tục. Bạn sửa lời hỏi ở **Câu mở đầu → Lời mời điền phiếu lập lá số**.

Nhập giá trọn đời và giá xem năm. Bấm **Tải ảnh lên** để chọn ảnh giới thiệu và mã QR cho từng gói. Ảnh giới thiệu gửi trong lời chào. Mã QR gửi khi khách chọn gói cần thanh toán.

Trong **Tài khoản nhận tiền**, nhập tên người nhận như trên biên lai. Số tiền đối chiếu lấy từ giá tại thời điểm khách chọn gói. Bạn có thể bổ sung ngân hàng và số tài khoản trong **Thông tin chuyển khoản cho khách**.

Nếu khách gửi biên lai trước khi chọn gói, bot dò tên người nhận và giá để tìm gói phù hợp. Khi cả hai gói cùng giá, khách chỉ cần nhắn tên gói.

Khi khách gửi ảnh cho đơn, bot báo kết quả đối chiếu tên người nhận và số tiền trong hội thoại và nhật ký. Nếu đã cấu hình Telegram, chủ shop cũng nhận thông báo ở đó. Khi ngân hàng báo có, mở hội thoại rồi bấm **Xác nhận đã nhận tiền**. Bạn có thể xác nhận ngay cả khi khách chưa gửi ảnh. Nếu khách đã có lá số nhưng chưa chọn gói trong chat, bấm **Mở gói năm** hoặc **Mở gói trọn đời** theo khoản vừa nhận.

- **Gói năm** mở bài luận và hỏi đáp trong năm đã chọn. Nếu AI đang bận hoặc cần đọc lại, khách nhắn “xem bài năm”. Khách có thể mua thêm gói trọn đời.
- **Gói trọn đời** cho khách chọn mục muốn xem trước, sau đó dùng “xem tiếp”, “mục lục” hoặc “xem lại phần N”.

Đặt địa chỉ công khai của ứng dụng tại NEXT_PUBLIC_BASE_URL để Messenger tải ảnh lá số và ảnh trong kho.

Trong **Hộp thoại khách hàng**, chọn khách rồi gạt **Bot bật / Bot tắt** cạnh tên để chuyển sang trả lời tay trên Messenger. Tin nhắn đến trong lúc tắt vẫn hiện trong hội thoại. Bật lại để bot xử lý tin mới của khách đó. Công tắc của Fanpage và của toàn bộ bot cũng cần bật để gửi trả lời tự động.


## Câu nhắc khách gửi thêm thông tin sinh

Khi khách mới gửi thiếu thông tin (ví dụ thiếu giới tính hoặc giờ sinh), bot gom tin 30 giây rồi chờ **thêm 60 giây** mới nhắn câu nhắc, tổng khoảng 90 giây. Khách nhắn thêm trong lúc chờ thì bot bỏ câu nhắc và xử lý tin mới. Muốn đổi số giây chờ thêm: trên Vercel vào Settings → Environment Variables, thêm BIRTH_NUDGE_WAIT_SECONDS (ví dụ 120; tối đa 120, đặt 0 là nhắc ngay sau 30 giây), rồi Redeploy.
