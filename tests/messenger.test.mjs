import assert from 'node:assert/strict';
const { getPageInfo, stripEmoji, sendChatText } = await import('../lib/messenger.js');

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let lastUrl = '';

// 1) mã Fanpage đúng
globalThis.fetch = async (url) => { lastUrl = url; return json(200, { id: '1357809350758137', name: 'Tử Vi Thầy Tạng', metadata: { type: 'page' } }); };
let r = await getPageInfo('EAAB-token');
assert.equal(r.id, '1357809350758137');
assert.equal(r.name, 'Tử Vi Thầy Tạng');
assert.ok(r.pic.endsWith('/1357809350758137/picture?type=square'));
// không được hỏi các trường cần quyền đặc biệt
assert.ok(!/category|picture\.type/.test(lastUrl), 'không hỏi category/picture');
assert.ok(lastUrl.includes('fields=id,name'));

// 2) Facebook không trả metadata: vẫn chấp nhận
globalThis.fetch = async () => json(200, { id: '9', name: 'P' });
r = await getPageInfo('EAAB-token');
assert.equal(r.id, '9');

// 3) mã người dùng thì báo không phải Fanpage
globalThis.fetch = async () => json(200, { id: '5', name: 'User', metadata: { type: 'user' } });
await assert.rejects(() => getPageInfo('x'), /không phải mã của Fanpage/);

// 4) mã hết hạn
globalThis.fetch = async () => json(400, { error: { message: 'Error validating access token: Session has expired' } });
await assert.rejects(() => getPageInfo('x'), /hết hạn/);

// 5) lỗi khác thì báo nguyên văn
globalThis.fetch = async () => json(400, { error: { message: '(#100) something else' } });
await assert.rejects(() => getPageInfo('x'), /something else/);
console.log('messenger tests OK');

// 6) lỗi thiếu quyền đọc Fanpage được gắn code 'permission' (để web xin mã số Fanpage)
globalThis.fetch = async () => json(400, { error: { message: "(#100) Object does not exist, cannot be loaded due to missing permission or reviewable feature. This endpoint requires the 'pages_read_engagement' permission" } });
await assert.rejects(() => getPageInfo('x'), (e) => e.code === 'permission');
// mã sai thì không gắn code đó
globalThis.fetch = async () => json(400, { error: { message: 'Invalid OAuth access token.' } });
await assert.rejects(() => getPageInfo('x'), (e) => e.code !== 'permission' && /không đúng/.test(e.message));
console.log('permission tests OK');

// khách không được thấy icon: bỏ emoji ở chữ, nút gợi ý và danh sách
assert.equal(stripEmoji('Bấm một nút bên dưới nhé 👇'), 'Bấm một nút bên dưới nhé');
assert.equal(stripEmoji('🔒 ❤️ Tình duyên'), 'Tình duyên');
assert.equal(stripEmoji('Giá 99.000 đ • Âm lịch'), 'Giá 99.000 đ • Âm lịch');
assert.equal(stripEmoji('🙏'), '🙏', 'tin chỉ có icon thì giữ nguyên để không gửi tin rỗng');
const sent = [];
globalThis.fetch = async (url, opt) => { sent.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; };
process.env.CHAT_PACING_OFF = '1';
await sendChatText('t', 'p', 'Chọn mục nhé 👇', [{ content_type: 'text', title: '🔒 Xem trọn đời', payload: 'T:a' }]);
const m = sent.find((x) => x.message).message;
assert.equal(m.text, 'Chọn mục nhé');
assert.equal(m.quick_replies[0].title, 'Xem trọn đời');
assert.equal(m.quick_replies[0].payload, 'T:a');
console.log('emoji strip tests OK');
