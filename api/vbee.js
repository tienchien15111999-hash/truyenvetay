// Cầu nối: nhận yêu cầu từ trang web, chuyển sang Vbee rồi trả âm thanh về
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, App-Id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Chỉ nhận POST' } });
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch('https://api.vbee.vn/v1/tts', {
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
