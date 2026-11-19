process.env.CHAT_PACING_OFF='1';
// Kiểm tra chế độ cây chủ đề: cây hợp lệ, khóa/mở bằng code, thanh toán từng mục, nút gợi ý Messenger, chế độ cũ không đổi
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://u:p@fake-host/db';
process.env.GEMINI_API_KEYS = 'FAKEKEY_FAKEKEY_FAKEKEY_0001';
process.env.NEXT_PUBLIC_BASE_URL = 'https://xemtuvi-delta.vercel.app';
delete process.env.TELEGRAM_BOT_TOKEN;

const td = await import('../lib/tree-data.js');

// ---------- 1) Cây: kiểm tra hợp lệ ----------
const leaf = (id, label, extra = {}) => ({ id, label, prompt: '', answer: '', locked: false, price: '', qr: '', ai_next: false, children: [], ...extra });
assert.equal(td.normalizeTree(td.DEFAULT_TREE).nodes.length, 4);
assert.throws(() => td.normalizeTree({ nodes: [] }), /ít nhất một nút/);
assert.throws(() => td.normalizeTree({ nodes: [leaf('x', 'Chữ trên nút này dài hơn hai mươi ký tự')] }), /dài quá 20/);
assert.throws(() => td.normalizeTree({ nodes: [leaf('x', 'Khóa', { locked: true, price: '' })] }), /chưa có giá/);
assert.throws(() => td.normalizeTree({ nodes: [leaf('x', 'A', { locked: true, price: '99k' })] }), /chưa có giá/);
assert.throws(() => td.normalizeTree({ nodes: [leaf('x', 'A', { locked: true, price: '99.000', qr: 'http://x' })] }), /QR/);
assert.throws(() => td.normalizeTree({ nodes: [leaf('x', 'A')], bundle: { on: true, price: '' } }), /gói mở hết/i);
const deep = (n) => leaf('d' + n, 'Nút ' + n, { children: n < 6 ? [deep(n + 1)] : [] });
assert.throws(() => td.normalizeTree({ nodes: [deep(1)] }), /tối đa 4 tầng/);
const dupe = td.normalizeTree({ nodes: [leaf('same', 'A'), leaf('same', 'B')] });
assert.notEqual(dupe.nodes[0].id, dupe.nodes[1].id, 'id trùng được đổi');
const aiOnParent = td.normalizeTree({ nodes: [leaf('p', 'Cha', { ai_next: true, children: [leaf('c', 'Con')] })] });
assert.equal(aiOnParent.nodes[0].ai_next, false, 'AI gợi ý chỉ áp dụng cho nút cuối');
assert.equal(td.loadTree({ tree_data: '{hỏng' }).nodes.length, 4, 'cây hỏng thì dùng cây mẫu');

// ---------- 2) Khóa/mở: trả tiền cho nút cha mở cả nhánh con ----------
const sample = td.normalizeTree({ nodes: [
  leaf('a', 'Sự nghiệp', { children: [leaf('a1', 'Nên làm nghề gì')] }),
  leaf('b', 'Tình duyên', { locked: true, price: '99.000', children: [leaf('b1', 'Người hợp mình'), leaf('b2', 'Sâu hơn', { locked: true, price: '49.000' })] }),
] });
const pathOf = (id) => td.findNode(sample, id).path;
assert.equal(td.blockedBy(pathOf('a1'), { unlocked: [] }), null);
assert.equal(td.blockedBy(pathOf('b1'), { unlocked: [] }).id, 'b');
assert.equal(td.blockedBy(pathOf('b1'), { unlocked: ['b'] }), null);
assert.equal(td.blockedBy(pathOf('b2'), { unlocked: ['b'] }), null, 'trả cha thì mở luôn nút khóa bên trong');
assert.equal(td.blockedBy(pathOf('b2'), { unlocked: ['b2'] }).id, 'b', 'chỉ trả nút con thì chưa qua được nút cha khóa');
assert.equal(td.blockedBy(pathOf('b2'), { unlocked: [], bundle: true }), null);

