const { timingSafeEqual } = require('node:crypto');

const TEXT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const BACKUP_TEXT_MODEL = '@cf/zai-org/glm-4.7-flash';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const BACKUP_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const DIMENSIONS = {
  '4:5': [768, 960], '21:9': [896, 384], '9:16': [576, 1024], '16:9': [1024, 576]
};
const IMAGE_MIME = /^image\/(?:jpeg|png|webp)$/i;
const MAX_IMAGE_BYTES = 2_800_000; // Trả Base64 qua Vercel Functions, còn dư dưới giới hạn 4.5 MB.

function validImage(part) {
  return part && typeof part.mimeType === 'string' && IMAGE_MIME.test(part.mimeType) && typeof part.data === 'string' &&
    part.data.length <= 600_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(part.data);
}

function buildTextRequest(parts, { json, probe, limit, backup }) {
  const content = [];
  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.trim()) content.push({ type: 'text', text: part.text });
    else if (validImage(part.inlineData)) {
      const { mimeType, data } = part.inlineData;
      content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } });
    } else return null;
  }
  if (!content.some(part => part.type === 'text')) return null;
  const body = {
    messages: [{ role: 'user', content: content.every(part => part.type === 'text')
      ? content.map(part => part.text).join('\n\n') : content }],
    max_completion_tokens: probe ? 32 : limit,
    temperature: probe ? 0 : 0.25,
    chat_template_kwargs: backup ? { enable_thinking: false } : { thinking: false }
  };
  if (json) body.response_format = { type: 'json_object' };
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function buildImageInput(parts, aspect, fallbackPrompt) {
  if (typeof aspect !== 'string' || !Object.hasOwn(DIMENSIONS, aspect)) return null;
  const references = [], prompt = [];
  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.trim()) prompt.push(part.text);
    else if (validImage(part.inlineData) && references.length < 4) {
      prompt.push(`[Reference image ${references.length}]`);
      references.push(part.inlineData);
    } else return null;
  }
  const text = prompt.join('\n\n').trim();
  const mainBrief = parts.findLast(part => typeof part.text === 'string' && part.text.trim())?.text.trim();
  if (!mainBrief || text.length > 20000) return null;
  const brief = typeof fallbackPrompt === 'string' && fallbackPrompt.trim() ? fallbackPrompt.trim() : mainBrief;
  // Older pages send only parts. Keep the framing instructions and the current scene at the end.
  const shortPrompt = brief.length <= 2048 ? brief : `${brief.slice(0, 450)}\n\n${brief.slice(-1596)}`;
  return { text, shortPrompt, references, dimensions: DIMENSIONS[aspect] };
}

function multipartImage(prompt, [width, height], references = []) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', String(width));
  form.append('height', String(height));
  references.forEach(({ mimeType, data }, index) => {
    const name = `input_image_${index}`;
    form.append(name, new Blob([Buffer.from(data, 'base64')], { type: mimeType }), `${name}.${mimeType.split('/')[1].toLowerCase()}`);
  });
  return { body: form };
}

function sendError(res, status, code, message, diagnostic) {
  return res.status(status).json({ error: { code, message, ...diagnostic } });
}

