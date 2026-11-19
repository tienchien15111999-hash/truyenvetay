import { addLog } from './db.js';

// Báo lỗi về Telegram (không bắt buộc). Không cài thì bỏ qua, chỉ ghi log.
export async function alertError(where, err) {
  const msg = `[${where}] ${err && err.message ? err.message : String(err)}`;
  console.error(msg);
  await addLog('error', msg);
  const t = process.env.TELEGRAM_BOT_TOKEN;
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c, text: `Bot xem tướng lỗi\n${msg}`.slice(0, 3500) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* bỏ qua */ }
}

// Báo cho chủ shop (nhật ký trong trang quản trị + Telegram nếu có cài). Dùng cho việc cần chủ shop làm, không phải lỗi.
export async function notifyOwner(text) {
  await addLog('info', text);
  const t = process.env.TELEGRAM_BOT_TOKEN;
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c, text: String(text).slice(0, 3500) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* bỏ qua */ }
}
