import { maritalContext } from './marital-status.js';
import { TUVI_TEACHING_STYLE, thienBanNoName } from './tuvi-style.js';
// Luồng bán xem tử vi: xem thử 1 mục miễn phí -> mời chuyển khoản -> chủ shop xác nhận -> xem hết các mục.
// File này chứa các mục, câu mẫu và lời dặn gửi cho Gemini.

export const SECTIONS = [
  { key: 'tong_quan', label: 'Tổng quan bản mệnh', palaces: ['MỆNH'], body: true },
  { key: 'su_nghiep', label: 'Công danh, sự nghiệp', palaces: ['QUAN LỘC', 'THIÊN DI', 'NÔ BỘC'] },
  { key: 'tai_chinh', label: 'Tiền bạc, tài chính', palaces: ['TÀI BẠCH', 'ĐIỀN TRẠCH'] },
  { key: 'tinh_duyen', label: 'Tình duyên, gia đạo', palaces: ['PHU THÊ', 'TỬ NỮ', 'TỬ TỨC', 'PHỤ MẪU', 'HUYNH ĐỆ'] },
  { key: 'suc_khoe', label: 'Sức khỏe, phúc phần', palaces: ['TẬT ÁCH', 'PHÚC ĐỨC'] },
  { key: 'van_han', label: 'Vận hạn năm nay', palaces: null }, // null = xét tất cả các cung
];

export function sectionByKey(key) {
  return SECTIONS.find((s) => s.key === key) || null;
}

export function fillTemplate(text, vars) {
  // Khách chỉ được gọi là “bạn”: {name} luôn thành “bạn”, không bao giờ là họ tên.
  return String(text || '').replace(/\{(name|amount|payinfo)\}/g, (_, k) => (k === 'name' ? 'bạn' : vars[k] ?? ''));
}

// Chỉ giữ các cung liên quan đến mục đang luận (khách chưa trả phí không nhận dữ liệu các mục khác)
export function palacesForSection(laSoData, section) {
  if (!section.palaces) return laSoData.palaces;
  const out = {};
  for (const [branch, p] of Object.entries(laSoData.palaces)) {
    if (section.palaces.includes(p.name) || (section.body && p.isBodyPalace)) out[branch] = p;
  }
  return out;
}

const SAFETY = `AN TOÀN (bắt buộc):
- Không nói điều nặng nề, doạ dẫm: chết chóc, bệnh nặng, tai nạn, ly hôn, phá sản, "số khổ", "bị ếm"... Điều chưa tốt chỉ nói như lưu ý kèm cách giữ cân bằng.
- Tuyệt đối không dùng lời doạ hay gây sợ để thúc khách trả tiền, và không nhắc đến tiền, thu phí hay chuyển khoản trong bài luận.
- Sức khỏe: chỉ nhắc chung giữ gìn sức khỏe, không chẩn đoán, không khuyên thuốc. Tiền bạc, đầu tư, pháp lý, quyết định lớn: chỉ nói xu hướng và khuyên khách tự cân nhắc.
- Khách có dấu hiệu rất buồn, tuyệt vọng hoặc nói đến chuyện tự làm hại mình: dừng luận, hỏi thăm ân cần và khuyên nói chuyện với người thân hoặc gọi đường dây hỗ trợ tâm lý.`;

const STYLE = `CÁCH VIẾT (tin nhắn Messenger): chữ thường, KHÔNG dùng markdown (không dấu *, **, #), có thể dùng "•" và vài emoji nhẹ.`;

function knowledgeBlock(settings) {
  const k = settings.tuvi_knowledge && settings.tuvi_knowledge.trim();
  return k ? `KIẾN THỨC LUẬN GIẢI CỦA CHỦ BOT (ưu tiên làm theo cách luận này, vẫn chỉ dùng các sao đã an):\n${k}\n\n` : '';
}

// Luận RIÊNG một mục (bản xem thử miễn phí)
export function buildSectionPrompt(settings, laSoData, section, difficulty = '', maritalStatus) {
  const palaces = palacesForSection(laSoData, section);
  return `VAI TRÒ:
${settings.persona}\n${TUVI_TEACHING_STYLE}
${maritalContext(maritalStatus)}
Bạn đồng thời là chuyên gia Tử Vi Đẩu Số Nam Phái uyên bác.

NHIỆM VỤ:
Luận giải RIÊNG mục "${section.label}" cho khách (chỉ gọi là "bạn", không dùng họ tên). CHỈ luận mục này, không luận các mục khác.
${difficulty ? `Khách cho biết điều đang lo: "${difficulty}". Hãy hướng lời luận vào đúng điều khách đang quan tâm.` : ''}
TUYỆT ĐỐI chỉ dựa vào các sao đã an trong dữ liệu dưới đây, không bịa sao khác:

=== THIÊN BÀN ===
${JSON.stringify(thienBanNoName(laSoData.thienBan), null, 2)}

=== CÁC CUNG LIÊN QUAN ===
${JSON.stringify(palaces, null, 2)}

${knowledgeBlock(settings)}YÊU CẦU:
- Viết khoảng 1000 đến 1600 ký tự, 2 đến 3 đoạn ngắn. Nêu 2 đến 3 sao hoặc cung then chốt và ý nghĩa của chúng, kèm lời khuyên thiết thực.
- Giọng ấm áp, sâu sắc, định hướng tích cực.
- Kết bài thêm đúng 1 câu nhắc: "${settings.disclaimer}" Nếu cần, hỏi một câu cụ thể về hoàn cảnh khách; không yêu cầu khách xác nhận bài luận đúng.

${SAFETY}
${STYLE}`;
}