function upstreamFailure(status, body, { personal, image = false } = {}) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  const codes = errors.map(err => String(err?.code ?? '')).filter(code => /^\d{1,6}$/.test(code)).map(Number);
  const details = [...errors.map(err => err?.message), body?.message, body?.error, body?.error?.message,
    body?.result?.error, body?.result?.error?.message]
    .filter(message => typeof message === 'string').join(' ');
  const fail = (statusCode, code, message, retry) => ({ status: statusCode, code, message, retry,
    ...(image && { diagnostic: { upstreamStatus: status, ...(codes.length && { providerCode: codes[0] }) } }) });
  if (codes.includes(3036) || /neurons?.{0,70}limit|daily.{0,60}(limit|quota)|free allocation|out of neurons|account.{0,30}limit reached/i.test(details)) {
    return fail(429, 'CF_DAILY_LIMIT', 'Hết hạn mức Cloudflare hôm nay. Hạn mức ngày làm mới lúc 7 giờ sáng theo giờ Việt Nam.');
  }
  if (image && /moderat|content (?:safety|policy|filter)|safety (?:checker|system|filter|policy)|responsible ai|nsfw|unsafe|inappropriate|policy violation|prohibited content|sensitive content|flagged/i.test(details)) {
    return fail(422, 'CF_IMAGE_POLICY', 'Cloudflare từ chối nội dung hoặc ảnh mẫu. Hãy xem lại mô tả và ảnh mẫu trước khi vẽ lại.');
  }
  if ([408, 504].includes(status) || codes.some(code => [3007, 3008].includes(code))) {
    return fail(504, 'CF_TIMEOUT', 'Cloudflare xử lý quá thời gian.', 'backup');
  }
  if (codes.includes(3040) || /capacity temporarily exceeded/i.test(details)) {
    return fail(503, 'CF_BUSY', 'Cloudflare đang quá tải.', 'backup');
  }
  if (status === 429 || /rate.limit|too many requests/i.test(details)) {
    return fail(429, 'CF_RATE_LIMIT', 'Cloudflare đang giới hạn lượt gọi. Hãy chờ rồi bấm Chạy bù.');
  }
  if (image && status !== 401 && codes.some(code => [3041, 3042, 5018, 5028, 5035].includes(code))) {
    return fail(503, 'CF_IMAGE_MODEL', 'Model vẽ Cloudflare hiện chưa dùng được với tài khoản này.', 'backup');
  }
  if ([401, 403].includes(status) || codes.some(code => [10000, 3023].includes(code))) {
    return fail(403, 'CF_UNAUTHORIZED', personal
      ? 'Account ID, API Token hoặc quyền Workers AI chưa đúng. Kiểm tra hai ô trong Cài đặt.'
      : 'Account ID, API Token hoặc quyền Workers AI chưa đúng. Kiểm tra cài đặt trên Vercel.');
  }
  if (status === 404 || (image && status === 410)) {
    return fail(503, image ? 'CF_IMAGE_MODEL' : 'CF_UNAVAILABLE', 'Không tìm thấy model hoặc tài khoản Cloudflare Workers AI.', 'backup');
  }
  if (status >= 500) return fail(502, 'CF_UPSTREAM', 'Cloudflare Workers AI đang bận hoặc lỗi dịch vụ. Hãy thử lại.', 'backup');
  if (image && ([413, 415].includes(status) || codes.includes(3006) ||
      ([200, 400, 422].includes(status) && /multipart|\b(?:width|height|dimensions?|aspect ratio)\b|image size|image format|input_image_\d|(?:decode|decoding).{0,20}image|(?:prompt|input).{0,30}(?:too long|length|too large)|validation error/i.test(details)))) {
    return fail(422, 'CF_IMAGE_INPUT', 'Cloudflare không nhận định dạng ảnh mẫu, kích thước hoặc độ dài mô tả.', 'compatible');
  }
  return fail(422, 'CF_REJECTED', 'Cloudflare không xử lý được yêu cầu này. Kiểm tra nội dung hoặc ảnh mẫu rồi thử lại.');
}

async function readImage(response, personal) {
  if (!response.ok) return { failure: upstreamFailure(response.status, await response.json().catch(() => null), { personal, image: true }) };
  const contentType = response.headers.get('content-type')?.split(';')[0].trim() || '';
  const invalid = { failure: { status: 502, code: 'CF_IMAGE_INVALID', message: 'Cloudflare không trả ảnh hợp lệ.', retry: 'backup' } };
  let bytes;
  if (IMAGE_MIME.test(contentType)) {
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    const body = await response.json().catch(() => null);
    if (body?.success === false || body?.errors?.length || body?.error || body?.result?.error) {
      return { failure: upstreamFailure(response.status, body, { personal, image: true }) };
    }
    const data = body?.result?.image;
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) return invalid;
    const uri = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/is);
    const encoded = uri ? uri[2] : data;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return invalid;
    bytes = Buffer.from(encoded, 'base64');
  }
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return invalid;
  let mimeType;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = 'image/jpeg';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
  else return invalid;
  return { image: { mimeType, data: bytes.toString('base64') } };
}

function networkFailure(error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return { status: 504, code: 'CF_TIMEOUT', message: 'Cloudflare xử lý quá thời gian. Hãy thử lại.', retry: 'backup' };
  }
  return { status: 502, code: 'CF_NETWORK', message: 'Chưa kết nối được Cloudflare Workers AI.', retry: 'backup' };
}

