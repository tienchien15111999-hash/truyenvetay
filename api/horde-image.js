const HORDE_API = 'https://aihorde.net/api/v2/generate';
const JOB_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const API_KEY = /^[a-z0-9_-]{1,128}$/i;

function decodeImageData(data) {
  if (typeof data !== 'string' || data.length > 3_400_000 || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return null;
  const header = Buffer.from(data.slice(0, 24), 'base64');
  const mimeType = header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
    : header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
    : header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff ? 'image/jpeg' : '';
  return mimeType ? { mimeType, data } : null;
}

function upstreamError(status, result) {
  if ([401, 403].includes(status)) return 'AI Horde từ chối yêu cầu. Kiểm tra API key và quyền của tài khoản.';
  if (status === 429) return 'AI Horde đang giới hạn lượt gửi hoặc hàng đợi đã đầy. Hãy thử lại sau.';
  if (status === 404) return 'Yêu cầu vẽ AI Horde đã hết hạn hoặc không còn trong hàng đợi.';
  const code = typeof result?.rc === 'string' && /^[a-z0-9_-]{1,80}$/i.test(result.rc) ? ' (' + result.rc + ')' : '';
  return 'AI Horde chưa xử lý được yêu cầu' + code + '.';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, message) => res.status(status).json({ error: message });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Chỉ nhận POST.');
  }

  let args;
  try { args = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return fail(400, 'Yêu cầu AI Horde không hợp lệ.'); }
  const { action, id, prompt, aspect, style } = args || {};
  const key = req.headers['x-horde-api-key'] || '0000000000';
  if (typeof key !== 'string' || !API_KEY.test(key)) return fail(400, 'API key AI Horde không hợp lệ.');
  const contact = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'localhost';
  const headers = { 'Content-Type': 'application/json', apikey: key, 'Client-Agent': 'truyenvetay:1.0:' + contact };
  let path, method = 'GET', body;
  if (action === 'submit') {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000 ||
        !['9:16', '16:9'].includes(aspect) || !['anime', 'threeD', 'portrait'].includes(style)) {
      return fail(400, 'Mô tả, phong cách hoặc tỉ lệ ảnh AI Horde không hợp lệ.');
    }
    const [shortSide, longSide] = key === '0000000000' ? [384, 640] : [512, 896];
    const [width, height] = aspect === '9:16' ? [shortSide, longSide] : [longSide, shortSide];
    path = '/async';
    method = 'POST';
    body = JSON.stringify({
      prompt: prompt.replaceAll('###', ' ') + ' ### collage, text, watermark',
      params: { width, height, n: 1, steps: 18, sampler_name: 'k_euler' },
      models: style === 'portrait' ? ['Juggernaut XL', 'AlbedoBase XL 3.1'] : ['AlbedoBase XL 3.1', 'Juggernaut XL'],
      nsfw: false,
      censor_nsfw: true,
      shared: false,
      slow_workers: true,
      allow_downgrade: true,
      r2: false
    });
  } else if (typeof id === 'string' && JOB_ID.test(id) && ['check', 'result', 'cancel'].includes(action)) {
    path = (action === 'check' ? '/check/' : '/status/') + id;
    if (action === 'cancel') method = 'DELETE';
  } else return fail(400, 'Thao tác hoặc mã yêu cầu AI Horde không đúng.');

  try {
    const upstream = await fetch(HORDE_API + path, { method, headers, body, signal: AbortSignal.timeout(12000), redirect: 'error' });
    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) return fail(upstream.status, upstreamError(upstream.status, result));
    if (action === 'submit') {
      return JOB_ID.test(result?.id || '') ? res.status(202).json({ id: result.id }) : fail(502, 'AI Horde chưa trả mã hàng đợi.');
    }
    if (action === 'cancel') return res.status(200).json({ cancelled: true });
    if (action === 'check') {
      if (typeof result?.done !== 'boolean') return fail(502, 'AI Horde chưa trả trạng thái hàng đợi.');
      return res.status(200).json({ done: result.done, faulted: result.faulted === true, wait: Number.isFinite(result.wait_time) ? result.wait_time : null });
    }
    const generation = result?.generations?.[0];
    if (generation?.state === 'censored' || generation?.censored) return fail(422, 'AI Horde đã lọc ảnh của cảnh này.');
    const image = decodeImageData(generation?.img);
    return image ? res.status(200).json({ image }) : fail(502, 'AI Horde chưa trả ảnh hợp lệ.');
  } catch (e) {
    return fail(e.name === 'TimeoutError' ? 504 : 502, 'Chưa kết nối được AI Horde.');
  }
};
