// Chế độ cây chủ đề: khách bấm nút để đi qua các mục, mục khóa cần trả tiền riêng.
// Việc khóa/mở do code quyết định (không nhờ AI), AI chỉ viết nội dung mục đã được phép xem.
import { randomBytes } from 'node:crypto';
import { askGemini } from './gemini.js';
import { generateLaSo } from './tuvi.js';
import { lifetimePrompt } from './lifetime.js';
import { updateTuViSnapshot, saveTurn } from './db.js';
import { cleanForMessenger, mergeSameRole, hideName } from './text.js';
import { compareReceipt, readReceipt } from './receipt.js';
import { packageImageUrl } from './package-media.js';
import { notifyOwner } from './alert.js';
import {
  amountVnd, flatten, findNode, blockedBy, menuOffered, bundleEntry, toQuickReplies, matchOffered,
  norm, fitTitle, vndText, NAV_CANCEL, DEFAULT_TREE_OFFER, DEFAULT_TREE_PAID,
} from './tree-data.js';

const PAID_CLAIM = /(đã chuyển|da chuyen|chuyển khoản rồi|chuyen khoan roi|đã ck|ck rồi|ck xong|chuyển rồi|chuyển xong|thanh toán rồi|đã thanh toán|đã gửi tiền)/i;
const PENDING_TEXT = 'Mình đã ghi nhận thông tin chuyển khoản của bạn. Bên mình đang kiểm tra và sẽ xác nhận trong ít phút, bạn đợi mình một chút nhé 🙏';
const MAX_AI_CHAIN = 3;
const freeLimit = (v) => (/^\d+$/.test(String(v)) ? Math.min(50, Number(v)) : 3);
const fill = (text, vars) => String(text || '').replace(/\{(name|label|amount|payinfo)\}/g, (_, k) => (k === 'name' ? 'bạn' : vars[k] ?? ''));
const pendingStage = (s) => ['OFFERED', 'PENDING_CONFIRM'].includes(s);