async function generateImage(call, input, personal) {
  async function attempt(model, config, waitMs) {
    try { return await readImage(await call(model, config, waitMs), personal); }
    catch (error) { return { failure: networkFailure(error) }; }
  }
  let result = await attempt(IMAGE_MODEL, multipartImage(input.text, input.dimensions, input.references), 45_000);
  if (result.failure?.retry === 'compatible') {
    result = await attempt(IMAGE_MODEL, multipartImage(input.shortPrompt, [1024, 768]), 18_000);
    if (result.image) return { ...result, imageMode: 'compatible' };
  }
  if (!result.failure?.retry) return result;
  result = await attempt(BACKUP_IMAGE_MODEL, {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: input.shortPrompt, steps: 4 })
  }, 22_000);
  return result.image ? { ...result, imageMode: 'backup' } : result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD', 'Chỉ nhận POST.');
  }
  const { 'x-cloudflare-account-id': inputAccount, authorization } = req.headers;
  const personal = inputAccount !== undefined || authorization !== undefined;
  const account = personal ? inputAccount : process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = personal ? /^Bearer ([!-~]{1,512})$/i.exec(typeof authorization === 'string' ? authorization : '')?.[1]
    : process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (typeof account !== 'string' || !/^[a-f0-9]{32}$/i.test(account) ||
      typeof token !== 'string' || !/^[!-~]{1,512}$/.test(token)) {
    if (personal) return sendError(res, 400, 'CF_INPUT_CONFIG', 'Điền đủ Account ID và API Token của Cloudflare trong Cài đặt.');
    return sendError(res, 503, 'CF_CONFIG', 'Nhập Cloudflare Account ID và API Token trong Cài đặt, hoặc kiểm tra biến môi trường trên Vercel.');
  }
  const code = process.env.CLOUDFLARE_WEB_CODE?.trim();
  if (!personal && code) {
    const given = Buffer.from(String(req.headers['x-cloudflare-web-code'] || ''));
    const expected = Buffer.from(code);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return sendError(res, 403, 'CF_WEB_CODE', 'Nhập đúng mã truy cập Cloudflare trong Cài đặt của web.');
    }
  }

  let request;
  try { request = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return sendError(res, 400, 'INPUT', 'Dữ liệu gửi lên chưa hợp lệ.'); }
  const { kind, parts, aspect, fallbackPrompt, json, probe, task, backup: tryBackup } = request || {};
  if (!['text', 'image'].includes(kind) || !Array.isArray(parts) || parts.length === 0 || parts.length > 16 ||
      parts.some(part => !part || typeof part !== 'object' || (typeof part.text === 'string' && part.text.length > 160000))) {
    return sendError(res, 400, 'INPUT', 'Nội dung hoặc số ảnh mẫu vượt giới hạn.');
  }
  const scriptTask = kind === 'text' && (task === 'script' || task === 'storyboard');
  const backup = scriptTask && tryBackup === true && parts.every(part => !part.inlineData);
  const limit = task === 'script' ? 3000 : task === 'storyboard' ? 2400 : 8192;
  const config = kind === 'text' ? buildTextRequest(parts, { json: json === true, probe: probe === true, backup, limit })
    : buildImageInput(parts, aspect, fallbackPrompt);
  if (!config) return sendError(res, 400, 'INPUT', 'Nội dung, ảnh mẫu hoặc tỉ lệ khung chưa hợp lệ.');
  const call = (model, config, waitMs) => fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...config.headers },
    body: config.body,
    redirect: 'error',
    signal: AbortSignal.timeout(waitMs)
  });
  const sendFailure = ({ status, code, message, diagnostic }) => sendError(res, status, code, message, diagnostic);
  if (kind === 'image') {
    const { failure, ...result } = await generateImage(call, config, personal);
    return failure ? sendFailure(failure) : res.status(200).json(result);
  }
  try {
    const response = await call(backup ? BACKUP_TEXT_MODEL : TEXT_MODEL, config, probe === true ? 40_000 : 87_000);
    if (!response.ok) return sendFailure(upstreamFailure(response.status, await response.json().catch(() => null), { personal }));
    const body = await response.json();
    if (body.success === false) return sendFailure(upstreamFailure(422, body, { personal }));
    const result = body.result || body;
    const choice = result.choices?.[0];
    if (scriptTask && choice?.finish_reason === 'length') {
      return sendError(res, 502, 'CF_INCOMPLETE', 'Cloudflare trả về một phần nội dung.');
    }
    const message = choice?.message?.content;
    const text = typeof message === 'string' ? message : Array.isArray(message) ?
      message.map(part => part?.text || '').join('') : result.response;
    if (typeof text !== 'string' || !text.trim()) return sendError(res, 502, 'CF_EMPTY', 'Cloudflare không trả nội dung văn bản.');
    return res.status(200).json({ text });
  } catch (error) {
    return sendFailure(networkFailure(error));
  }
};
