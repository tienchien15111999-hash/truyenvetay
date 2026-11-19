// Kiểm tra câu mở đầu + kho ảnh bằng cơ sở dữ liệu giả (trong bộ nhớ)
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../lib/defaults.js';
// Legacy conversation fixtures from before the two-package checkout.
DEFAULT_SETTINGS.year_sales_on='0';

process.env.DATABASE_URL = 'postgres://u:p@fake-host/db';
process.env.GEMINI_API_KEYS = 'FAKEKEY_FAKEKEY_FAKEKEY_0001';
process.env.ADMIN_PASSWORD = 'pw123';

const settings = new Map();
const profiles = new Map();
const media = new Map(); // id -> {name, mime, data_b64, size}
const messages = [];
let nextId = 1;

function neonReply(query, params) {
  const q = query.replace(/\s+/g, ' ').trim();
  const out = (fields, rows) => ({ command: 'SELECT', rowCount: rows.length, rows, fields: fields.map((name) => ({ name, dataTypeID: 25 })), rowAsArray: true });
  if (/^(CREATE|ALTER)/i.test(q)) return out([], []);
  if (/SELECT key, value FROM settings/i.test(q)) return out(['key', 'value'], [...settings.entries()]);
  if (/SELECT value FROM settings WHERE key = 'opening_images'/i.test(q)) return out(['value'], settings.has('opening_images') ? [[settings.get('opening_images')]] : []);
  if (/UPDATE settings SET value = \$1 WHERE key = 'opening_images'/i.test(q)) { settings.set('opening_images', params[0]); return out([], []); }
  if (/FROM ai_keys/i.test(q)) return out(['api_key'], []);
  if (/SELECT face_summary, palm_summary, tuvi_state, tuvi_summary FROM profiles/i.test(q)) {
    const p = profiles.get(params[0]);
    return out(['face_summary', 'palm_summary', 'tuvi_state', 'tuvi_summary'], p ? [[p.face, p.palm, p.state, p.summary]] : []);
  }
  if (/INSERT INTO profiles \(psid, face_summary, palm_summary\)/i.test(q)) {
    const [psid, face, palm] = params; const p = profiles.get(psid) || {};
    profiles.set(psid, { ...p, face: face ?? p.face ?? null, palm: palm ?? p.palm ?? null });
    return out([], []);
  }
  if (/INSERT INTO profiles \(psid, tuvi_state, tuvi_summary\)/i.test(q)) {
    const [psid, state, summary] = params; const p = profiles.get(psid) || {};
    profiles.set(psid, { ...p, state: state ?? p.state ?? null, summary: summary ?? p.summary ?? null });
    return out([], []);
  }
  if (/SELECT role, text FROM messages/i.test(q)) {
    const rows = messages.filter((m) => m.psid === params[0]).slice().reverse().slice(0, Number(params[1])).map((m) => [m.role, m.text]);
    return out(['role', 'text'], rows);
  }
  if (/INSERT INTO messages/i.test(q)) { messages.push({ id: nextId++, psid: params[0], role: params[1], text: params[2], page_id: params[4] }); return out([], []); }
  if (/SELECT count\(\*\)::int AS n FROM messages/i.test(q)) return out(['n'], [[String(messages.filter((m) => m.psid === params[0]).length)]]);
  if (/SELECT id FROM media/i.test(q)) return out(['id'], [...media.keys()].map((k) => [k]));
  if (/SELECT id, name, size, created_at FROM media/i.test(q)) return out(['id', 'name', 'size', 'created_at'], [...media.entries()].map(([id, m]) => [id, m.name, String(m.size), '2026-11-15T00:00:00Z']));
  if (/INSERT INTO media/i.test(q)) { media.set(params[0], { name: params[1], mime: params[2], data_b64: params[3], size: params[4] }); return out([], []); }
  if (/SELECT mime, data_b64 FROM media WHERE id/i.test(q)) { const m = media.get(params[0]); return out(['mime', 'data_b64'], m ? [[m.mime, m.data_b64]] : []); }
  if (/DELETE FROM media WHERE id/i.test(q)) { media.delete(params[0]); return out([], []); }
  throw new Error('Câu lệnh DB chưa được giả lập: ' + q.slice(0, 120));
}

