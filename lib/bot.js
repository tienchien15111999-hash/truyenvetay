import { collectBirth, formFields } from './birth-intake.js';
import { maritalAnswer, MARITAL_FORM_LINE, MARITAL_QUESTION } from './marital-status.js';
import { runYearSales } from './year-sales.js';
import { isLifetimeRequest, runLifetime, readLifetimePart } from './lifetime.js';
import { ensureSchema, getSettings, getProfile, getHistory, addMessage, saveTuViProfile, getAiKeys, saveTurn, pageTreeMode } from './db.js';
import { runTree, shouldRunTree } from './tree.js';
import { loadTree } from './tree-data.js';
export { saveTurn };
import { runFunnel } from './funnel.js';
import { looksLikeBirthInfo, fillTemplate } from './tuviflow.js';
import { buildSystemPrompt, buildTuViReadingPrompt } from './prompt.js';
import { askGemini } from './gemini.js';
import { mergeSameRole, parseProfileMarkers, cleanForMessenger } from './text.js';
import { generateLaSo } from './tuvi.js';

function isTuViTrigger(text) {
  const t = String(text || '').toLowerCase();
  return /(tử vi|tu vi|lá số|la so|lập lá số|xem hạn|xem vận hạn)/i.test(t);
}

// Kiểm tra nhanh xem tin nhắn chỉ mới là câu xin xem tử vi ngắn gọn (chưa kèm năm/ngày sinh)
function isShortTriggerWithoutDigits(text) {
  const t = String(text || '').trim();
  return t.length < 40 && !/\d{2,4}/.test(t);
}

export function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return '';
}

