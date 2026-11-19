export const dynamic = 'force-dynamic';

import { shop, contact } from '../../lib/legal.js';

export const metadata = { title: 'Xoá dữ liệu' };

export default function DataDeletion() {
  return (
    <main className="page">
      <h1>Yêu cầu xoá dữ liệu</h1>
      <p>Để xoá toàn bộ hội thoại và kết quả xem tướng của bạn tại {shop()}, hãy gửi yêu cầu theo một trong hai cách:</p>
      <ul>
        <li>Nhắn cho Fanpage nội dung "xoá dữ liệu của tôi".</li>
        <li>Gửi email tới {contact()} kèm tên Facebook của bạn.</li>
      </ul>
      <p>Chúng tôi sẽ xoá dữ liệu trong vòng 7 ngày làm việc và báo lại cho bạn.</p>
    </main>
  );
}
