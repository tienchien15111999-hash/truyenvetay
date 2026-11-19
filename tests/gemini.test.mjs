import assert from 'node:assert/strict';
process.env.GEMINI_API_KEYS = 'k1,k2,k3';
process.env.GEMINI_MODELS = 'm1,m2';
const { askGemini } = await import('../lib/gemini.js');
const { buildSystemPrompt } = await import('../lib/prompt.js');
const { DEFAULT_SETTINGS } = await import('../lib/defaults.js');

const ok = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const bad = (status) => ({ ok: false, status, text: async () => 'err' });

// 1) thành công ngay, có ảnh trong request
let calls = [];
globalThis.fetch = async (url, opt) => { calls.push({ url, body: JSON.parse(opt.body) }); return ok('xin chào'); };
let r = await askGemini({ system: 'S', history: [], userText: 'hi', images: [{ mime: 'image/jpeg', data: 'AAA' }] });
assert.equal(r, 'xin chào');
assert.equal(calls.length, 1);
assert.equal(calls[0].body.contents[0].parts[0].inlineData.data, 'AAA');
assert.equal(calls[0].body.systemInstruction.parts[0].text, 'S');

// 2) 429 rồi 503 rồi thành công -> dùng 3 lần thử
calls = [];
let n = 0;
globalThis.fetch = async (url) => { calls.push(url); n++; return n < 3 ? bad(n === 1 ? 429 : 503) : ok('được rồi'); };
r = await askGemini({ system: 'S', history: [], userText: 'hi', images: [] });
assert.equal(r, 'được rồi');
assert.equal(calls.length, 3);

// 3) lỗi 400 thì dừng ngay
calls = [];
globalThis.fetch = async (url) => { calls.push(url); return bad(400); };
await assert.rejects(() => askGemini({ system: 'S', history: [], userText: 'hi', images: [] }), /400/);
assert.equal(calls.length, 1);

// 4) lịch sử kết thúc bằng lượt user thì gộp, không tạo 2 lượt user liền nhau
globalThis.fetch = async (url, opt) => { calls.push(JSON.parse(opt.body)); return ok('ok'); };
calls = [];
await askGemini({ system: 'S', history: [{ role: 'user', parts: [{ text: 'a' }] }], userText: 'b', images: [] });
assert.equal(calls[0].contents.length, 1);

// 5) prompt có đủ các phần
const p = buildSystemPrompt(DEFAULT_SETTINGS, { face_summary: 'Trán cao', palm_summary: null });
assert.ok(p.includes('trợ lý chuyên về Tử Vi'));
assert.ok(!p.includes('Trán cao'));
assert.ok(!p.includes('[[HOSO:mat]]'));
const p2 = buildSystemPrompt(DEFAULT_SETTINGS, { face_summary: null, palm_summary: null });
assert.ok(p2.includes('chưa có'));
console.log('gemini tests OK');

// 6) key thêm từ trang quản trị được dùng chung với key trong biến
{
  const used = [];
  globalThis.fetch = async (url, opt) => { used.push(opt.headers['x-goog-api-key']); return ok('ok'); };
  process.env.GEMINI_API_KEYS = '';
  const { askGemini: ask2 } = await import('../lib/gemini.js');
  const r2 = await ask2({ system: 'S', history: [], userText: 'hi', images: [], extraKeys: ['DBKEY1234567890123456'] });
  assert.equal(r2, 'ok');
  assert.equal(used[0], 'DBKEY1234567890123456');
  await assert.rejects(() => ask2({ system: 'S', history: [], userText: 'hi', images: [], extraKeys: [] }), /Chưa có key/);
  console.log('extraKeys tests OK');
}

// Default model priority: each fallback must use the next requested model.
delete process.env.GEMINI_MODELS;
process.env.GEMINI_API_KEYS = 'test-key';
const preferred = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'];
for (const failure of [429, 503, 404]) {
  const tried = [];
  globalThis.fetch = async (url) => {
    tried.push(url.match(/models\/([^:]+):generateContent$/)[1]);
    return tried.length < 3 ? bad(failure) : ok('fallback OK');
  };
  assert.equal(await askGemini({system:'S', userText:'hi'}), 'fallback OK');
  assert.deepEqual(tried, preferred);
}
const first = [];
globalThis.fetch = async (url) => { first.push(url); return ok('primary OK'); };
assert.equal(await askGemini({system:'S', userText:'hi'}), 'primary OK');
assert.equal(first.length, 1);
assert.ok(first[0].includes('/gemini-3.5-flash-lite:'));
// Explicit deployment overrides remain supported.
process.env.GEMINI_MODELS = 'custom-model';
const overridden = [];
globalThis.fetch = async (url) => { overridden.push(url); return ok('override OK'); };
await askGemini({system:'S',userText:'hi'});
assert.ok(overridden[0].includes('/custom-model:'));
console.log('Gemini model priority tests OK');
