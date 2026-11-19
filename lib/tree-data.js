// Chế độ cây chủ đề: dữ liệu cây, kiểm tra hợp lệ, luật khóa/mở và nút gợi ý.
// File này không dùng mạng hay cơ sở dữ liệu nên dễ kiểm tra.
// Không import receipt.js để tránh vòng lặp với defaults.js -> db.js. Cùng cách đọc số tiền như receipt.js.
export function amountVnd(value) {
  const s = String(value ?? '').trim().replace(/(?:VND|VNĐ|đ|₫)/gi, '').trim();
  if (!/^\d+(?:[., ]\d{3})*$/.test(s)) return null;
  const n = Number(s.replace(/[., ]/g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const TREE_LIMITS = { depth: 4, nodes: 150, label: 20, prompt: 600, answer: 3000, intro: 800 };
export const MAX_QUICK_REPLIES = 13;

export const DEFAULT_TREE_OFFER = `Mục «{label}» là phần xem sâu hơn. Để mình luận chi tiết cho {name}, bạn chuyển khoản theo thông tin sau:
{payinfo}
Chuyển xong bạn gửi ảnh giao dịch (hoặc nhắn “đã chuyển”), bên mình xác nhận xong sẽ mở mục này ngay 🙏`;

export const DEFAULT_TREE_PAID = `Bên mình đã nhận được thanh toán, cảm ơn {name} nhé 🙏
Bạn bấm nút bên dưới để mình luận mục này cho bạn.`;

export const DEFAULT_TREE = {
  version: 1,
  intro: 'Mình đã lập xong lá số cho {name} rồi nhé 🌟\nBạn đang quan tâm điều gì nhất? Bấm một mục bên dưới để mình xem cho bạn:',
  bundle: { on: false, label: 'Mở tất cả', price: '', qr: '' },
  nodes: [
    { id: 'n1', label: '💼 Sự nghiệp', prompt: 'Tổng quan công danh, sự nghiệp theo cung Quan Lộc.', answer: '', locked: false, price: '', qr: '', ai_next: false, children: [
      { id: 'n1a', label: 'Nên làm nghề gì', prompt: 'Ngành nghề, tính chất công việc hợp với bản mệnh.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
      { id: 'n1b', label: 'Có nên đổi việc', prompt: 'Xu hướng công việc, thời điểm cân nhắc thay đổi.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
    ] },
    { id: 'n2', label: '💰 Tiền bạc', prompt: 'Tổng quan tài chính theo cung Tài Bạch và Điền Trạch.', answer: '', locked: false, price: '', qr: '', ai_next: false, children: [
      { id: 'n2a', label: 'Cách giữ tiền', prompt: 'Thói quen chi tiêu, tích lũy hợp với bản mệnh.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
      { id: 'n2b', label: 'Đầu tư, kinh doanh', prompt: 'Xu hướng làm ăn, mức độ mạo hiểm phù hợp. Không khuyên đầu tư cụ thể.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
    ] },
    { id: 'n3', label: '❤️ Tình duyên', prompt: 'Tổng quan tình duyên, gia đạo theo cung Phu Thê và Tử Tức.', answer: '', locked: false, price: '', qr: '', ai_next: false, children: [
      { id: 'n3a', label: 'Người hợp với mình', prompt: 'Tính cách người bạn đời hợp với bản mệnh.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
      { id: 'n3b', label: 'Bao giờ có duyên', prompt: 'Xu hướng tình cảm, giai đoạn thuận lợi.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
    ] },
    { id: 'n4', label: '🌿 Sức khỏe', prompt: 'Lưu ý giữ gìn sức khỏe, phúc phần theo cung Tật Ách và Phúc Đức. Không chẩn đoán bệnh.', answer: '', locked: false, price: '', qr: '', ai_next: true, children: [] },
  ],
};

const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
export const fitTitle = (s) => Array.from(String(s || '')).slice(0, TREE_LIMITS.label).join('').trim();

function normNode(raw, depth, state, trail) {
  if (!raw || typeof raw !== 'object') throw new Error('Cây chủ đề có một mục bị hỏng.');
  if (depth > TREE_LIMITS.depth) throw new Error(`Cây chỉ nhận tối đa ${TREE_LIMITS.depth} tầng nút.`);
  if (++state.count > TREE_LIMITS.nodes) throw new Error(`Cây chỉ nhận tối đa ${TREE_LIMITS.nodes} nút.`);
  const label = clean(raw.label, 80);
  if (!label) throw new Error('Có nút chưa có chữ. Bạn điền chữ trên nút hoặc xoá nút đó.');
  if (Array.from(label).length > TREE_LIMITS.label) throw new Error(`Chữ trên nút «${label}» dài quá ${TREE_LIMITS.label} ký tự (Messenger chỉ cho phép ngắn).`);
  let id = clean(raw.id, 30).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || state.ids.has(id)) { do { id = 'n' + Math.random().toString(36).slice(2, 8); } while (state.ids.has(id)); }
  state.ids.add(id);
  const locked = raw.locked === true;
  const price = clean(raw.price, 20);
  if (locked && !amountVnd(price)) throw new Error(`Nút «${label}» đang khóa nhưng chưa có giá hợp lệ (ví dụ 99.000).`);
  const qr = clean(raw.qr, 200);
  if (qr && !/^\/api\/media\/[a-f0-9]{16,64}$/.test(qr) && !/^https:\/\//i.test(qr)) throw new Error(`Ảnh QR của nút «${label}» không hợp lệ.`);
  const intro = clean(raw.intro_image, 200);
  if (intro && !/^\/api\/media\/[a-f0-9]{16,64}$/.test(intro) && !/^https:\/\//i.test(intro)) throw new Error(`Ảnh giới thiệu của nút «${label}» không hợp lệ.`);
  const children = (Array.isArray(raw.children) ? raw.children : []).map((c) => normNode(c, depth + 1, state, [...trail, label]));
  return {
    id, label,
    prompt: clean(raw.prompt, TREE_LIMITS.prompt),
    answer: clean(raw.answer, TREE_LIMITS.answer),
    locked, price: locked ? price : '', qr: locked ? qr : '', intro_image: locked ? intro : '',
    ai_next: raw.ai_next === true && children.length === 0,
    children,
  };
}

// Kiểm tra và làm sạch cây do chủ shop soạn. Sai thì ném lỗi tiếng Việt (trang quản trị hiện cho chủ shop).
export function normalizeTree(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const state = { count: 0, ids: new Set() };
  const nodes = (Array.isArray(src.nodes) ? src.nodes : []).map((n) => normNode(n, 1, state, []));
  if (!nodes.length) throw new Error('Cây cần ít nhất một nút gốc.');
  const b = src.bundle && typeof src.bundle === 'object' ? src.bundle : {};
  const bundle = { on: b.on === true, label: clean(b.label, 30) || 'Mở tất cả', price: clean(b.price, 20), qr: clean(b.qr, 200), intro_image: clean(b.intro_image, 200) };
  if (bundle.on && !amountVnd(bundle.price)) throw new Error('Gói mở hết đang bật nhưng chưa có giá hợp lệ.');
  if (bundle.qr && !/^\/api\/media\/[a-f0-9]{16,64}$/.test(bundle.qr) && !/^https:\/\//i.test(bundle.qr)) throw new Error('Ảnh QR gói mở hết không hợp lệ.');
  if (bundle.intro_image && !/^\/api\/media\/[a-f0-9]{16,64}$/.test(bundle.intro_image) && !/^https:\/\//i.test(bundle.intro_image)) throw new Error('Ảnh giới thiệu gói mở hết không hợp lệ.');
  return { version: 1, intro: clean(src.intro, TREE_LIMITS.intro) || DEFAULT_TREE.intro, bundle, nodes };
}

// Đọc cây từ cài đặt; trống hoặc hỏng thì dùng cây mẫu (bot không bao giờ bị kẹt vì cây hỏng).
export function loadTree(settings) {
  try {
    const raw = settings && settings.tree_data ? JSON.parse(settings.tree_data) : null;
    if (raw) return normalizeTree(raw);
  } catch { /* dùng cây mẫu */ }
  return normalizeTree(DEFAULT_TREE);
}

export function flatten(tree) {
  const out = [];
  const walk = (nodes, path) => nodes.forEach((n) => { const p = [...path, n]; out.push({ node: n, path: p }); walk(n.children || [], p); });
  walk(tree.nodes, []);
  return out;
}
export const findNode = (tree, id) => flatten(tree).find((x) => x.node.id === id) || null;

// Mục nào đứng chắn đường? Trả về nút khóa đầu tiên trên đường đi mà khách chưa mở (null = đi được).
// Trả tiền cho một nút mở luôn cả nhánh con của nút đó.
export function blockedBy(path, ts) {
  if (ts.bundle) return null;
  let covered = false;
  for (const n of path) {
    if ((ts.unlocked || []).includes(n.id)) covered = true;
    if (n.locked && !covered) return n;
  }
  return null;
}

export const norm = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const NAV_BACK = { id: '__back', label: '⬅️ Quay lại' };
const NAV_HOME = { id: '__home', label: '🏠 Mục chính' };
export const NAV_CANCEL = { id: '__cancel', label: '⬅️ Quay lại' };

function childEntry(child, path, ts) {
  const lock = child.locked && blockedBy([...path, child], ts);
  return { id: child.id, label: fitTitle((lock ? '🔒 ' : '') + child.label) };
}

// Các nút hiện bên dưới tin nhắn khi khách đang ở một mục (node = null là màn hình chính)
export function menuOffered(tree, path, ts, aiItems = []) {
  const node = path.length ? path[path.length - 1] : null;
  const kids = node ? (node.children || []) : tree.nodes;
  // Cuối nhánh (nút không còn nút con): không hiện Quay lại / Mục chính. Giữa cây thì vẫn có.
  const leaf = Boolean(node) && kids.length === 0;
  const nav = path.length === 0 || leaf ? [] : path.length === 1 ? [NAV_BACK] : [NAV_BACK, NAV_HOME];
  const room = MAX_QUICK_REPLIES - nav.length - aiItems.length;
  const entries = [...kids.slice(0, Math.max(0, room)).map((c) => childEntry(c, path, ts)), ...aiItems, ...nav];
  const seen = new Set();
  return entries.filter((e) => { const k = norm(e.label); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

export function bundleEntry(tree) {
  return { id: '__bundle', label: fitTitle('🎁 ' + (tree.bundle.label || 'Mở tất cả')) };
}

export function toQuickReplies(offered) {
  return (offered || []).slice(0, MAX_QUICK_REPLIES).map((o) => ({ content_type: 'text', title: fitTitle(o.label), payload: ('T:' + o.id).slice(0, 200) }));
}

// Khách bấm nút (hoặc gõ đúng chữ trên nút): tìm nút trong danh sách vừa gửi
export function matchOffered(text, offered) {
  const t = norm(text);
  if (!t) return null;
  const byLabel = (offered || []).find((o) => norm(o.label) === t);
  if (byLabel) return byLabel;
  // Khách nhắn số thứ tự (khớp với danh sách đánh số bot gửi kèm nút), ví dụ "2" hoặc "2."
  const m = String(text).trim().match(/^(?:số\s*)?(\d{1,2})\s*[.)]?$/i);
  if (m) {
    const list = (offered || []).slice(0, MAX_QUICK_REPLIES);
    const o = list[Number(m[1]) - 1];
    if (o && list.length >= 2) return o;
  }
  return null;
}

export const vndText = (v) => { const n = amountVnd(v); return n ? n.toLocaleString('vi-VN') + ' đ' : String(v || ''); };
