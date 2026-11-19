// Kiểm tra luồng hội thoại Tử Vi bằng cơ sở dữ liệu giả (trong bộ nhớ) và Gemini giả
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../lib/defaults.js';
// Legacy conversation fixtures from before the two-package checkout.
DEFAULT_SETTINGS.year_sales_on='0';

process.env.DATABASE_URL = 'postgres://u:p@fake-host/db';
process.env.GEMINI_API_KEYS = 'FAKEKEY_FAKEKEY_FAKEKEY_0001';
process.env.NEXT_PUBLIC_BASE_URL = 'https://xemtuvi-delta.vercel.app/';

const profiles = new Map();
const messages = [];
const geminiCalls = [];

function neonReply(query, params) {
  const q = query.replace(/\s+/g, ' ').trim();
  const out = (fields, rows) => ({ command: 'SELECT', rowCount: rows.length, rows, fields: fields.map((name) => ({ name, dataTypeID: 25 })), rowAsArray: true });
  if (/^(CREATE|ALTER)/i.test(q)) return out([], []);
  if (/FROM settings/i.test(q)) return out(['key', 'value'], []);
  if (/FROM ai_keys/i.test(q)) return out(['api_key'], []);
  if (/SELECT face_summary, palm_summary, tuvi_state, tuvi_summary FROM profiles/i.test(q)) {
    const p = profiles.get(params[0]);
    return out(['face_summary', 'palm_summary', 'tuvi_state', 'tuvi_summary'], p ? [[p.face, p.palm, p.state, p.summary]] : []);
  }
  if (/INSERT INTO profiles \(psid, tuvi_state, tuvi_summary\)/i.test(q)) {
    const [psid, state, summary] = params;
    const p = profiles.get(psid) || {};
    profiles.set(psid, { ...p, state: state ?? p.state ?? null, summary: summary ?? p.summary ?? null });
    return out([], []);
  }
  if (/INSERT INTO profiles \(psid, face_summary, palm_summary\)/i.test(q)) {
    const [psid, face, palm] = params;
    const p = profiles.get(psid) || {};
    profiles.set(psid, { ...p, face: face ?? p.face ?? null, palm: palm ?? p.palm ?? null });
    return out([], []);
  }
  if (/SELECT role, text FROM messages/i.test(q)) {
    const rows = messages.filter((m) => m.psid === params[0]).slice().reverse().slice(0, Number(params[1])).map((m) => [m.role, m.text]);
    return out(['role', 'text'], rows);
  }
  if (/INSERT INTO messages/i.test(q)) {
    messages.push({ psid: params[0], role: params[1], text: params[2], page_id: params[4] });
    return out([], []);
  }
  throw new Error('Câu lệnh DB chưa được giả lập: ' + q.slice(0, 120));
}

// Gemini giả
const BIRTH = {
  'Nguyễn Văn An, Nam, 15/08/1995 dương lịch, 14h30': { fullName: 'Nguyễn Văn An', gender: 'nam', birthDate: '1995-08-15', birthHour: 14, isLunar: false, viewYear: 2026 },
  'Nguyễn Văn An, Nam': { fullName: 'Nguyễn Văn An', gender: 'nam', birthDate: null, birthHour: null, isLunar: false, viewYear: 2026 },
  'sinh 15/08/1995 dương lịch lúc 14h30': { fullName: null, gender: null, birthDate: '1995-08-15', birthHour: 14, isLunar: false, viewYear: 2026 },
  'Trần Thị B, nữ, 31/02/1995 dương, 5h': { fullName: 'Trần Thị B', gender: 'nu', birthDate: '1995-02-31', birthHour: 5, isLunar: false, viewYear: 2026 },
};

globalThis.fetch = async (url, opt) => {
  const body = JSON.parse(opt.body);
  const u = String(url);
  if (u.includes('generativelanguage.googleapis.com')) {
    const sys = body.systemInstruction.parts[0].text;
    const userText = body.contents[body.contents.length - 1].parts.map((p) => p.text || '').join('');
    let text;
    if (sys.startsWith('Bạn chỉ trả về JSON')) {
      geminiCalls.push('extract');
      const m = userText.match(/Tin nhắn mới: "([^"]*)"/);
      text = JSON.stringify(BIRTH[m && m[1]] || {});
    } else if (sys.includes('chuyên gia Tử Vi')) {
      geminiCalls.push('reading');
      text = '🌟 Tổng quan bản mệnh: bạn có Mệnh Thiên Tướng.\n**Nội dung** luận giải.';
    } else {
      geminiCalls.push('normal');
      text = 'Trả lời bình thường từ hồ sơ.';
    }
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  }
  // Neon (HTTP)
  const res = neonReply(body.query, body.params || []);
  return { ok: true, status: 200, json: async () => res, text: async () => JSON.stringify(res), headers: new Headers() };
};