globalThis.fetch = async (url, opt) => {
  const body = JSON.parse(opt.body);
  if (String(url).includes('generativelanguage.googleapis.com')) {
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Trả lời của AI.' }] } }] }) };
  }
  const res = neonReply(body.query, body.params || []);
  return { ok: true, status: 200, json: async () => res, text: async () => JSON.stringify(res), headers: new Headers() };
};

const { planOpening, isGreetingOnly } = await import('../lib/opening.js');
const { saveSettings, getSettings, deleteMedia } = await import('../lib/db.js');
const { respondWithMedia, saveTurn } = await import('../lib/bot.js');

const refresh = () => saveSettings({}); // xoá bộ nhớ đệm cài đặt

// --- 1) nhận ra lời chào ngắn ---
assert.equal(isGreetingOnly('chào shop', 0), true);
assert.equal(isGreetingOnly('', 0), true);
assert.equal(isGreetingOnly('chào', 1), false); // có ảnh
assert.equal(isGreetingOnly('xem tử vi', 0), false); // xin xem tử vi
assert.equal(isGreetingOnly('mình sinh năm 1995', 0), false); // có số
assert.equal(isGreetingOnly('cho mình hỏi về tướng mặt của mình được không', 0), false); // câu dài

// --- 2) planOpening ---
media.set('a'.repeat(24), { name: 'a', mime: 'image/jpeg', data_b64: 'QQ==', size: 1 });
media.set('b'.repeat(24), { name: 'b', mime: 'image/jpeg', data_b64: 'Qg==', size: 1 });
const A = 'a'.repeat(24), B = 'b'.repeat(24), GONE = 'c'.repeat(24);

// mặc định: tắt
assert.equal(await planOpening('n1', 'chào', 0), null);

// bật nhưng chưa có gì: không gửi
settings.set('opening_on', '1'); await refresh();
assert.equal(await planOpening('n1', 'chào', 0), null);

// có ảnh + câu: ảnh theo ĐÚNG thứ tự chọn (B trước A), bỏ ảnh đã xoá, bỏ câu rỗng
settings.set('opening_images', JSON.stringify([B, GONE, A]));
settings.set('opening_messages', JSON.stringify(['Chào bạn!', '  ', 'Bạn gửi ảnh mặt nhé.']));
await refresh();
let plan = await planOpening('n1', 'chào', 0);
assert.deepEqual(plan.imageIds, [B, A]);
assert.deepEqual(plan.messages, ['Chào bạn!', 'Bạn gửi ảnh mặt nhé.']);
assert.equal(plan.skipAI, true);
assert.match(plan.note, /Đã gửi câu mở đầu/);
assert.equal((await planOpening('n1', 'xem tử vi', 0)).skipAI, false);
assert.equal((await planOpening('n1', '', 1)).skipAI, false);

// chỉ có câu, không ảnh: vẫn gửi
settings.set('opening_images', '[]'); await refresh();
plan = await planOpening('n1', 'chào', 0);
assert.deepEqual(plan.imageIds, []);
assert.equal(plan.messages.length, 2);

// JSON hỏng thì coi như trống, không bị lỗi
settings.set('opening_images', 'không phải json'); settings.set('opening_messages', '{hỏng'); await refresh();
assert.equal(await planOpening('n1', 'chào', 0), null);
settings.set('opening_images', JSON.stringify([A, B])); settings.set('opening_messages', JSON.stringify(['Xin chào'])); await refresh();

// --- 3) khách cũ (đã có tin nhắn) không nhận lại ---
await saveTurn('old1', null, 'hi', false, ['ok']);
assert.equal(await planOpening('old1', 'chào', 0), null);