// ---------- 3) Nút gợi ý: giới hạn của Messenger ----------
const wide = td.normalizeTree({ nodes: Array.from({ length: 20 }, (_, i) => leaf('w' + i, 'Mục số ' + i)) });
const offered = td.menuOffered(wide, [], {});
assert.ok(offered.length <= 13, 'tối đa 13 nút');
const qrs = td.toQuickReplies(td.menuOffered(sample, [], {}));
assert.ok(qrs.every((q) => Array.from(q.title).length <= 20 && q.content_type === 'text'));
assert.deepEqual(qrs.map((q) => q.title), ['Sự nghiệp', '🔒 Tình duyên']);
assert.deepEqual(td.menuOffered(sample, pathOf('b1'), { unlocked: ['b'] }).map((o) => o.label), [], 'cuối nhánh không có nút Quay lại / Mục chính');
assert.deepEqual(td.menuOffered(sample, pathOf('b'), { unlocked: ['b'] }).map((o) => o.label), ['Người hợp mình', 'Sâu hơn', '⬅️ Quay lại'], 'giữa cây vẫn có Quay lại');
assert.equal(td.matchOffered('tinh duyen', td.menuOffered(sample, [], {})).id, 'b', 'gõ không dấu, không biểu tượng vẫn khớp nút');
assert.equal(td.matchOffered('quay lại', td.menuOffered(sample, pathOf('a'), {})).id, '__back');

// ---------- 4) Luồng thật với CSDL và AI giả ----------
const settings = new Map([
  ['receipt_recipient', 'NGUYEN VAN TEST'], ['receipt_account', '000111222'], ['pay_info', 'Ngân hàng TEST'],
  ['tree_data', JSON.stringify({ version: 1, intro: 'Chào {name}! Bạn chọn một mục nhé:', bundle: { on: true, label: 'Mở tất cả', price: '199.000', qr: '' }, nodes: [
    leaf('a', '💼 Sự nghiệp', { prompt: 'sự nghiệp', children: [leaf('a1', 'Nên làm nghề gì', { prompt: 'ngành nghề', ai_next: true })] }),
    leaf('b', '❤️ Tình duyên', { prompt: 'tình duyên', locked: true, price: '99.000', qr: '/api/media/' + 'a'.repeat(24), children: [leaf('b1', 'Người hợp mình')] }),
    leaf('c', '🌿 Sức khỏe', { answer: 'Cố định: giữ gìn sức khỏe nhé.' }),
  ] })],
]);
const pagesTree = new Map([['ptree', true], ['pold', false]]);
const profiles = new Map();
const messages = [];
let nextId = 1;

function neonReply(query, params) {
  const q = query.replace(/\s+/g, ' ').trim();
  const out = (fields, rows) => ({ command: 'SELECT', rowCount: rows.length, rows, fields: fields.map((name) => ({ name, dataTypeID: 25 })), rowAsArray: true });
  if (/^(CREATE|ALTER)/i.test(q)) return out([], []);
  if (/SELECT key, value FROM settings/i.test(q)) return out(['key', 'value'], [...settings.entries()]);
  if (/FROM ai_keys/i.test(q)) return out(['api_key'], []);
  if (/SELECT tree_mode FROM pages/i.test(q)) return out(['tree_mode'], pagesTree.has(params[0]) ? [[pagesTree.get(params[0])]] : []);
  if (/SELECT face_summary, palm_summary, tuvi_state, tuvi_summary FROM profiles/i.test(q)) {
    const p = profiles.get(params[0]);
    return out(['face_summary', 'palm_summary', 'tuvi_state', 'tuvi_summary'], p ? [[p.face, p.palm, p.state, p.summary]] : []);
  }
  if (/^UPDATE profiles SET tuvi_state =/i.test(q)) {
    const [next, id, previous] = params; const p = profiles.get(id);
    if (p?.state !== previous) return out(['psid'], []);
    profiles.set(id, { ...p, state: next }); return out(['psid'], [[id]]);
  }
  if (/INSERT INTO profiles \(psid, tuvi_state, tuvi_summary\)/i.test(q)) {
    const [psid, state, summary] = params; const p = profiles.get(psid) || {};
    profiles.set(psid, { ...p, state: state ?? p.state ?? null, summary: summary ?? p.summary ?? null }); return out([], []);
  }
  if (/SELECT role, text FROM messages/i.test(q)) {
    const rows = messages.filter((m) => m.psid === params[0]).slice().reverse().slice(0, Number(params[1])).map((m) => [m.role, m.text]);
    return out(['role', 'text'], rows);
  }
  if (/INSERT INTO messages/i.test(q)) { messages.push({ id: nextId++, psid: params[0], role: params[1], text: params[2] }); return out([], []); }
  if (/INSERT INTO logs|DELETE FROM logs/i.test(q)) return out([], []);
  throw new Error('Câu lệnh DB chưa được giả lập: ' + q.slice(0, 120));
}

