import { MARITAL_FORM_LINE } from './marital-status.js';
import { DEFAULT_TREE_OFFER, DEFAULT_TREE_PAID } from './tree-data.js';
// Giá trị mặc định. Bạn sửa trong trang /admin, không cần sửa file này.

export const SETTING_KEYS = ['annual_mode', 'annual_amount', 'annual_qr_url', 'receipt_recipient','receipt_account','receipt_content','birth_form_web','birth_form_message','chart_delay_seconds','chart_wait_message','free_answer_limit','package_image_url','qr_image_url','bot_on', 'persona', 'tuvi_knowledge', 'disclaimer', 'opening_on', 'opening_images', 'opening_messages',
  'paywall_on', 'pay_amount', 'pay_info', 'ask_section_message', 'offer_message', 'paid_ok_message',
  'tree_data', 'tree_offer_message', 'tree_paid_message', 'tree_bank_code'];

export const DEFAULT_PERSONA = `Bạn là "Tử Vi Online", trợ lý xem tử vi của Fanpage.
Xưng "mình", gọi khách là "bạn". Giọng ấm áp, nhẹ nhàng, gần gũi, hơi huyền bí nhưng không doạ khách.
Nói ngắn gọn, dễ hiểu, như đang nhắn tin với bạn bè.`;

export const DEFAULT_DISCLAIMER = 'Nội dung chỉ mang tính tham khảo và giải trí, bạn cứ coi như một góc nhìn vui nha.';

// MẪU để bot chạy được ngay. Hãy xoá và dán bảng kiến thức thật của bạn vào trang /admin.
// Mẫu câu của luồng thu phí xem tử vi (chủ bot sửa trong trang quản trị, biểu tượng 💰)
export const DEFAULT_ASK_SECTION = `Mình đã lập xong lá số cho {name} rồi nhé 🌟
Hiện tại bạn đang gặp khó khăn hay quan tâm nhất điều gì? Bạn chọn một mục để mình xem trước cho bạn:
1. Tổng quan bản mệnh
2. Công danh, sự nghiệp
3. Tiền bạc, tài chính
4. Tình duyên, gia đạo
5. Sức khỏe, phúc phần
6. Vận hạn năm nay
(Bạn nhắn số hoặc kể ngắn gọn điều bạn đang lo là được ạ)`;

export const DEFAULT_OFFER = `Nếu bạn muốn xem tiếp các mục còn lại theo đúng điều bạn đang quan tâm, bạn vui lòng chuyển khoản {amount} theo thông tin sau:
{payinfo}
Chuyển xong bạn nhắn "đã chuyển" (kèm ảnh chuyển khoản nếu có), bên mình xác nhận xong sẽ xem tiếp cho bạn ngay nhé 🙏`;

export const DEFAULT_PAID_OK = `Bên mình đã nhận được thanh toán, cảm ơn {name} nhé 🙏
Bây giờ bạn muốn xem mục nào hoặc đang băn khoăn điều gì, cứ nhắn cho mình, mình sẽ luận tiếp theo lá số của bạn.`;

export const DEFAULT_SETTINGS = {
  year_sales_on: '1',
  annual_mode: 'free',
  annual_amount: '',
  annual_qr_url: '',
  birth_form_web: '1',
  birth_form_message: 'Chào bạn! Mình gửi bạn form lập lá số nhé:\n• Họ tên:\n• Giới tính:\n• Ngày/tháng/năm sinh (âm hay dương lịch):\n• Giờ sinh:\n' + MARITAL_FORM_LINE + '\nĐiền đủ thông tin, mình sẽ lập lá số cho bạn.',
  chart_delay_seconds: '10', // chờ bao nhiêu giây (giả chat) trước khi gửi ảnh lá số; 0 = gửi ngay
  chart_wait_message: '⏳ Mình đã nhận đủ thông tin của bạn rồi. Bạn đợi mình một chút để lập lá số nhé...',
  free_answer_limit: '3',
  package_image_url: '',
  qr_image_url: '',
  receipt_recipient: '',
  receipt_account: '',
  receipt_content: 'TV {ref}',
  bot_on: '1',
  persona: DEFAULT_PERSONA,
  tuvi_knowledge: '',
  opening_on: '0', // bật/tắt câu mở đầu cho khách mới
  opening_images: '[]', // JSON: danh sách mã ảnh trong kho, theo thứ tự gửi
  opening_messages: '[]', // JSON: danh sách câu mở đầu, gửi lần lượt sau các ảnh
  paywall_on: '0', // bật: xem thử 1 mục tử vi miễn phí, các mục còn lại cần chuyển khoản
  pay_amount: '',
  pay_info: '',
  ask_section_message: DEFAULT_ASK_SECTION,
  offer_message: DEFAULT_OFFER,
  paid_ok_message: DEFAULT_PAID_OK,
  disclaimer: DEFAULT_DISCLAIMER,
  tree_data: '', // JSON cây chủ đề; trống = dùng cây mẫu
  tree_offer_message: DEFAULT_TREE_OFFER,
  tree_paid_message: DEFAULT_TREE_PAID,
  tree_bank_code: '', // mã ngân hàng để tự tạo QR (ví dụ MB, VCB); trống = chỉ dùng ảnh QR chủ shop tải lên
};