// Khách ĐÃ THANH TOÁN: luận mọi mục theo hướng khách hỏi, dùng toàn bộ lá số
export function buildPaidConsultPrompt(settings, laSoData, profile, sectionsRead, maritalStatus) {
  const read = (sectionsRead || []).map((k) => (sectionByKey(k) || {}).label).filter(Boolean);
  const other = '';
  return `VAI TRÒ:
${settings.persona}\n${TUVI_TEACHING_STYLE}
${maritalContext(maritalStatus)}
Bạn đồng thời là chuyên gia Tử Vi Đẩu Số Nam Phái uyên bác.

TÌNH TRẠNG: Khách này ĐÃ THANH TOÁN, được xem tất cả các mục của lá số của khách theo hướng khách hỏi.
Các mục đã luận trước đó: ${read.length ? read.join(', ') : 'chưa có'}. Đừng lặp lại nguyên văn các mục đã luận trừ khi khách hỏi lại.

NHIỆM VỤ: Trả lời đúng câu hỏi hoặc mục khách yêu cầu (công danh, tài chính, tình duyên, gia đạo, sức khỏe, phúc phần, vận hạn năm ${laSoData.thienBan.viewYear}, các đại vận...). TUYỆT ĐỐI chỉ dựa vào các sao đã an trong dữ liệu, không bịa sao khác:

=== THIÊN BÀN ===
${JSON.stringify(thienBanNoName(laSoData.thienBan), null, 2)}

=== 12 CUNG CHỨC ===
${JSON.stringify(laSoData.palaces, null, 2)}
${other}
${knowledgeBlock(settings)}YÊU CẦU: viết 900 đến 1600 ký tự cho mỗi câu hỏi, rõ ràng, thiết thực. Cuối bài gợi ý nhẹ một mục khác khách có thể muốn xem thêm. Không nhắc đến tiền hay thu phí.

${SAFETY}
${STYLE}`;
}

const LIST = SECTIONS.map((s) => `- ${s.key}: ${s.label}`).join('\n');

// Phân loại ý định của khách trong luồng bán hàng
export function buildRouterPrompt(stage, message) {
  return `PHÂN LOẠI Ý ĐỊNH của khách đang xem Tử Vi. Giai đoạn hiện tại: ${stage}.
Các mục tử vi (key: tên):
${LIST}

Tin nhắn của khách: "${String(message).replace(/"/g, "'")}"

Chọn ĐÚNG MỘT intent:
- "pick_section": khách chọn mục (bằng số 1-6 hoặc tên mục) hoặc kể điều đang lo thuộc một mục nào đó.
- "positive": khách tỏ ý hài lòng, thấy đúng, muốn xem thêm hoặc xem tiếp (nhưng không nêu mục cụ thể).
- "ask_price": khách hỏi giá, phí, cách thanh toán, số tài khoản.
- "paid_claim": khách nói đã chuyển khoản hoặc đã thanh toán.
- "other": các trường hợp còn lại (chào, hỏi chung, nghi ngờ, từ chối, chưa muốn).

Số 1-6 tương ứng thứ tự các mục ở trên. "sections" là danh sách key mục khách quan tâm, mục quan trọng nhất đứng đầu (rỗng nếu không có). "difficulty" là điều khách đang lo, tóm tắt ngắn (rỗng nếu không có).

Trả về DUY NHẤT một object JSON hợp lệ, không markdown:
{"intent": "pick_section" | "positive" | "ask_price" | "paid_claim" | "other", "sections": [string], "difficulty": string}`;
}

export const CLASSIFY_IMAGE_PROMPT = `Ảnh này thuộc loại nào? Trả lời ĐÚNG MỘT từ:
- bill: ảnh chụp màn hình hoặc biên lai chuyển khoản, giao dịch ngân hàng, ví điện tử
- khac: loại khác`;

export const MSG = {
  reaskSection: 'Bạn cho mình biết bạn đang quan tâm hoặc gặp khó khăn nhất ở mục nào nhé (1 tổng quan, 2 sự nghiệp, 3 tiền bạc, 4 tình duyên, 5 sức khỏe, 6 vận hạn năm nay), mình sẽ xem trước cho bạn ạ.',
  remindPay: 'Để mình xem tiếp mục này cho bạn, bạn hoàn tất chuyển khoản theo thông tin phía trên giúp mình nhé. Chuyển xong bạn nhắn "đã chuyển", bên mình xác nhận xong sẽ xem ngay ạ 🙏',
  pending: 'Mình đã ghi nhận thông tin chuyển khoản của bạn ạ. Bên mình đang kiểm tra và sẽ xác nhận trong ít phút, bạn đợi mình một chút nhé 🙏',
  noPayInfo: '(bên mình sẽ nhắn thông tin chuyển khoản cho bạn ngay)',
};

// Tin nhắn trông như thông tin ngày giờ sinh (khách điền theo lời mời, không cần gõ "xem tử vi")
export function looksLikeBirthInfo(text) {
  const t = String(text || '');
  if (/\b\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*(19|20)\d{2}\b/.test(t)) return true;
  return /(sinh|ngày sinh|năm sinh)/i.test(t) && /\b(19|20)\d{2}\b/.test(t) && /(nam|nữ|giờ|\d\s*h)/i.test(t);
}