function parseJson(text) {
  try { const m = String(text).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

// ---------- thanh toán ----------
export function vietQrUrl(settings, amount, content) {
  const bank = String(settings.tree_bank_code || '').trim();
  const account = String(settings.receipt_account || '').replace(/\D/g, '');
  const n = amountVnd(amount);
  if (!/^[A-Za-z0-9]{2,12}$/.test(bank) || !account || !n) return '';
  const q = new URLSearchParams({ amount: String(n), addInfo: content });
  if (settings.receipt_recipient) q.set('accountName', settings.receipt_recipient.trim());
  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${q}`;
}

export function newTreePayment(settings, tree, target) {
  const bundle = target === 'bundle';
  const amount = bundle ? tree.bundle.price : target.price;
  if (!amountVnd(amount) || !settings.receipt_recipient?.trim()) return null;
  const ref = 'M' + randomBytes(4).toString('hex').toUpperCase();
  const content = (settings.receipt_content?.trim() || 'TV {ref}').replaceAll('{ref}', ref);
  const own = bundle ? tree.bundle.qr : target.qr;
  return {
    id: ref, kind: bundle ? 'tree_bundle' : 'tree_node', nodeId: bundle ? null : target.id,
    label: bundle ? tree.bundle.label || 'Mở tất cả' : target.label,
    amount, recipient: settings.receipt_recipient.trim(), account: settings.receipt_account?.trim() || '',
    receiptMatch: 'name_amount', content, bankInfo: settings.pay_info || '',
    qr: own || vietQrUrl(settings, amount, content),
  };
}

export function treePaymentText(settings, tree, payment, name) {
  const info = [
    `Số tiền: ${vndText(payment.amount)}`,
    `Người nhận: ${payment.recipient}`,
    payment.account && `Số tài khoản: ${payment.account}`,
    payment.bankInfo && String(payment.bankInfo).trim(),
    `Nội dung chuyển khoản: ${payment.content}`,
  ].filter(Boolean).join('\n');
  let text;
  if (payment.kind === 'tree_bundle') {
    text = `Gói «${payment.label}» mở tất cả các mục cho ${name}. Bạn chuyển khoản theo thông tin sau:\n${info}\nChuyển xong bạn gửi ảnh giao dịch (hoặc nhắn “đã chuyển”), bên mình xác nhận xong sẽ mở ngay 🙏`;
  } else {
    text = fill(settings.tree_offer_message || DEFAULT_TREE_OFFER, { name, label: payment.label, amount: vndText(payment.amount), payinfo: info });
  }
  if (payment.kind !== 'tree_bundle' && tree.bundle.on && amountVnd(tree.bundle.price)) {
    text += `\n\n🎁 Muốn mở tất cả các mục? Bấm nút “${tree.bundle.label}” (${vndText(tree.bundle.price)}).`;
  }
  return text;
}

// ---------- bắt đầu cây ----------
const blankTree = () => ({ node: null, offered: [], unlocked: [], bundle: false, freeAnswers: 0, aiChain: 0, orders: [] });

export function treeStart(tree, state) {
  const name = 'bạn'; // khách chỉ được gọi là “bạn”
  const ts = blankTree();
  ts.offered = menuOffered(tree, [], ts);
  const next = { ...state, status: 'COMPLETED', flow: 'YEAR_SALES', stage: 'TREE', paid: false, annualPaid: false, payment: null, receipt: null, tree: ts };
  return { reply: fill(tree.intro, { name }), next, quickReplies: toQuickReplies(ts.offered), showList: true };
}

// Khách đã có lá số: vào cây khi đã có cây, hoặc khi chưa mua gì (không đụng đơn đang chạy của chế độ cũ)
export function shouldRunTree(state) {
  if (!state || state.status !== 'COMPLETED' || !state.info) return false;
  if (state.tree) return true;
  return !state.paid && !state.annualPaid && !state.payment?.id;
}

// Chủ shop xác nhận đã nhận tiền (confirm), mở tất cả (grant_all) hoặc thu hồi (revoke)
export function confirmTree(tree, state, action, settings = {}) {
  const ts = state.tree;
  const name = 'bạn'; // khách chỉ được gọi là “bạn”
  if (action === 'revoke') {
    const t = { ...ts, unlocked: [], bundle: false, node: null };
    t.offered = menuOffered(tree, [], t);
    return { next: { ...state, stage: 'TREE', payment: null, receipt: null, tree: t } };
  }
  const order = state.payment;
  const unlocked = [...(ts.unlocked || [])];
  let bundle = Boolean(ts.bundle);
  let open = null;
  if (action === 'grant_all' || order?.kind === 'tree_bundle') bundle = true;
  else if (order?.nodeId) { if (!unlocked.includes(order.nodeId)) unlocked.push(order.nodeId); open = findNode(tree, order.nodeId); }
  const t = {
    ...ts, unlocked, bundle, node: null,
    orders: [...(ts.orders || []), ...(order ? [{ id: order.id, label: order.label, amount: order.amount, at: new Date().toISOString() }] : [])],
  };
  let message;
  if (open) {
    t.offered = [{ id: open.node.id, label: fitTitle('Xem ' + open.node.label) }, { id: '__home', label: '🏠 Mục chính' }];
    message = fill(settings.tree_paid_message || DEFAULT_TREE_PAID, { name, label: open.node.label });
  } else {
    t.offered = menuOffered(tree, [], t);
    message = `Bên mình đã nhận được thanh toán, cảm ơn ${name} nhé 🙏\nBạn đã được mở tất cả các mục. Bạn bấm một mục bên dưới để mình luận cho bạn.`;
  }
  return { next: { ...state, stage: 'TREE', payment: null, receipt: null, tree: t }, message, offered: t.offered };
}

// ---------- AI ----------
async function readNode({ settings, state, path, question, extraKeys, rawHistory }) {
  const node = path[path.length - 1];
  const chart = generateLaSo(state.info);
  const title = path.map((n) => n.label).join(' › ');
  const base = question
    ? lifetimePrompt(settings, chart, null, true, state.info.maritalStatus)
    : lifetimePrompt(settings, chart, { title }, false, state.info.maritalStatus);
  const extra = `\nChủ đề khách vừa chọn: ${title}.${node.prompt ? `\nHƯỚNG DẪN CỦA CHỦ BOT CHO MỤC NÀY: ${node.prompt}` : ''}\n- Viết như người thật đang nhắn tin: không ghi tiêu đề, nhãn, tên mục hay dòng kiểu “Mục khách đang xem” ở đầu hoặc cuối tin. Không kết thúc bằng câu hỏi lặp lại kiểu “bạn muốn xem tiếp phần nào”; ứng dụng đã có nút bấm bên dưới.\n- Không nhắc đến tiền, thu phí hay chuyển khoản.`;
  const raw = await askGemini({
    system: base + extra, history: question ? mergeSameRole(rawHistory || []) : [],
    userText: question || `Luận mục ${title} cho khách.`, extraKeys, maxOutputTokens: 1600,
  });
  const text = hideName(stripLabels(cleanForMessenger(raw)).trim(), state.info?.fullName);
  if (!text) throw new Error('Chưa nhận được bài luận; chưa đổi trạng thái.');
  return text;
}

// Bỏ các dòng nhãn máy móc nếu AI lỡ chép lại (ví dụ “Mục khách đang xem: ...”)
const stripLabels = (t) => String(t || '').replace(/^[ \t]*(?:[📌👉➡️🔹•*_-]\s*)*(?:mục\s+(?:khách\s+)?đang\s+xem|chủ\s+đề\s+khách\s+vừa\s+chọn)\s*[:：][^\n]*\n?/gimu, '').replace(/\n{3,}/g, '\n\n');

async function followUps({ extraKeys, path, text }) {
  try {
    const title = path.map((n) => n.label).join(' › ');
    const raw = await askGemini({
      system: 'Bạn chỉ trả về JSON thuần túy, không markdown.', history: [], extraKeys, temperature: 0.7, task: 'fast', maxOutputTokens: 300,
      userText: `GỢI Ý CÂU HỎI TIẾP. Khách vừa đọc mục «${title}» trong lá số tử vi. Đề xuất đúng 3 câu hỏi tiếp theo khách có thể muốn hỏi, liên quan trực tiếp mục này, không nhắc tiền hay thu phí.\nNội dung vừa gửi (rút gọn): ${text.slice(0, 500)}\nTrả về: {"items":[{"label":"tối đa 18 ký tự, ví dụ: Khi nào khá hơn?","question":"câu hỏi đầy đủ gửi cho thầy"}]}`,
    });
    const items = (parseJson(raw)?.items || []).filter((x) => x && x.label && x.question).slice(0, 3);
    return items.map((x, i) => ({ id: 'ai:' + i, label: fitTitle(String(x.label)), q: String(x.question).slice(0, 200) }));
  } catch { return []; }
}

async function routeToNode({ tree, text, path, extraKeys }) {
  try {
    const list = flatten(tree).map(({ node, path: p }) => `${node.id} | ${p.map((n) => n.label).join(' > ')}${node.prompt ? ' | ' + node.prompt.slice(0, 60) : ''}`).join('\n');
    const raw = await askGemini({
      system: 'Bạn chỉ trả về JSON thuần túy, không markdown.', history: [], extraKeys, temperature: 0, task: 'fast', maxOutputTokens: 60,
      userText: `ĐỊNH TUYẾN MỤC. Các mục (id | đường dẫn | gợi ý):\n${list}\n\nKhách đang ở mục: ${path.map((n) => n.label).join(' > ') || '(màn hình chính)'}\nTin nhắn của khách: "${String(text).replace(/"/g, "'")}"\nChọn đúng MỘT mục khách đang muốn xem hoặc hỏi. Không có mục nào hợp thì trả null.\nNếu khách hỏi một câu cụ thể (ví dụ “năm sau tôi có con không”) thì ask=true; nếu khách chỉ muốn mở xem cả mục (ví dụ “xem tình duyên”) thì ask=false.\nTrả về: {"node":"id hoặc null","ask":true hoặc false}`,
    });
    const out = parseJson(raw);
    const id = out?.node;
    return typeof id === 'string' && findNode(tree, id) ? { id, ask: out.ask === true } : null;
  } catch { return null; }
}

