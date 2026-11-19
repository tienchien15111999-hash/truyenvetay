export const dynamic = 'force-dynamic';

import { shop, contact } from '../../lib/legal.js';

export const metadata = { title: 'Điều khoản sử dụng' };

export default function Terms() {
  return (
    <main className="page">
      <h1>Điều khoản sử dụng</h1>
      <p className="muted">Áp dụng cho bot xem tướng của {shop()} trên Messenger.</p>

      <h2>Mục đích</h2>
      <p>Bot cung cấp nội dung xem tướng mặt và chỉ tay mang tính tham khảo và giải trí. Kết quả không phải là lời khuyên về sức khoẻ, tài chính, pháp lý hay bất kỳ quyết định quan trọng nào.</p>

      <h2>Cách dùng</h2>
      <p>Bạn chỉ nên gửi ảnh của chính mình hoặc ảnh của người đã đồng ý. Bot dành cho người từ 18 tuổi trở lên. Vui lòng không gửi nội dung vi phạm pháp luật hoặc phản cảm.</p>

      <h2>Thay đổi</h2>
      <p>Chúng tôi có thể thay đổi hoặc ngừng dịch vụ bất cứ lúc nào.</p>

      <h2>Liên hệ</h2>
      <p>{contact()}</p>
    </main>
  );
}
