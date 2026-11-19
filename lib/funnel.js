// Luồng bán xem tử vi sau khi đã lập lá số.
// Giai đoạn (state.stage): ASK_SECTION -> FREE_DONE -> OFFERED -> PENDING_CONFIRM -> PAID
// Khách chưa trả phí chỉ được luận MỘT mục miễn phí. Các mục còn lại bị chặn bằng code, không phụ thuộc lời dặn của AI.
import { askGemini } from './gemini.js';
import { generateLaSo } from './tuvi.js';
import { saveTuViProfile, saveTurn } from './db.js';
import { mergeSameRole, cleanForMessenger } from './text.js';
import { buildSystemPrompt } from './prompt.js';
import { notifyOwner } from './alert.js';
import {
  SECTIONS, MSG, sectionByKey, fillTemplate,
  buildSectionPrompt, buildPaidConsultPrompt, buildRouterPrompt, CLASSIFY_IMAGE_PROMPT,
} from './tuviflow.js';

const PAID_CLAIM = /(đã chuyển|da chuyen|chuyển khoản rồi|chuyen khoan roi|đã ck|ck rồi|ck xong|chuyển rồi|chuyển xong|thanh toán rồi|đã thanh toán|đã gửi tiền)/i;

function parseJson(text) {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

async function classifyImage(images, extraKeys) {
  try {
    const raw = await askGemini({
      system: 'Bạn là bộ phân loại ảnh. Chỉ trả về một từ.',
      history: [],
      userText: CLASSIFY_IMAGE_PROMPT,
      images: images.slice(0, 1),
      extraKeys,
      temperature: 0,
      task: 'fast', maxOutputTokens: 8,
    });
    const w = String(raw).trim().toLowerCase();
    if (w.startsWith('bill')) return 'bill';
  } catch { /* coi như ảnh khác */ }
  return 'khac';
}

async function routeIntent(stage, userText, extraKeys) {
  try {
    const raw = await askGemini({
      system: 'Bạn chỉ trả về JSON thuần túy, không markdown.',
      history: [],
      userText: buildRouterPrompt(stage, userText),
      images: [],
      extraKeys,
      temperature: 0,
      task: 'fast', maxOutputTokens: 160,
    });
    const j = parseJson(raw) || {};
    const intent = ['pick_section', 'positive', 'ask_price', 'paid_claim', 'other'].includes(j.intent) ? j.intent : 'other';
    const sections = (Array.isArray(j.sections) ? j.sections : []).filter((k) => sectionByKey(k));
    return { intent, sections, difficulty: String(j.difficulty || '').slice(0, 200) };
  } catch {
    return { intent: 'other', sections: [], difficulty: '' };
  }
}

const done = (reply) => ({ reply, imageUrl: null, imageSentInProgress: false });

// Trả về kết quả { reply, ... } hoặc null nếu tin này không thuộc luồng bán hàng (để bot xử lý như bình thường)
export async function runFunnel(ctx) {
  const { psid, pageId, settings, state, userText, images, rawHistory, profile, extraKeys, openingNote } = ctx;
  const stage = state.paid ? 'PAID' : state.stage;
  const name = (state.info && state.info.fullName) || 'bạn';
  const who = `${name} (khách …${String(psid).slice(-4)})`;

  const saveState = (patch) => saveTuViProfile(psid, { ...state, ...patch });
  const respond = async (reply, patch, userSaved = userText, hadImage = false) => {
    await Promise.all([
      patch ? saveState(patch) : Promise.resolve(),
      saveTurn(psid, pageId, userSaved, hadImage, [openingNote, reply]),
    ]);
    return done(reply);
  };

  // Trả lời chung (hỏi ngoài luồng): chỉ dùng hồ sơ tóm tắt, KHÔNG đưa dữ liệu lá số
  const generalReply = async (suffix = '') => {
    const raw = await askGemini({
      system: buildSystemPrompt(settings, profile, state.info?.maritalStatus),
      history: mergeSameRole(rawHistory),
      userText,
      images: [],
      extraKeys,
    });
    const reply = cleanForMessenger(raw) + (suffix ? `\n\n${suffix}` : '');
    return respond(reply);
  };

  const claimPayment = async (hasImage) => {
    if (stage === 'PENDING_CONFIRM') return respond(MSG.pending, null, hasImage ? `[Khách gửi ảnh chuyển khoản] ${userText}`.trim() : userText, hasImage);
    await notifyOwner(`💰 ${who} báo đã chuyển khoản${hasImage ? ' (có gửi ảnh)' : ''}. Hãy kiểm tra tiền vào tài khoản rồi vào trang quản trị, mở hội thoại của khách và bấm "Xác nhận đã nhận tiền".`);
    return respond(MSG.pending, { stage: 'PENDING_CONFIRM' }, hasImage ? `[Khách gửi ảnh chuyển khoản] ${userText}`.trim() : userText, hasImage);
  };

  const offer = async () => {
    const payinfo = (settings.pay_info || '').trim();
    if (!payinfo) await notifyOwner(`⚠️ ${who} đang chờ thông tin chuyển khoản nhưng bạn chưa nhập "Thông tin chuyển khoản" (biểu tượng 💰). Hãy nhắn tay cho khách.`);
    const reply = fillTemplate(settings.offer_message, {
      name,
      amount: (settings.pay_amount || '').trim() || 'số tiền theo thỏa thuận',
      payinfo: payinfo || MSG.noPayInfo,
    });
    return respond(reply, { stage: 'OFFERED' });
  };

  const readSection = async (key, difficulty) => {
    const section = sectionByKey(key);
    const laSo = generateLaSo({
      fullName: state.info.fullName,
      gender: state.info.gender,
      birthDate: state.info.birthDate,
      birthHour: state.info.birthHour,
      isLunar: Boolean(state.info.isLunar),
      viewYear: state.info.viewYear || 2026,
    });
    const raw = await askGemini({
      system: buildSectionPrompt(settings, laSo, section, difficulty, state.info.maritalStatus),
      history: [],
      userText: `Hãy luận giải mục ${section.label} cho khách.`,
      images: [],
      extraKeys,
      maxOutputTokens: 1400,
    });
    const reply = cleanForMessenger(raw);
    return respond(reply, { stage: 'FREE_DONE', freeSection: key, sectionsRead: [...(state.sectionsRead || []), key] });
  };

  // ---------- ảnh ----------
  if (images.length > 0) {
    if (stage === 'PAID' || !stage) return null;
    const kind = await classifyImage(images, extraKeys);
    if (kind === 'bill') return claimPayment(true);
    return null; // ảnh mặt/tay/khác: để bot xử lý bình thường
  }

  // ---------- khách đã trả phí: luận mọi mục theo câu hỏi ----------
  if (stage === 'PAID') {
    const laSo = generateLaSo({
      fullName: state.info.fullName,
      gender: state.info.gender,
      birthDate: state.info.birthDate,
      birthHour: state.info.birthHour,
      isLunar: Boolean(state.info.isLunar),
      viewYear: state.info.viewYear || 2026,
    });
    const raw = await askGemini({
      system: buildPaidConsultPrompt(settings, laSo, profile, state.sectionsRead, state.info.maritalStatus),
      history: mergeSameRole(rawHistory),
      userText,
      images: [],
      extraKeys,
      maxOutputTokens: 1600,
    });
    return respond(cleanForMessenger(raw));
  }

  // ---------- khách chưa trả phí ----------
  let route;
  if (PAID_CLAIM.test(userText)) route = { intent: 'paid_claim', sections: [], difficulty: '' };
  else route = await routeIntent(stage, userText, extraKeys);

  if (route.intent === 'paid_claim' && ['OFFERED', 'PENDING_CONFIRM', 'FREE_DONE'].includes(stage)) return claimPayment(false);

  switch (stage) {
    case 'ASK_SECTION':
      if (route.intent === 'pick_section' && route.sections.length) return readSection(route.sections[0], route.difficulty);
      if (route.intent === 'other') return generalReply(MSG.reaskSection);
      return respond(MSG.reaskSection);

    case 'FREE_DONE':
      if (['positive', 'pick_section', 'ask_price'].includes(route.intent)) return offer();
      return generalReply();

    case 'OFFERED':
      if (route.intent === 'ask_price') return offer();
      if (['pick_section', 'positive'].includes(route.intent)) return respond(MSG.remindPay);
      return generalReply();

    case 'PENDING_CONFIRM':
      if (['pick_section', 'positive', 'ask_price', 'paid_claim'].includes(route.intent)) return respond(MSG.pending);
      return generalReply();

    default:
      return null;
  }
}