const { respondWithMedia } = await import('../lib/bot.js');
const PSID = 'u1';
const say = (text, extra = {}) => respondWithMedia({ psid: PSID, pageId: 'p1', text, images: [], ...extra });

// 1) Xin xem tử vi, chưa có thông tin: hỏi ngay, KHÔNG gọi Gemini
let r = await say('cho mình xem tử vi');
assert.match(r.reply, /Họ và tên/);
assert.match(r.reply, /Tình trạng hôn nhân/);
assert.equal(geminiCalls.length, 0);
assert.equal(JSON.parse(profiles.get(PSID).state).status, 'WAITING_INFO');

// 2) Đưa thiếu thông tin: bot hỏi phần còn thiếu
r = await say('Nguyễn Văn An, Nam');
assert.match(r.reply, /bổ sung thông tin còn thiếu/);
assert.match(r.reply, /Ngày, tháng, năm sinh/);
assert.ok(!/Họ và tên/.test(r.reply));
assert.deepEqual(geminiCalls, ['extract']);

// 3) Bổ sung phần còn lại: lập lá số + ảnh + luận giải
geminiCalls.length = 0;
const progress = [];
r = await say('sinh 15/08/1995 dương lịch lúc 14h30', { onProgress: async (x) => progress.push(x) });
assert.match(r.reply,/tình trạng hôn nhân/);
r = await say('bỏ qua', { onProgress: async (x) => progress.push(x) });
assert.equal(JSON.parse(profiles.get(PSID).state).info.maritalStatus,'không muốn chia sẻ');
assert.deepEqual(geminiCalls, ['reading']);
assert.equal(progress.length, 1);
assert.doesNotMatch(progress[0].statusText, /Nguyễn Văn An/, 'khách chỉ được gọi là bạn, không gọi họ tên');
assert.ok(progress[0].imageUrl.startsWith('https://xemtuvi-delta.vercel.app/api/laso?'), 'không có dấu / thừa: ' + progress[0].imageUrl);
assert.ok(progress[0].imageUrl.includes('date=1995-08-15') && progress[0].imageUrl.includes('hour=14'));
assert.equal(r.imageSentInProgress, true);
assert.ok(!r.reply.includes('**'));
assert.equal(JSON.parse(profiles.get(PSID).state).status, 'COMPLETED');
assert.match(profiles.get(PSID).summary, /Nguyễn Văn An/);
assert.ok(messages.every((m) => m.page_id === 'p1'), 'tin nhắn lưu kèm mã Fanpage');

// 4) Lá số đã xong: hỏi tiếp có chữ "tử vi" thì trả lời bình thường, KHÔNG lập lại lá số
geminiCalls.length = 0;
r = await say('tử vi của mình nói gì về tiền bạc?');
assert.deepEqual(geminiCalls, ['normal']);
assert.equal(r.imageUrl, null);
assert.equal(r.reply, 'Trả lời bình thường từ hồ sơ.');

// 5) Xin lập lá số cho người khác thì bắt đầu lại
geminiCalls.length = 0;
r = await say('lập lá số cho người khác');
assert.match(r.reply, /Họ và tên/);
assert.equal(geminiCalls.length, 0);

// 6) Đang chờ thông tin mà khách đổi ý: thoát khỏi luồng tử vi
geminiCalls.length = 0;
r = await say('thôi mình xem tướng mặt');
assert.deepEqual(geminiCalls, []);
assert.match(r.reply, /không xem tướng/);
assert.equal(JSON.parse(profiles.get(PSID).state).status, 'WAITING_INFO');

// 7) Ngày không tồn tại: hỏi lại, không báo lỗi "bận"
profiles.delete('u2');
r = await respondWithMedia({ psid: 'u2', text: 'xem tử vi', images: [] });
r = await respondWithMedia({ psid: 'u2', text: 'Trần Thị B, nữ, 31/02/1995 dương, 5h', images: [] });
assert.match(r.reply, /chưa lập được lá số/);
assert.equal(r.imageUrl, null);
assert.equal(JSON.parse(profiles.get('u2').state).status, 'WAITING_INFO');

console.log('bot tuvi flow tests OK');