const calls = [];
const facebook = [];
let routeNode = null;
let routeAsk = false;
let receipt = { amount: 99000, currency: 'VND', recipient: 'Nguyen Van Test', status: 'success' };
globalThis.fetch = async (url, opt) => {
  const u = String(url);
  const body = opt && typeof opt.body === 'string' && opt.body.startsWith('{') ? JSON.parse(opt.body) : null;
  if (u.includes('generativelanguage.googleapis.com')) {
    const sys = body.systemInstruction.parts[0].text;
    const userText = body.contents[body.contents.length - 1].parts.map((p) => p.text || '').join('');
    let kind; let text;
    if (sys.startsWith('Chỉ trích xuất chữ')) { kind = 'receipt'; text = JSON.stringify(receipt); }
    else if (sys.startsWith('Bạn chỉ trả về JSON') && userText.includes('ĐỊNH TUYẾN MỤC')) { kind = 'route'; text = JSON.stringify({ node: routeNode, ask: routeAsk }); }
    else if (sys.startsWith('Bạn chỉ trả về JSON') && userText.includes('GỢI Ý CÂU HỎI TIẾP')) {
      kind = 'followups'; text = JSON.stringify({ items: [{ label: 'Khi nào khá hơn?', question: 'Khi nào công việc của tôi khá hơn?' }, { label: 'Nên tránh điều gì?', question: 'Tôi nên tránh điều gì trong công việc?' }] });
    } else if (sys.startsWith('Bạn chỉ trả về JSON')) {
      kind = 'extract'; text = JSON.stringify({ maritalStatus: 'đã kết hôn', maritalEvidence: 'đã kết hôn', fullName: 'Nguyễn Văn An', gender: 'nam', birthDate: '1995-08-15', birthHour: 14, isLunar: false, viewYear: 2027 });
    } else if (sys.includes('GIỚI HẠN: khách đang ở mục')) { kind = 'scoped'; text = 'Trả lời ngắn trong phạm vi mục đang xem.'; }
    else if (sys.includes('Chủ đề khách vừa chọn')) { kind = userText.startsWith('Luận mục') ? 'reading' : 'question'; text = 'Nội dung luận: ' + sys.match(/Chủ đề khách vừa chọn: ([^\n]*?)\.(?:\n|$)/)[1]; }
    else { kind = 'other'; text = 'Trả lời khác.'; }
    calls.push({ kind, system: sys });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  }
  if (u.includes('graph.facebook.com')) { facebook.push(body); return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; }
  const res = neonReply(body.query, body.params || []);
  return { ok: true, status: 200, json: async () => res, text: async () => JSON.stringify(res), headers: new Headers() };
};

const { respondWithMedia } = await import('../lib/bot.js');
const tree = await import('../lib/tree.js');
const PSID = 'k1';
const say = (text, extra = {}) => respondWithMedia({ psid: PSID, pageId: 'ptree', text, images: [], ...extra });
const stateOf = (psid = PSID) => JSON.parse(profiles.get(psid).state);
const kinds = () => calls.map((c) => c.kind);
const reset = () => { calls.length = 0; };
const titles = (r) => r.quickReplies.map((q) => q.title);

