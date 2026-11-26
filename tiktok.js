// Cầu nối TikTok/Douyin: nhận link TikTok hoặc Douyin, trả về link âm thanh/video, hoặc chuyển tiếp file media về trình duyệt (tránh lỗi CORS)
const MAX_BYTES = 80 * 1024 * 1024;

function blockedHost(h) {
  h = (h || '').toLowerCase();
  return !h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h);
}
function isTikTok(h) {
  h = (h || '').toLowerCase();
  return ['tiktok.com', 'douyin.com', 'iesdouyin.com'].some(d => h === d || h.endsWith('.' + d));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const q = req.query || {};

  try {
    // GET ?media=<link https>  -> chuyển tiếp file âm thanh/video về trình duyệt (dạng luồng, giới hạn dung lượng)
    if (q.media) {
      const u = new URL(q.media);
      if (u.protocol !== 'https:' || blockedHost(u.hostname)) {
        return res.status(400).json({ error: { message: 'Link media không hợp lệ' } });
      }
      const r = await fetch(u.toString(), { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' } });
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      if (!r.ok || !/^(audio|video)\/|octet-stream/i.test(ct)) {
        return res.status(502).json({ error: { message: 'Không tải được file media (' + r.status + ')' } });
      }
      res.status(200);
      res.setHeader('Content-Type', ct);
      const reader = r.body.getReader();
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) { try { await reader.cancel(); } catch (e) {} break; }
        res.write(Buffer.from(value));
      }
      return res.end();
    }

    // GET ?url=<link tiktok>  -> hỏi dịch vụ tikwm lấy link âm thanh/video
    if (!q.url) return res.status(400).json({ error: { message: 'Thiếu link TikTok' } });
    const t = new URL(q.url);
    if (!/^https?:$/.test(t.protocol) || !isTikTok(t.hostname)) {
      return res.status(400).json({ error: { message: 'Đây không phải link TikTok hoặc Douyin' } });
    }
    const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(t.toString()), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const j = await r.json();
    if (!j || j.code !== 0 || !j.data) {
      return res.status(502).json({ error: { message: (j && j.msg) ? String(j.msg) : 'Không lấy được thông tin video TikTok' } });
    }
    const d = j.data;
    const abs = x => (x && /^https?:\/\//.test(x)) ? x : (x ? 'https://www.tikwm.com' + x : '');
    return res.status(200).json({
      title: d.title || '',
      duration: d.duration || 0,
      audio: abs(d.music || (d.music_info && d.music_info.play)),
      video: abs(d.play || d.wmplay)
    });
  } catch (e) {
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: { message: 'Lỗi cầu nối TikTok: ' + e.message } });
  }
};
