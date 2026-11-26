const { timingSafeEqual } = require('node:crypto');

const TEXT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const BACKUP_TEXT_MODEL = '@cf/zai-org/glm-4.7-flash';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const DIMENSIONS = {
  '4:5': [768, 960], '21:9': [1120, 480], '9:16': [576, 1024], '16:9': [1024, 576]
};
const IMAGE_MIME = /^image\/(?:jpeg|png|webp)$/i;
const MAX_IMAGE_BYTES = 2_800_000; // Trả Base64 qua Vercel Functions, còn dư dưới giới hạn 4.5 MB.

function validImage(part) {
  return part && IMAGE_MIME.test(part.mimeType) && typeof part.data === 'string' &&
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

function buildImageRequest(parts, aspect) {
  if (!Object.hasOwn(DIMENSIONS, aspect)) return null;
  const names = [], prompt = [], form = new FormData();
  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.trim()) prompt.push(part.text);
    else if (validImage(part.inlineData) && names.length < 4) {
      const name = `input_image_${names.length}`, { mimeType, data } = part.inlineData;
      form.append(name, new Blob([Buffer.from(data, 'base64')], { type: mimeType }), name);
      names.push(name);
      prompt.push(`[Reference image ${names.length - 1}]`);
    } else return null;
  }
  const text = prompt.join('\n\n');
  if (!text.trim() || text.length > 20000) return null;
  const [width, height] = DIMENSIONS[aspect];
  form.append('prompt', text);
  form.append('width', String(width));
  form.append('height', String(height));
  return { body: form };
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

async function upstreamError(response, res, personal) {
  const body = await response.json().catch(() => ({}));
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const details = errors.map(err => String(err?.message || '')).join(' ');
  if (errors.some(err => Number(err?.code) === 3036) || /neurons?.{0,70}limit|daily.{0,60}(limit|quota)|free allocation|out of neurons|account.{0,30}limit reached/i.test(details)) {
    return sendError(res, 429, 'CF_DAILY_LIMIT', 'Hết hạn mức Cloudflare hôm nay. Hạn mức ngày làm mới lúc 7 giờ sáng theo giờ Việt Nam.');
  }
  if ([408, 504].includes(response.status) || errors.some(err => [3007, 3008].includes(Number(err?.code)))) {
    return sendError(res, 504, 'CF_TIMEOUT', 'Cloudflare xử lý quá thời gian.');
  }
  if (errors.some(err => Number(err?.code) === 3040) || /capacity temporarily exceeded/i.test(details)) {
    return sendError(res, 503, 'CF_BUSY', 'Cloudflare đang quá tải.');
  }
  if (response.status === 429 || /rate.limit|too many requests/i.test(details)) {
    return sendError(res, 429, 'CF_RATE_LIMIT', 'Cloudflare đang giới hạn lượt gọi. Hãy chờ rồi bấm Chạy bù.');
  }
  if ([401, 403].includes(response.status)) {
    return sendError(res, 403, 'CF_UNAUTHORIZED', personal
      ? 'Account ID, API Token hoặc quyền Workers AI chưa đúng. Kiểm tra hai ô trong Cài đặt.'
      : 'Account ID, API Token hoặc quyền Workers AI chưa đúng. Kiểm tra cài đặt trên Vercel.');
  }
  if (response.status === 404) return sendError(res, 503, 'CF_UNAVAILABLE', 'Không tìm thấy model hoặc tài khoản Cloudflare Workers AI.');
  if (response.status >= 500) return sendError(res, 502, 'CF_UPSTREAM', 'Cloudflare Workers AI đang bận hoặc lỗi dịch vụ. Hãy thử lại.');
  return sendError(res, 422, 'CF_REJECTED', 'Cloudflare không xử lý được yêu cầu này. Kiểm tra nội dung hoặc ảnh mẫu rồi thử lại.');
}

async function sendImage(response, res, personal) {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim() || '';
  let bytes, mimeType;
  if (IMAGE_MIME.test(contentType)) {
    bytes = Buffer.from(await response.arrayBuffer());
    mimeType = contentType;
  } else {
    const body = await response.json().catch(() => ({}));
    if (body.success === false) return upstreamError(new Response(JSON.stringify(body), { status: 422 }), res, personal);
    const data = body.result?.image;
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
      return sendError(res, 502, 'CF_IMAGE_INVALID', 'Cloudflare không trả ảnh hợp lệ.');
    }
    const uri = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/is);
    bytes = Buffer.from(uri ? uri[2] : data, 'base64');
    mimeType = uri?.[1] || (bytes[0] === 137 ? 'image/png' : bytes.toString('ascii', 0, 4) === 'RIFF' ? 'image/webp' : 'image/jpeg');
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return sendError(res, 502, 'CF_IMAGE_INVALID', 'Ảnh Cloudflare trống hoặc quá lớn.');
  return res.status(200).json({ image: { mimeType, data: bytes.toString('base64') } });
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
  const { kind, parts, aspect, json, probe, task, backup: tryBackup } = request || {};
  if (!['text', 'image'].includes(kind) || !Array.isArray(parts) || parts.length === 0 || parts.length > 16 ||
      parts.some(part => !part || typeof part !== 'object' || (typeof part.text === 'string' && part.text.length > 160000))) {
    return sendError(res, 400, 'INPUT', 'Nội dung hoặc số ảnh mẫu vượt giới hạn.');
  }
  const scriptTask = kind === 'text' && (task === 'script' || task === 'storyboard');
  const backup = scriptTask && tryBackup === true && parts.every(part => !part.inlineData);
  const limit = task === 'script' ? 3000 : task === 'storyboard' ? 2400 : 8192;
  const config = kind === 'text' ? buildTextRequest(parts, { json: json === true, probe: probe === true, backup, limit })
    : buildImageRequest(parts, aspect);
  if (!config) return sendError(res, 400, 'INPUT', 'Nội dung, ảnh mẫu hoặc tỉ lệ khung chưa hợp lệ.');
  const model = kind === 'image' ? IMAGE_MODEL : backup ? BACKUP_TEXT_MODEL : TEXT_MODEL;
  const waitMs = probe === true && kind === 'text' ? 40_000 : kind === 'image' ? 80_000 : 87_000;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...config.headers },
      body: config.body,
      redirect: 'error',
      signal: AbortSignal.timeout(waitMs)
    });
    if (!response.ok) return await upstreamError(response, res, personal);
    if (kind === 'image') return await sendImage(response, res, personal);
    const body = await response.json();
    if (body.success === false) return await upstreamError(new Response(JSON.stringify(body), { status: 422 }), res, personal);
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
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    return sendError(res, timeout ? 504 : 502, timeout ? 'CF_TIMEOUT' : 'CF_NETWORK',
      timeout ? 'Cloudflare xử lý quá thời gian. Hãy thử lại.' : 'Chưa kết nối được Cloudflare Workers AI.');
  }
};