// 4a) Khách điền thông tin: lá số + chữ chào + các nút chủ đề, chưa luận mục nào
let r = await say('Nguyễn Văn An, Nam, sinh 15/08/1995 dương lịch, 14h30, đã kết hôn');
assert.match(r.reply, /Chào Nguyễn Văn An! Bạn chọn một mục nhé:/);
assert.ok(r.imageUrl.includes('/api/laso?'));
assert.deepEqual(titles(r), ['💼 Sự nghiệp', '🔒 ❤️ Tình duyên', '🌿 Sức khỏe']);
assert.equal(stateOf().stage, 'TREE');
assert.ok(!kinds().includes('reading'), 'chưa luận gì trước khi khách bấm');

// 4b) Bấm mục miễn phí: AI luận, hiện các nút con + nút quay lại
reset();
r = await say('💼 Sự nghiệp');
assert.deepEqual(kinds(), ['reading']);
assert.match(r.reply, /Nội dung luận: 💼 Sự nghiệp/);
assert.deepEqual(titles(r), ['Nên làm nghề gì', '⬅️ Quay lại']);
assert.ok(calls[0].system.includes('HƯỚNG DẪN CỦA CHỦ BOT CHO MỤC NÀY: sự nghiệp'));

// 4b2) Đang ở một mục, hỏi thêm một câu mà AI định tuyến về đúng mục này: trả lời đúng câu hỏi, không gửi lại bài cũ
reset();
const hereId = stateOf().tree.node;
routeNode = hereId; routeAsk = false;
r = await say('năm sau tôi có thể đổi việc không');
assert.deepEqual(kinds(), ['route', 'question'], 'cùng mục thì luôn trả lời câu hỏi, không đọc lại bài');
assert.notEqual(calls[1].system.includes('Luận mục'), true);
// AI báo đây là câu hỏi cụ thể (ask) về một mục khác: cũng trả lời câu hỏi
reset();
routeNode = 'a'; routeAsk = true;
await say('hỏi cụ thể một chuyện');
assert.ok(kinds().includes('question') && !kinds().includes('reading'));
routeAsk = false; routeNode = null;

// 4c) Nút cuối có AI gợi ý: thêm câu hỏi tiếp do AI nghĩ, bấm thì trả lời đúng câu hỏi đó
reset();
r = await say('Nên làm nghề gì');
assert.deepEqual(kinds(), ['reading', 'followups']);
assert.deepEqual(titles(r), ['Khi nào khá hơn?', 'Nên tránh điều gì?'], 'cuối nhánh chỉ còn câu hỏi AI gợi ý');
reset();
r = await say('Khi nào khá hơn?');
assert.equal(calls[0].kind, 'question');
assert.match(calls[0].system, /Trả lời đúng câu hỏi của khách/);
assert.equal(stateOf().tree.aiChain, 1);

// 4d) Nút quay lại không gọi AI; cuối nhánh không có Quay lại / Mục chính
reset();
r = await say('💼 Sự nghiệp');
assert.deepEqual(titles(r), ['Nên làm nghề gì', '⬅️ Quay lại']);
reset();
r = await say('⬅️ Quay lại');
assert.deepEqual(kinds(), []);
assert.match(r.reply, /Bạn muốn xem mục nào/);
r = await say('menu');
assert.deepEqual(kinds(), []);
assert.deepEqual(titles(r), ['💼 Sự nghiệp', '🔒 ❤️ Tình duyên', '🌿 Sức khỏe']);

// 4e) Mục có nội dung cố định: không gọi AI
reset();
r = await say('🌿 Sức khỏe');
assert.deepEqual(kinds(), []);
assert.equal(r.reply, 'Cố định: giữ gìn sức khỏe nhé.');

// 4f) Mục khóa: bị chặn bằng code, hiện QR + thông tin riêng của mục, không gọi AI luận
reset();
r = await say('🔒 ❤️ Tình duyên');
assert.deepEqual(kinds(), []);
assert.match(r.reply, /Mục «❤️ Tình duyên»/);
assert.match(r.reply, /99\.000 đ/);
assert.match(r.reply, /NGUYEN VAN TEST/);
assert.match(r.reply, /Nội dung chuyển khoản: TV M[0-9A-F]{8}/);
assert.deepEqual(r.offerImages, ['https://xemtuvi-delta.vercel.app/api/media/' + 'a'.repeat(24)]);
assert.deepEqual(titles(r), ['🎁 Mở tất cả', '⬅️ Quay lại']);
assert.equal(stateOf().stage, 'OFFERED');
const orderId = stateOf().payment.id;
assert.equal(stateOf().payment.nodeId, 'b');
assert.equal(stateOf().payment.amount, '99.000');