export async function respondWithMedia({ psid, pageId = null, text, images = [], onProgress = null, openingNote = null, requestOrigin = '', openingOnly = false, formReceipt = null, treeMode = null }) {
  await ensureSchema();
  const [settings, profile, rawHistory, extraKeys] = await Promise.all([
    getSettings(true),
    getProfile(psid),
    getHistory(psid, 16),
    getAiKeys(),
  ]);
  const userText = (text || '').trim();

  let tuviState = null;
  try {
    tuviState = profile.tuvi_state ? JSON.parse(profile.tuvi_state) : null;
  } catch {
    tuviState = null;
  }

  if (formReceipt && (tuviState?.status !== 'WAITING_INFO' || tuviState.formReceipt !== formReceipt)) return {reply:'',imageUrl:null};

  if (/(xem tướng|xem mặt|xem tay|chỉ tay|nhân tướng)/i.test(userText) && !isTuViTrigger(userText)) {
    const reply='Mình hiện chỉ hỗ trợ xem tử vi theo ngày giờ sinh, không xem tướng mặt hoặc chỉ tay. Bạn nhắn “xem tử vi” để bắt đầu nhé.';
    await saveTurn(psid,pageId,userText,images.length>0,[reply]);
    return {reply,imageUrl:null};
  }
  // Chế độ cây chủ đề (bật riêng cho từng Fanpage); lỗi đọc cài đặt thì dùng chế độ cũ
  const useTree = treeMode === null ? await pageTreeMode(pageId) : Boolean(treeMode);
  const tree = useTree ? loadTree(settings) : null;
  if (useTree && !openingOnly && shouldRunTree(tuviState)) {
    const treeResult = await runTree({psid,pageId,settings,profile,state:tuviState,tree,userText,images,extraKeys,rawHistory,baseUrl:getBaseUrl() || requestOrigin});
    if (treeResult) return treeResult;
  }
  const salesResult = await runYearSales({psid,pageId,openingOnly,settings,profile,state:tuviState,userText,images,extraKeys,rawHistory,baseUrl:getBaseUrl() || requestOrigin,treeMode:useTree,tree});
  if (salesResult) return salesResult;

  let inWaitingTuVi = tuviState && tuviState.status === 'WAITING_INFO';

  const shortMarital = maritalAnswer(userText, {}, inWaitingTuVi && tuviState.askedMarital);
  // Đang chờ thông tin sinh mà khách đổi ý (thôi, xem mặt, xem tay...) thì thoát khỏi luồng tử vi
  if (inWaitingTuVi && !shortMarital && images.length === 0 && /(thôi|huỷ|hủy|không xem|bỏ qua|để sau|xem mặt|xem tay|chỉ tay|xem tướng)/i.test(userText) && !/\d{4}/.test(userText)) {
    await saveTuViProfile(psid, { status: 'CANCELLED', info: tuviState.info || null });
    inWaitingTuVi = false;
  }

  // Lá số đã lập xong: câu hỏi có chữ "tử vi" được trả lời bình thường, chỉ lập lá số mới khi khách xin rõ ràng
  const alreadyDone = tuviState && tuviState.status === 'COMPLETED';
  const paywallOn = settings.paywall_on === '1';
  const explicitNew = /(lá số mới|lập lại|lập lá số|người khác|xem tử vi cho|xem cho)/i.test(userText);
  // Khách điền thẳng ngày giờ sinh (theo lời mời của shop) cũng bắt đầu lập lá số, miễn là chưa có lá số nào
  const sendsBirthInfo = !alreadyDone && (looksLikeBirthInfo(userText) || formFields(userText).birthDate || /(?:họ(?: và)? tên|giới tính|giờ sinh)\s*[:：]/iu.test(userText));
  const wantsNewTuVi = images.length === 0
    && ((isTuViTrigger(userText) && (!alreadyDone || explicitNew)) || sendsBirthInfo || (alreadyDone && explicitNew && looksLikeBirthInfo(userText)));

  if (alreadyDone && !wantsNewTuVi) {
    const lifetimeResult = await runLifetime({psid,pageId,settings,state:tuviState,userText,images,extraKeys,rawHistory,openingNote});
    if (lifetimeResult) return lifetimeResult;
  }

  // Luồng bán xem tử vi (xem thử 1 mục, mời chuyển khoản, xác nhận, xem hết): chỉ chạy khi đã có lá số
  if (paywallOn && alreadyDone && !wantsNewTuVi && (tuviState.stage || tuviState.paid)) {
    const funnelResult = await runFunnel({ psid, pageId, settings, state: tuviState, userText, images, rawHistory, profile, extraKeys, openingNote });
    if (funnelResult) return funnelResult;
  }

  if (images.length === 0 && (wantsNewTuVi || inWaitingTuVi)) {
    const lifetimeMode = isLifetimeRequest(userText) || (inWaitingTuVi && tuviState?.mode === 'LIFETIME');
    const emptyInfo = { fullName: null, gender: null, birthDate: null, birthHour: null, isLunar: false, viewYear: 2026 };
    const currentData = wantsNewTuVi && !inWaitingTuVi
      ? emptyInfo
      : (tuviState?.info || emptyInfo);

    // Tối ưu tốc độ: Nếu khách mới chỉ gõ "cho mình xem tử vi" (chưa có bất kỳ con số ngày/năm sinh nào)
    // thì phản hồi ngay lập tức không cần tốn 1 lần gọi Gemini trích xuất
    if (wantsNewTuVi && !inWaitingTuVi && !sendsBirthInfo && isShortTriggerWithoutDigits(userText)) {
      const quickAsk =
        `Chào bạn! Để lập lá số Tử Vi chuẩn xác và luận giải chi tiết, bạn vui lòng nhắn cho mình các thông tin sau nhé:\n` +
        `• Họ và tên\n` +
        `• Giới tính (Nam hoặc Nữ)\n` +
        `• Ngày, tháng, năm sinh (ghi rõ Dương lịch hay Âm lịch)\n` +
        `• Giờ sinh (ví dụ: 14h30 hoặc giờ Mùi)\n` +
        `${MARITAL_FORM_LINE}\n\n` +
        `(Ví dụ: Nguyễn Văn A, Nam, sinh 15/08/1995 Dương lịch, lúc 14h30)`;

      await Promise.all([
        saveTuViProfile(psid, { status: 'WAITING_INFO', mode: lifetimeMode ? 'LIFETIME' : undefined, info: emptyInfo }),
        saveTurn(psid, pageId, userText, false, [openingNote, quickAsk]),
      ]);
      return { reply: quickAsk, imageUrl: null, imageSentInProgress: false };
    }

    const parsed = await collectBirth(userText,currentData,{extraKeys,askedMarital:inWaitingTuVi && tuviState.askedMarital,history:inWaitingTuVi ? rawHistory : []});

    const missing = [];
    if (!parsed.fullName) missing.push('Họ và tên');
    if (!parsed.gender) missing.push('Giới tính (Nam hoặc Nữ)');
    if (!parsed.birthDate) missing.push('Ngày, tháng, năm sinh (ghi rõ Dương lịch hay Âm lịch)');
    if (parsed.birthHour === null || parsed.birthHour === undefined || Number.isNaN(parsed.birthHour)) {
      missing.push('Giờ sinh (ví dụ: 23h00 hoặc giờ Tý)');
    }

    if (missing.length > 0) {
      const askReply =
        `Để lập lá số Tử Vi chuẩn xác, bạn cho mình xin bổ sung thông tin còn thiếu sau nhé:\n` +
        missing.map((m) => `• ${m}`).join('\n') +
        `\n\n(Ví dụ: Nguyễn Văn A, Nam, sinh 15/08/1995 Dương lịch, lúc 14h30)`;

      await Promise.all([
        saveTuViProfile(psid, { status: 'WAITING_INFO', mode: lifetimeMode ? 'LIFETIME' : undefined, info: parsed }),
        saveTurn(psid, pageId, userText, false, [openingNote, askReply]),
      ]);
      return { reply: askReply, imageUrl: null, imageSentInProgress: false };
    }

    // Đủ 4 thông tin gốc -> Lập lá số ngay lập tức (<10ms)
    let laSoData;
    try {
      laSoData = generateLaSo({
        fullName: parsed.fullName,
        gender: parsed.gender,
        birthDate: parsed.birthDate,
        birthHour: parsed.birthHour,
        isLunar: Boolean(parsed.isLunar),
        isLeapMonth:Boolean(parsed.isLeapMonth),
        viewYear: parsed.viewYear || 2026,
      });
    } catch {
      const badReply = 'Mình chưa lập được lá số với ngày giờ này (có thể ngày không tồn tại hoặc ghi chưa rõ). Bạn kiểm tra và nhắn lại giúp mình ngày, tháng, năm sinh (ghi rõ Dương lịch hay Âm lịch) nhé.';
      await Promise.all([
        saveTuViProfile(psid, { status: 'WAITING_INFO', mode: lifetimeMode ? 'LIFETIME' : undefined, info: { ...parsed, birthDate: null } }),
        saveTurn(psid, pageId, userText, false, [openingNote, badReply]),
      ]);
      return { reply: badReply, imageUrl: null, imageSentInProgress: false };
    }

    if (!parsed.maritalStatus && !parsed.maritalProvided && !(inWaitingTuVi && tuviState.askedMarital)) {
      await saveTuViProfile(psid, {status:'WAITING_INFO', mode:lifetimeMode ? 'LIFETIME' : undefined, info:parsed, askedMarital:true});
      await saveTurn(psid,pageId,userText,false,[openingNote,MARITAL_QUESTION]);
      return {reply:MARITAL_QUESTION,imageUrl:null};
    }

    // Keep the validated form if the reading provider fails or times out.
    await saveTuViProfile(psid,{status:'WAITING_INFO', mode:lifetimeMode ? 'LIFETIME' : undefined,
      info:parsed,askedMarital:true});
    const baseUrl = getBaseUrl() || requestOrigin;
    let imageUrl = null;
    if (baseUrl) {
      const q = new URLSearchParams({
        name: parsed.fullName,
        gender: parsed.gender,
        date: parsed.birthDate,
        hour: String(parsed.birthHour),
        lunar: parsed.isLunar ? '1' : '0',
        leap: parsed.isLeapMonth ? '1' : '0',
        viewYear: String(parsed.viewYear || 2026),
      });
      imageUrl = `${baseUrl}/api/laso?${q.toString()}`;
    }

    // Gửi ngay câu thông báo + ảnh lá số cho khách trong lúc Gemini đang viết bài luận giải
    let imageSentInProgress = false;
    const progressTask = onProgress
      ? (async () => {
          await onProgress({
            statusText: fillTemplate(settings.chart_wait_message || '', { name: parsed.fullName }).trim() || `⏳ Đang an sao và lập lá số Tử Vi cho ${parsed.fullName}, bạn đợi mình vài giây nhé...`,
            imageUrl,
          });
          imageSentInProgress = Boolean(imageUrl);
        })()
      : Promise.resolve();

    const summary = `Đương số ${parsed.fullName} (${laSoData.thienBan.gender}), sinh ${laSoData.thienBan.solarDate} DL (${laSoData.thienBan.lunarDate} AL - ${laSoData.thienBan.chineseDate}), giờ ${laSoData.thienBan.time}, ${laSoData.thienBan.fiveElementsClass}, Chủ Mệnh ${laSoData.thienBan.soulStar}, Chủ Thân ${laSoData.thienBan.bodyStar}.`;
    let reply;
    let newState;

    if (lifetimeMode) {
      const initial = {status:'COMPLETED',info:parsed,mode:'LIFETIME',stage:paywallOn?'ASK_SECTION':undefined,paid:false,sectionsRead:[]};
      const [result] = await Promise.all([readLifetimePart({settings,state:initial,extraKeys}),progressTask]);
      reply=result.reply;
      newState=result.state;
      if (paywallOn) newState={...newState,stage:'FREE_DONE',freeSection:'tong_quan',sectionsRead:['tong_quan']};
    } else if (paywallOn) {
      // Bán hàng: chỉ gửi lá số rồi hỏi khách quan tâm mục nào (xem thử 1 mục miễn phí ở lượt sau)
      await progressTask;
      reply = fillTemplate(settings.ask_section_message, { name: parsed.fullName });
      newState = { status: 'COMPLETED', info: parsed, stage: 'ASK_SECTION', paid: false, sectionsRead: [] };
    } else {
      const [readingRaw] = await Promise.all([
        askGemini({
          system: buildTuViReadingPrompt(settings, laSoData, parsed.maritalStatus),
          history: [],
          userText: `Hãy luận giải chi tiết lá số Tử Vi cho ${parsed.fullName}.`,
          images: [],
          extraKeys,
        }),
        progressTask,
      ]);
      reply = cleanForMessenger(readingRaw) || 'Mình đã lập xong lá số nhưng chưa tải được lời luận, bạn nhắn lại giúp mình nhé.';
      newState = { status: 'COMPLETED', info: parsed };
    }

    await Promise.all([
      saveTuViProfile(psid, newState, summary),
      saveTurn(psid, pageId, userText, false, [openingNote, (imageUrl ? `[Đã lập lá số Tử Vi: ${imageUrl}]\n` : '') + reply]),
    ]);

    return { reply, imageUrl, imageSentInProgress };
  }

  if (images.length) {
    const reply='Mình không xem tướng mặt hoặc chỉ tay. Nếu muốn lập lá số, bạn gửi họ tên, giới tính, ngày sinh âm/dương lịch và giờ sinh bằng tin nhắn nhé. Ảnh thanh toán cần chủ shop kiểm tra xác nhận.';
    await saveTurn(psid,pageId,userText,true,[reply]);
    return {reply,imageUrl:null};
  }
  // Luồng Xem Tướng Mặt / Chỉ Tay & Hỏi đáp tiếp nối mặc định
  const history = mergeSameRole(rawHistory);
  const system = buildSystemPrompt(settings, profile, tuviState?.info?.maritalStatus);

  const raw = await askGemini({ system, history, userText, images, extraKeys });
  const { clean } = parseProfileMarkers(raw);
  const reply = clean || 'Mình chưa đọc được rõ, bạn gửi lại giúp mình nhé.';

  const saved = (images.length ? `[Khách gửi ${images.length} ảnh] ` : '') + userText;
  await Promise.all([
    saveTurn(psid, pageId, saved.trim(), images.length > 0, [openingNote, reply]),

  ]);
  return { reply, imageUrl: null, imageSentInProgress: false };
}

export async function respond(params) {
  const res = await respondWithMedia(params);
  return res.reply;
}
