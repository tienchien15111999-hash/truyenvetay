export const dynamic = 'force-dynamic';

import { shop, contact } from '../../lib/legal.js';

export const metadata = { title: 'Chính sách quyền riêng tư' };

export default function Privacy() {
  return (
    <main className="page">
      <h1>Chính sách quyền riêng tư</h1>
      <p className="muted">Áp dụng cho bot xem tướng của {shop()} trên Messenger.</p>

      <h2>Dữ liệu chúng tôi nhận</h2>
      <p>Khi bạn nhắn tin cho bot, chúng tôi nhận nội dung tin nhắn, ảnh bạn gửi (ảnh mặt hoặc lòng bàn tay) và mã định danh của bạn trên Messenger. Chúng tôi không nhận số điện thoại, mật khẩu hay thông tin tài khoản Facebook của bạn.</p>

      <h2>Cách chúng tôi dùng dữ liệu</h2>
      <p>Ảnh và tin nhắn chỉ dùng để tạo nội dung xem tướng và trả lời bạn. Ảnh được gửi tới dịch vụ AI để phân tích và không được lưu trên hệ thống của chúng tôi sau khi xử lý. Chúng tôi lưu lại nội dung hội thoại và một bản tóm tắt bằng chữ về kết quả xem để bot trả lời tiếp các câu hỏi của bạn.</p>

      <h2>Chia sẻ dữ liệu</h2>
      <p>Chúng tôi không bán dữ liệu của bạn. Nội dung được chuyển cho nhà cung cấp dịch vụ AI và lưu trữ dữ liệu chỉ để bot hoạt động.</p>

      <h2>Quyền của bạn</h2>
      <p>Bạn có thể yêu cầu xoá dữ liệu bất cứ lúc nào, xem hướng dẫn tại <a href="/data-deletion">trang xoá dữ liệu</a>.</p>

      <h2>Liên hệ</h2>
      <p>{contact()}</p>
    </main>
  );
}