// 4f2) Mục khóa có ảnh giới thiệu: gửi ảnh giới thiệu trước, rồi tới QR
{
  const withIntro = td.normalizeTree({ nodes: [leaf('p', 'Gói', { locked: true, price: '99.000', qr: '/api/media/' + 'b'.repeat(24), intro_image: '/api/media/' + 'c'.repeat(24) })] });
  assert.equal(withIntro.nodes[0].intro_image, '/api/media/' + 'c'.repeat(24));
  assert.throws(() => td.normalizeTree({ nodes: [leaf('p', 'Gói', { locked: true, price: '99.000', intro_image: 'javascript:x' })] }), /Ảnh giới thiệu/);
  const unlockedNode = td.normalizeTree({ nodes: [leaf('p', 'Gói', { intro_image: '/api/media/' + 'c'.repeat(24) })] });
  assert.equal(unlockedNode.nodes[0].intro_image, '', 'mục không khóa thì bỏ ảnh giới thiệu');
}

// 4g) Gõ chữ để lách (AI chọn mục khóa; hoặc gõ tên nút con của mục khóa): vẫn bị chặn, giữ nguyên đơn cũ
reset();
routeNode = 'b';
r = await say('xem giúp mình chuyện tình duyên với');
assert.deepEqual(kinds(), ['route']);
assert.match(r.reply, /99\.000 đ/);
assert.equal(stateOf().payment.id, orderId, 'dùng lại đơn đang mở, không tạo mã mới');
reset();
r = await say('Người hợp mình');
assert.ok(!kinds().includes('reading'));
assert.equal(stateOf().payment.id, orderId);

// 4h) Câu hỏi tự do không thuộc mục nào: trả lời ngắn, dặn AI không luận mục khóa, có giới hạn lượt
reset();
routeNode = null;
r = await say('mình mới đổi chỗ ở, có sao không');
assert.deepEqual(kinds(), ['route', 'scoped']);
assert.match(calls[1].system, /KHÔNG luận nội dung của chúng[^\n]*❤️ Tình duyên/);
await say('hỏi thêm một câu nữa'); await say('và câu thứ ba');
reset();
r = await say('câu thứ tư nữa');
assert.ok(!kinds().includes('scoped'), 'hết lượt hỏi tự do thì chỉ mời bấm nút');
assert.match(r.reply, /bấm một mục bên dưới/);

// 4i) Khách báo đã chuyển: chờ chủ shop; ảnh biên lai khớp tên + số tiền thì ghi nhận
reset();
r = await say('mình đã chuyển khoản rồi nhé');
assert.equal(stateOf().stage, 'PENDING_CONFIRM');
reset();
r = await say('', { images: [{ mime: 'image/jpeg', data: 'AAAA' }] });
assert.deepEqual(kinds(), ['receipt']);
assert.match(r.reply, /khớp tên người nhận và số tiền của mục «❤️ Tình duyên»/);
assert.equal(stateOf().stage, 'PENDING_CONFIRM');
// đang chờ xác nhận mà chạm mục khóa: không tạo đơn mới
reset();
r = await say('🔒 ❤️ Tình duyên');
assert.match(r.reply, /đang kiểm tra/);
assert.equal(stateOf().payment.id, orderId);
assert.ok(!kinds().includes('reading'));
// ảnh sai số tiền không được tính là khớp
receipt = { ...receipt, amount: 9000 };
r = await say('', { images: [{ mime: 'image/jpeg', data: 'AAAA' }] });
assert.match(r.reply, /Chưa khớp/);

