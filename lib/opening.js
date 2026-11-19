import { getSettings, countMessages, sql, ensureSchema } from './db.js';

function parseList(value) {
  try {
    const v = JSON.parse(value || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Tin chỉ là lời chào ngắn (không ảnh, không số, không xin xem tử vi) thì câu mở đầu đã đủ trả lời
const TUVI_WORDS = /(tử vi|tu vi|lá số|la so|xem hạn|xem vận hạn)/i;
export function isGreetingOnly(text, imageCount) {
  const t = String(text || '').trim();
  return imageCount === 0 && t.length <= 20 && !/\d/.test(t) && !TUVI_WORDS.test(t);
}

// Quyết định có gửi câu mở đầu cho khách này không.
// Trả về null (không gửi) hoặc { imageIds, messages, skipAI, note }.
export async function planOpening(psid, text, imageCount) {
  const settings = await getSettings();
  if (settings.year_sales_on === '1') return null;
  if (settings.opening_on !== '1') return null;

  const messages = parseList(settings.opening_messages).map((m) => String(m || '').trim()).filter(Boolean);
  let imageIds = parseList(settings.opening_images).map(String);
  if (imageIds.length) {
    // bỏ ảnh đã bị xoá khỏi kho
    await ensureSchema();
    const rows = await sql()`SELECT id FROM media`;
    const exist = new Set(rows.map((r) => r.id));
    imageIds = imageIds.filter((id) => exist.has(id));
  }
  if (!imageIds.length && !messages.length) return null;

  // chỉ gửi cho khách mới (chưa có tin nhắn nào trong hội thoại)
  if ((await countMessages(psid)) > 0) return null;

  return {
    imageIds,
    messages,
    skipAI: isGreetingOnly(text, imageCount),
    note: `[Đã gửi câu mở đầu cho khách] ${messages.join(' | ')}`.trim(),
  };
}
