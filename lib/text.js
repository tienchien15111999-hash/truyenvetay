// Các hàm xử lý chữ (không phụ thuộc mạng/DB nên dễ kiểm tra)

// Cắt tin dài thành nhiều tin ≤ max ký tự, ưu tiên cắt ở chỗ xuống dòng / hết câu
export function splitText(text, max = 1900) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const paras = clean.split(/\n{2,}/);
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > max) {
      push();
      let rest = p;
      while (rest.length > max) {
        let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('\n', max), rest.lastIndexOf(' ', max));
        if (cut < max * 0.5) cut = max - 1;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest;
      continue;
    }
    if ((cur + '\n\n' + p).length > max) push();
    cur = cur ? cur + '\n\n' + p : p;
  }
  push();
  return out;
}

// Messenger không hiển thị markdown: bỏ **, ##, gạch đầu dòng kiểu markdown
export function cleanForMessenger(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[*]\s+/gm, '• ')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Bot được dặn ghi hồ sơ ở cuối câu trả lời: [[HOSO:mat]] ... hoặc [[HOSO:tay]] ...
// Hàm này tách phần hồ sơ ra, phần còn lại là tin gửi cho khách.
export function parseProfileMarkers(raw) {
  const text = String(raw || '');
  let face = null;
  let palm = null;
  const re = /\[\[HOSO:(mat|tay)\]\]([\s\S]*?)(?=\[\[HOSO:|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2].replace(/\s+/g, ' ').trim().slice(0, 900);
    if (m[1].toLowerCase() === 'mat') face = body || face;
    else palm = body || palm;
  }
  const visible = text.replace(/\[\[HOSO:(mat|tay)\]\][\s\S]*?(?=\[\[HOSO:|$)/gi, '');
  return { clean: cleanForMessenger(visible), face, palm };
}

// Gemini muốn lượt nói xen kẽ user/model: gộp các lượt liền nhau cùng vai
export function mergeSameRole(rows) {
  const out = [];
  for (const r of rows) {
    const role = r.role === 'bot' ? 'model' : 'user';
    const text = String(r.text || '').trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + text;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