// 4j) Chủ shop xác nhận: mở ĐÚNG mục đã trả (và nhánh con), các mục khóa khác vẫn đóng
const settingsObj = Object.fromEntries(settings);
const loaded = td.loadTree(settingsObj);
const confirmed = tree.confirmTree(loaded, stateOf(), 'confirm', settingsObj);
assert.deepEqual(confirmed.next.tree.unlocked, ['b']);
assert.equal(confirmed.next.payment, null);
assert.equal(confirmed.next.stage, 'TREE');
assert.match(confirmed.message, /Bên mình đã nhận được thanh toán, cảm ơn Nguyễn Văn An/);
assert.deepEqual(confirmed.offered.map((o) => o.label), ['Xem ❤️ Tình duyên', '🏠 Mục chính']);
profiles.set(PSID, { ...profiles.get(PSID), state: JSON.stringify(confirmed.next) });
reset();
r = await say('Xem ❤️ Tình duyên');
assert.deepEqual(kinds(), ['reading']);
assert.match(r.reply, /Nội dung luận: ❤️ Tình duyên/);
assert.deepEqual(titles(r), ['Người hợp mình', '⬅️ Quay lại']);
reset();
r = await say('Người hợp mình');
assert.deepEqual(kinds(), ['reading'], 'nhánh con của mục đã trả được mở');

// 4k) Gói mở hết và thu hồi
const bundlePay = tree.newTreePayment(settingsObj, loaded, 'bundle');
assert.equal(bundlePay.kind, 'tree_bundle');
assert.equal(bundlePay.amount, '199.000');
assert.match(tree.treePaymentText(settingsObj, loaded, bundlePay, 'An'), /mở tất cả các mục/);
const all = tree.confirmTree(loaded, { ...stateOf(), stage: 'OFFERED', payment: bundlePay }, 'confirm', settingsObj);
assert.equal(all.next.tree.bundle, true);
assert.equal(td.blockedBy(td.findNode(loaded, 'b1').path, all.next.tree), null);
const revoked = tree.confirmTree(loaded, all.next, 'revoke', settingsObj);
assert.deepEqual(revoked.next.tree.unlocked, []);
assert.equal(revoked.next.tree.bundle, false);
assert.equal(td.blockedBy(td.findNode(loaded, 'b').path, revoked.next.tree).id, 'b');

// 4l) Thiếu giá/người nhận: không bịa thông tin chuyển khoản
const noRecipient = { ...settingsObj, receipt_recipient: '' };
assert.equal(tree.newTreePayment(noRecipient, loaded, td.findNode(loaded, 'b').node), null);

// 4m) Fanpage ở chế độ cũ: không có nút gợi ý, luồng cũ không đổi
reset();
const oldReply = await respondWithMedia({ psid: 'k-old', pageId: 'pold', text: 'Nguyễn Văn An, Nam, sinh 15/08/1995 dương lịch, 14h30, đã kết hôn', images: [] });
assert.equal(oldReply.quickReplies, undefined);
assert.ok(!JSON.parse(profiles.get('k-old').state).tree);
assert.doesNotMatch(oldReply.reply, /Bạn chọn một mục nhé/);

// ---------- 5) Messenger: nút gợi ý chỉ gắn vào tin cuối, tiêu đề ≤ 20 ký tự ----------
const { sendChatText } = await import('../lib/messenger.js');
facebook.length = 0;
const longText = Array.from({ length: 4 }, (_, i) => `Đoạn ${i + 1}: ` + 'chữ '.repeat(150)).join('\n\n');
await sendChatText('TOKEN', 'psid1', longText, td.toQuickReplies(td.menuOffered(sample, [], {})));
const sent = facebook.filter((p) => p.message);
assert.ok(sent.length >= 2, 'tin dài được tách nhiều đoạn');
assert.ok(sent.slice(0, -1).every((p) => !p.message.quick_replies), 'đoạn đầu không có nút');
assert.equal(sent.at(-1).message.quick_replies.length, 2);
assert.ok(sent.at(-1).message.quick_replies.every((q) => q.payload.startsWith('T:') && Array.from(q.title).length <= 20));

console.log('tree mode tests OK');