// --- 4) lưu hội thoại đúng thứ tự: khách -> câu mở đầu -> trả lời ---
const r = await respondWithMedia({ psid: 'n2', pageId: 'p9', text: 'cho mình hỏi về tướng', images: [], openingNote: '[Đã gửi câu mở đầu cho khách] Xin chào' });
assert.equal(r.reply, 'Trả lời của AI.');
const rows = messages.filter((m) => m.psid === 'n2');
assert.deepEqual(rows.map((m) => m.role), ['user', 'bot', 'bot']);
assert.match(rows[1].text, /Đã gửi câu mở đầu/);
assert.equal(rows[2].text, 'Trả lời của AI.');
assert.ok(rows[0].id < rows[1].id && rows[1].id < rows[2].id);
assert.ok(rows.every((m) => m.page_id === 'p9'));
assert.equal(await planOpening('n2', 'chào', 0), null); // giờ đã là khách cũ

// --- 5) xoá ảnh khỏi kho thì gỡ luôn khỏi danh sách mở đầu ---
await deleteMedia(A);
assert.equal(media.has(A), false);
assert.deepEqual(JSON.parse(settings.get('opening_images')), [B]);
assert.deepEqual(JSON.parse((await getSettings()).opening_images), [B]);

// --- 6) API kho ảnh ---
const adm = await import('../app/api/admin/media/route.js');
const pub = await import('../app/api/media/[id]/route.js');
const H = { 'x-admin-password': 'pw123', 'Content-Type': 'application/json' };
const req = (method, url, body, headers = H) => new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined });

assert.equal((await adm.GET(req('GET', '/api/admin/media', null, { 'x-admin-password': 'sai' }))).status, 401);
assert.equal((await adm.POST(req('POST', '/api/admin/media', { name: 'x.gif', mime: 'image/gif', data: 'QQ==' }))).status, 400);
assert.equal((await adm.POST(req('POST', '/api/admin/media', { name: 'x.jpg', mime: 'image/jpeg', data: '' }))).status, 400);
const bigB64 = 'A'.repeat(5 * 1024 * 1024);
assert.equal((await adm.POST(req('POST', '/api/admin/media', { name: 'big.jpg', mime: 'image/jpeg', data: bigB64 }))).status, 400);
const up = await (await adm.POST(req('POST', '/api/admin/media', { name: 'moi.jpg', mime: 'image/jpeg', data: Buffer.from('hello').toString('base64') }))).json();
assert.match(up.id, /^[a-f0-9]{24}$/);
const list = await (await adm.GET(req('GET', '/api/admin/media'))).json();
assert.ok(list.media.some((m) => m.id === up.id));

// địa chỉ ảnh công khai (Facebook tải từ đây, không cần mật khẩu)
const got = await pub.GET(new Request('http://x/api/media/' + up.id), { params: Promise.resolve({ id: up.id }) });
assert.equal(got.status, 200);
assert.equal(got.headers.get('content-type'), 'image/jpeg');
assert.equal(Buffer.from(await got.arrayBuffer()).toString(), 'hello');
assert.equal((await pub.GET(new Request('http://x/'), { params: Promise.resolve({ id: 'khong-hop-le' }) })).status, 404);
assert.equal((await pub.GET(new Request('http://x/'), { params: Promise.resolve({ id: 'd'.repeat(24) }) })).status, 404);

settings.set('annual_qr_url','/api/media/'+up.id);await refresh();
assert.equal((await adm.DELETE(req('DELETE','/api/admin/media?id='+up.id))).status,409);
assert.equal(media.has(up.id),true);
settings.set('annual_qr_url','');await refresh();
assert.equal((await adm.DELETE(req('DELETE', '/api/admin/media?id=' + up.id))).status, 200);
assert.equal(media.has(up.id), false);

console.log('opening tests OK');