// ---------- luồng chính ----------
export async function runTree(ctx) {
  const { psid, pageId, settings, profile, tree, userText = '', images = [], extraKeys = [], rawHistory = [], baseUrl } = ctx;
  let state = ctx.state;
  let snapshot = profile.tuvi_state;
  const text = String(userText || '').trim();
  const name = 'bạn'; // khách chỉ được gọi là “bạn”
  const ownerName = state.info?.fullName || 'khách'; // chỉ dùng cho thông báo gửi chủ shop

  const respond = async (reply, next, extra = {}) => {
    if (snapshot && !await updateTuViSnapshot(psid, snapshot, next)) {
      const keep = toQuickReplies(state.tree?.offered || []);
      return { reply: 'Hồ sơ của bạn vừa được cập nhật. Bạn bấm lại giúp mình nhé.', imageUrl: null, quickReplies: keep };
    }
    snapshot = JSON.stringify(next);
    await saveTurn(psid, pageId, userText || (images.length ? '[Ảnh khách gửi]' : ''), images.length > 0, [reply]);
    return { reply, imageUrl: null, quickReplies: toQuickReplies(next.tree.offered), ...extra };
  };

  // Khách cũ chưa mua gì: bắt đầu cây từ lượt này
  if (!state.tree) {
    const s = treeStart(tree, state);
    return respond(s.reply, s.next, { showList: true });
  }

  const ts = state.tree;
  const keepStage = pendingStage(state.stage) ? state.stage : 'TREE';
  const here = ts.node ? findNode(tree, ts.node) : null;
  const curPath = here ? here.path : [];

  const withTree = (patch, stage = keepStage, extraState = {}) => ({ ...state, ...extraState, stage, tree: { ...ts, ...patch } });
  const showMenu = (path, lead) => {
    // Đang ở cuối nhánh thì không có nút nào để bấm tiếp, nên hiện lại danh sách của mục cha
    if (path.length && !(path[path.length - 1].children || []).length) path = path.slice(0, -1);
    const offered = menuOffered(tree, path, ts);
    const where = path.length ? `Bạn muốn xem tiếp phần nào của «${path[path.length - 1].label}»?` : 'Bạn muốn xem mục nào? Bấm một nút bên dưới nhé 👇';
    return respond(lead ? `${lead}\n\n${where}` : where, withTree({ node: path.length ? path[path.length - 1].id : null, offered, aiChain: 0 }), { showList: true });
  };

  // Các nút kèm tin nhắn khi khách đang ở curPath; cuối nhánh thì dùng nút của mục cha để khách không bị kẹt
  const menuHere = () => {
    const own = menuOffered(tree, curPath, ts);
    return own.length || !curPath.length ? own : menuOffered(tree, curPath.slice(0, -1), ts);
  };

  const offerPayment = (payment, introRaw = '') => {
    const intro = packageImageUrl(introRaw, baseUrl);
    const qr = packageImageUrl(payment.qr, baseUrl);
    const offered = [...(payment.kind !== 'tree_bundle' && tree.bundle.on && amountVnd(tree.bundle.price) ? [bundleEntry(tree)] : []), NAV_CANCEL];
    return respond(treePaymentText(settings, tree, payment, name), withTree({ offered }, 'OFFERED', { payment, receipt: null }), { offerImages: [intro, qr].filter(Boolean) });
  };

  const paywall = async (target) => {
    if (state.stage === 'PENDING_CONFIRM') return showMenu(curPath, PENDING_TEXT);
    const reuse = target !== 'bundle' && state.stage === 'OFFERED' && state.payment?.nodeId === target.id ? state.payment
      : target === 'bundle' && state.stage === 'OFFERED' && state.payment?.kind === 'tree_bundle' ? state.payment : null;
    const payment = reuse || newTreePayment(settings, tree, target);
    if (!payment) {
      await notifyOwner(`⚠️ Khách …${String(psid).slice(-4)} chạm mục khóa «${target === 'bundle' ? tree.bundle.label : target.label}» nhưng chưa đủ giá hoặc tên người nhận (mục 💰 Thu phí). Hãy bổ sung.`);
      return showMenu(curPath, 'Mình đang chờ chủ shop bổ sung thông tin thanh toán cho mục này. Trong lúc chờ, bạn xem các mục khác giúp mình nhé.');
    }
    return offerPayment(payment, target === 'bundle' ? tree.bundle.intro_image : target.intro_image);
  };

  const openNode = async (entry, question = null) => {
    const { node, path } = entry;
    const block = blockedBy(path, ts);
    if (block) return paywall(block);
    const reading = !question && node.answer ? node.answer : await readNode({ settings, state, path, question, extraKeys, rawHistory });
    const chain = question ? (ts.aiChain || 0) + 1 : 0;
    const ai = node.children.length === 0 && node.ai_next && chain < MAX_AI_CHAIN ? await followUps({ extraKeys, path, text: reading }) : [];
    const offered = menuOffered(tree, path, ts, ai);
    return respond(reading, withTree({ node: node.id, offered, aiChain: chain }));
  };

  const recordReceipt = async (receipt) => {
    const payment = state.payment;
    const stage = receipt.matched || state.stage === 'PENDING_CONFIRM' ? 'PENDING_CONFIRM' : 'OFFERED';
    const reply = receipt.matched
      ? `Ảnh khớp tên người nhận và số tiền của mục «${payment.label}». Mình đang chờ chủ shop xác nhận tiền đã vào tài khoản nhé.`
      : `${receipt.note}. Bạn có thể gửi ảnh rõ hơn để mình kiểm tra lại nhé.`;
    await notifyOwner(`Khách ${ownerName} (…${String(psid).slice(-4)}), mục «${payment.label}» · ${payment.amount}. ${receipt.note}. Kiểm tra tiền thực nhận trong ngân hàng rồi bấm “Xác nhận đã nhận tiền”.`);
    const offered = menuHere();
    return respond(reply, withTree({ offered }, stage, { receipt }));
  };

  const claim = async () => {
    if (!state.payment) return showMenu(curPath, 'Mình chưa thấy đơn nào đang chờ thanh toán. Bạn bấm vào mục muốn xem nhé.');
    if (state.stage === 'PENDING_CONFIRM') return showMenu(curPath, PENDING_TEXT);
    await notifyOwner(`💰 Khách ${ownerName} (…${String(psid).slice(-4)}) báo đã chuyển khoản mục «${state.payment.label}» · ${state.payment.amount}. Kiểm tra ngân hàng rồi bấm “Xác nhận đã nhận tiền”.`);
    const offered = menuHere();
    return respond('Bạn gửi thêm ảnh giao dịch thành công để mình đối chiếu nhé. Chủ shop sẽ xác nhận tiền thực nhận.', withTree({ offered }, 'PENDING_CONFIRM'));
  };

  // ---------- ảnh ----------
  if (images.length) {
    if (!state.payment) return showMenu(curPath, 'Mình chưa thấy đơn nào đang chờ thanh toán. Bạn bấm vào mục muốn xem nhé.');
    const data = await readReceipt({ images, extraKeys });
    return recordReceipt(compareReceipt(data, state.payment));
  }
  if (!text) return showMenu(curPath);

  // ---------- khách bấm nút hoặc gõ đúng chữ trên nút ----------
  const tap = matchOffered(text, ts.offered);
  if (tap) {
    if (tap.id === '__home') return showMenu([]);
    if (tap.id === '__back') return showMenu(curPath.slice(0, -1));
    if (tap.id === '__cancel') {
      if (state.stage === 'PENDING_CONFIRM') return showMenu(curPath, PENDING_TEXT);
      return respond('Mình đã bỏ chọn mục đó. Bạn xem các mục khác nhé.', { ...withTree({ offered: menuHere(), node: here ? here.node.id : null }, 'TREE'), payment: null, receipt: null });
    }
    if (tap.id === '__bundle') return tree.bundle.on ? paywall('bundle') : showMenu(curPath);
    if (tap.id.startsWith('ai:')) return here ? openNode(here, tap.q) : showMenu([]);
    const target = findNode(tree, tap.id);
    if (target) return openNode(target);
  }

  if (PAID_CLAIM.test(text)) return claim();
  const t = norm(text);
  if (/^(menu|muc luc|ve dau|bat dau|xem tiep|tiep|tiep tuc)$/.test(t)) return showMenu([]);
  if (/^(cam on|cam on ban|ok|oke|vang|da|chao|hi|hello|xin chao)$/.test(t)) return showMenu(curPath, 'Cảm ơn bạn nhé 🌟');

  // gõ đúng tên một mục bất kỳ trong cây
  const exact = flatten(tree).find((x) => norm(x.node.label) === t);
  if (exact) return openNode(exact);

  // gõ câu khác: AI chọn mục phù hợp; mục khóa vẫn bị chặn bằng code
  // Khách hỏi một câu cụ thể thì AI trả lời đúng câu hỏi trong mục đó (không đọc lại bài của mục).
  // Khách đang ở đúng mục đó rồi mà còn gõ thêm thì luôn là câu hỏi tiếp, tránh gửi lại y bài cũ.
  const routed = await routeToNode({ tree, text, path: curPath, extraKeys });
  if (routed) return openNode(findNode(tree, routed.id), routed.ask || routed.id === here?.node.id ? text : null);

  // không thuộc mục nào: trả lời ngắn trong phạm vi mục đang xem, có giới hạn số lượt
  if ((ts.freeAnswers || 0) >= freeLimit(settings.free_answer_limit)) {
    return showMenu(curPath, 'Để mình trả lời đúng ý hơn, bạn bấm một mục bên dưới nhé.');
  }
  const locked = flatten(tree).filter(({ path }) => blockedBy(path, ts)).map(({ node }) => node.label);
  const scope = `\nGIỚI HẠN: khách đang ở mục «${curPath.map((n) => n.label).join(' › ') || 'tổng quan'}». Chỉ trả lời trong phạm vi này, 500–900 ký tự. Viết như nhắn tin tự nhiên, không ghi nhãn hay tên mục ở đầu hoặc cuối tin. Các chủ đề sau cần mở riêng, KHÔNG luận nội dung của chúng, mời khách bấm nút tương ứng: ${locked.length ? locked.join(', ') : '(không có)'}.`;
  const chart = generateLaSo(state.info);
  const answer = hideName(stripLabels(cleanForMessenger(await askGemini({
    system: lifetimePrompt(settings, chart, null, true, state.info.maritalStatus) + scope,
    history: mergeSameRole(rawHistory), userText: text, extraKeys, maxOutputTokens: 1200,
  }))).trim(), state.info?.fullName);
  if (!answer) throw new Error('AI chưa trả lời, chưa trừ lượt');
  const offered = menuHere();
  return respond(answer, withTree({ offered, freeAnswers: (ts.freeAnswers || 0) + 1 }));
}
