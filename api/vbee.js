// Cầu nối: nhận yêu cầu từ trang web, chuyển sang Vbee rồi trả kết quả về
const BASE = 'https://api.vbee.vn/v1/tts';

function blockedHost(h) {
  h = (h || '').toLowerCase();
  return !h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, App-Id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // GET ?audio=<link>  -> tải file âm thanh Vbee trả về (tránh lỗi CORS)
    if (req.method === 'GET' && req.query && req.query.audio) {
      const u = new URL(req.query.audio);
      if (u.protocol !== 'https:' || blockedHost(u.hostname)) {
        return res.status(400).json({ error: { message: 'Link âm thanh không hợp lệ' } });
      }
      const a = await fetch(u.toString());
      const abuf = Buffer.from(await a.arrayBuffer());
      res.status(a.status);
      res.setHeader('Content-Type', a.headers.get('content-type') || 'audio/mpeg');
      return res.send(abuf);
    }

    // GET ?id=<requestId>  -> hỏi trạng thái yêu cầu Batch
    if (req.method === 'GET' && req.query && req.query.id) {
      const r = await fetch(BASE + '/requests/' + encodeURIComponent(req.query.id), {
        headers: {
          'Authorization': req.headers['authorization'] || '',
          'App-Id': req.headers['app-id'] || ''
        }
      });
      const t = await r.text();
      res.status(r.status);
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
      return res.send(t);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Chỉ nhận POST/GET' } });

    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers['authorization'] || '',
        'App-Id': req.headers['app-id'] || ''
      },
      body
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: { message: 'Cầu nối không gọi được Vbee: ' + e.message } });
  }
};
