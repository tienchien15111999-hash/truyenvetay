import { ensureSchema, getSettings, getProfile, sql, addLog, addMessage, deliveryGuard } from './db.js';
import { respondWithMedia, saveTurn, getBaseUrl } from './bot.js';
import { planOpening, isGreetingOnly } from './opening.js';
import { sendText, sendChatText, sendImage, sendChartWithWait, sendBirthFormButton, typingOn, downloadImage, fetchProfile } from './messenger.js';
import { alertError } from './alert.js';
import { ConversationPaused, withBotRun, requireActive } from './bot-run.js';

import { birthFormText } from './year-sales.js';
import { nudgeDelayMs } from './chat-pacing.js';
import { birthFormUrl, canFill, wantsForm } from './birth-form.js';

const BURST_WAIT_MS = 1000; // gom tin liên tiếp trong 1 giây để phản hồi nhanh mà vẫn chống tách câu
const OPENING_GAP_MS = 500; // nghỉ giữa các tin mở đầu để Messenger giữ đúng thứ tự
const BUSY_MSG = 'Mình đang hơi bận một chút, bạn đợi giây lát rồi gửi lại giúp mình nhé 🙏';

function deliveryError(where, error) {
  if (error instanceof ConversationPaused) throw error;
  return alertError(where, error);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gửi câu mở đầu: các ảnh theo thứ tự đã chọn, rồi lần lượt các câu mở đầu
async function sendOpening(token, psid, plan) {
  const base = getBaseUrl();
  for (const id of plan.imageIds) {
    if (!base) {
      await alertError('câu mở đầu', new Error('Chưa có địa chỉ web (biến NEXT_PUBLIC_BASE_URL) nên không gửi được ảnh mở đầu'));
      break;
    }
    try {
      await typingOn(token, psid);
      await sendImage(token, psid, `${base}/api/media/${id}`);
      await sleep(OPENING_GAP_MS);
    } catch (e) {
      await deliveryError('gửi ảnh mở đầu', e);
    }
  }
  for (const m of plan.messages) {
    await typingOn(token, psid);
    await sleep(OPENING_GAP_MS);
    await sendText(token, psid, m);
  }
}

// Tìm mã truy cập của Fanpage: ưu tiên Page đã thêm trong trang quản trị, không có thì dùng biến PAGE_ACCESS_TOKEN
async function findPage(q, pageId) {
  const rows = await q`SELECT token, bot_on FROM pages WHERE page_id = ${pageId}`;
  if (rows.length) return { token: rows[0].token, botOn: rows[0].bot_on !== false };
  if (process.env.PAGE_ACCESS_TOKEN) return { token: process.env.PAGE_ACCESS_TOKEN, botOn: true };
  return null;
}

export async function handleEvent(ev, entryId, requestOrigin) {
  const msg = ev.message;
  if (!msg || !ev.sender || !ev.sender.id) return; // sự kiện đã đọc/đã nhận: bỏ qua
  if (msg.is_echo) {
    await addLog('info', 'Bỏ qua một tin do chính Fanpage gửi đi (nhắn bằng tư cách Fanpage thì bot không nhận). Hãy nhắn từ tài khoản Facebook cá nhân.');
    return;
  }
  const psid = ev.sender.id;
  const pageId = String((ev.recipient && ev.recipient.id) || entryId || 'unknown');
  const who = `khách …${String(psid).slice(-4)} → Fanpage ${pageId}`;

  await ensureSchema();
  const settings = await getSettings(true);
  if (settings.bot_on === '0') {
    await addLog('info', `Bỏ qua tin của ${who}: công tắc Bot đang TẮT ở đầu trang`);
    return;
  }

  const q = sql();
  const page = await findPage(q, pageId);
  if (!page) {
    await alertError('webhook', new Error(`Nhận được tin gửi tới Fanpage ${pageId} nhưng Fanpage này chưa được thêm nên bot không có mã để trả lời. Bấm "+ Thêm page" và dán mã Fanpage.`));
    return;
  }
  if (!page.botOn) {
    await addLog('info', `Bỏ qua tin của ${who}: bot của Fanpage này đang TẮT (xem nút + Thêm page)`);
    return;
  }
  const token = page.token;
  await addLog('info', `Nhận tin của ${who}: ${msg.text ? 'có chữ' : ''}${msg.text && (msg.attachments || []).length ? ' + ' : ''}${(msg.attachments || []).length ? 'có ảnh/tệp' : ''}`);

  const text = (msg.text || '').trim();
  const imageUrls = (msg.attachments || [])
    .filter((a) => a.type === 'image' && a.payload && a.payload.url && !a.payload.sticker_id)
    .map((a) => a.payload.url);

  // Snapshot the switch and admit this delivery in one transaction. Messages
  // arriving while paused are visible to staff but never enter a future batch.
  const unsupported = !text && !imageUrls.length;
  const displayText = text || (imageUrls.length ? '[Ảnh khách gửi]' : '[Tệp đính kèm]');
  const rows = await q`WITH customer AS (
      INSERT INTO conversations (page_id, psid, last_at) VALUES (${pageId}, ${psid}, now())
      ON CONFLICT (page_id, psid) DO UPDATE SET last_at = now()
      RETURNING name, customer_bot_on, bot_revision, bot_changed_at
    ), policy AS (
      SELECT customer.*, (customer_bot_on AND NOT COALESCE(
        to_timestamp(${Number.isFinite(ev.timestamp) ? ev.timestamp / 1000 : null}::double precision) < bot_changed_at, FALSE)) AS permitted
      FROM customer
    ), received AS (
      INSERT INTO inbox (page_id, psid, mid, text, image_urls, bot_revision, handled)
      SELECT ${pageId}, ${psid}, ${msg.mid || null}, ${text}, ${JSON.stringify(imageUrls)}, bot_revision,
             (NOT permitted OR ${unsupported}) FROM policy
      ON CONFLICT (mid) DO NOTHING RETURNING id
    ), logged AS (
      INSERT INTO messages (page_id, psid, role, text, had_image, inbox_id)
      SELECT ${pageId}, ${psid}, 'user', ${displayText}, ${imageUrls.length > 0}, id FROM received
    ) SELECT policy.*, received.id FROM policy CROSS JOIN received`;
  if (!rows.length || !rows[0].permitted) return;
  const {id:myId, bot_revision:revision, name} = rows[0];
  const run = {
    pageId, inboxId:myId, isActive:deliveryGuard(pageId,psid,revision),
    onDelivered:message => addMessage(psid,'bot',message.text || '[Đã gửi ảnh]',Boolean(message.attachment),pageId),
  };
  return withBotRun(run, async () => {
    await requireActive();
    if (unsupported) {
      await sendText(token, psid, 'Mình đọc được tin nhắn chữ và ảnh. Bạn nhắn thông tin sinh để mình lập lá số nhé.');
      return;
    }
    if (!name) {
      const prof = await fetchProfile(token, psid);
      if (prof && prof.name) {
        await q`UPDATE conversations SET name = ${prof.name}, pic = ${prof.pic} WHERE page_id = ${pageId} AND psid = ${psid}`;
      }
    }

    await requireActive();
    // Form is sent before the 30-second collection window. The original inbox
    // message remains unclaimed so any birth details in it are processed too.
    let collectBirth = false;
    const birthProfile = await getProfile(psid);
    let birthState = null;
    try { birthState=JSON.parse(birthProfile.tuvi_state || 'null'); } catch {}
    const offerForm = async (resend = false) => {
      if (settings.birth_form_web === '0') return;
      const url = await birthFormUrl({pageId, psid, revision, base:getBaseUrl() || requestOrigin, resend});
      if (url) await sendBirthFormButton(token, psid, url);
    };
    if (wantsForm(text) && canFill(birthState) && (birthState || settings.year_sales_on !== '1')) {
      await q`UPDATE inbox SET handled=TRUE WHERE id=${myId}`;
      if (settings.birth_form_web === '0') {
        await sendChatText(token,psid,birthFormText(settings,birthState?.info?.viewYear));
      } else await offerForm(true);
      return;
    }
    if (!birthState && settings.year_sales_on !== '1' && settings.opening_on !== '1' &&
        isGreetingOnly(text,imageUrls.length)) await offerForm();
    if(settings.year_sales_on==='1' && !birthState) {
      const owner = await q`UPDATE conversations SET birth_form_claimed=TRUE WHERE page_id=${pageId} AND psid=${psid} AND birth_form_claimed=FALSE RETURNING psid`;
      if(owner.length) {
        try {
          const first = await respondWithMedia({psid,pageId,text,images:[],requestOrigin,openingOnly:true});
          await sendChatText(token,psid,first.reply);
          await offerForm(true);
          for (const url of first.offerImages || []) {
            try { await sendImage(token,psid,url); } catch (e) { await deliveryError('gửi ảnh mở đầu',e); }
          }
        } catch(e) {
          await q`UPDATE conversations SET birth_form_claimed=FALSE WHERE page_id=${pageId} AND psid=${psid}`;
          throw e;
        }
      }
      collectBirth=true;
    } else collectBirth=birthState?.status==='WAITING_INFO';

    // bật "đang gõ", dọn tin cũ và chờ gom tin cùng lúc cho nhanh
    await Promise.all([
      typingOn(token, psid),
      q`DELETE FROM inbox WHERE created_at < now() - interval '2 days'`.catch(() => {}),
      sleep(collectBirth ? 30000 : BURST_WAIT_MS),
    ]);

    await requireActive();
    // nếu khách vừa gửi thêm tin mới thì để tin mới đó xử lý chung
    const newer = await q`SELECT 1 FROM inbox WHERE psid = ${psid} AND page_id = ${pageId} AND bot_revision = ${revision} AND handled = FALSE AND id > ${myId} LIMIT 1`;
    if (newer.length > 0) return;

    // nhận toàn bộ tin chưa xử lý của khách này (chỉ một luồng nhận được)
    const claimed = await q`UPDATE inbox SET handled = TRUE WHERE psid = ${psid} AND page_id = ${pageId} AND bot_revision = ${revision} AND handled = FALSE RETURNING text, image_urls, id`;
    if (claimed.length === 0) return;
    claimed.sort((a, b) => a.id - b.id);

    run.inboxId = claimed[0].id;
    const allText = claimed.map((r) => r.text).filter(Boolean).join('\n');
    const allUrls = claimed.flatMap((r) => { try { return JSON.parse(r.image_urls || '[]'); } catch { return []; } }).slice(0, 3);

    // tải song song tất cả ảnh khách gửi
    const [downloaded] = await Promise.all([
      Promise.all(allUrls.map((url) => downloadImage(url).catch(async (e) => { await alertError('tải ảnh', e); return null; }))),
      typingOn(token, psid),
    ]);
    const images = downloaded.filter(Boolean);
    if (allUrls.length > 0 && images.length === 0) {
      await sendText(token, psid, 'Mình chưa mở được ảnh bạn gửi, bạn gửi lại giúp mình nhé.');
      return;
    }

    // Khách mới: gửi câu mở đầu trước (ảnh rồi các câu mở đầu)
    let openingNote = null;
    try {
      const plan = await planOpening(psid, allText, images.length);
      if (plan) {
        await sendOpening(token, psid, plan);
        openingNote = plan.note;
        await addLog('info', `Đã gửi câu mở đầu cho ${who} (${plan.imageIds.length} ảnh, ${plan.messages.length} câu)`);
        if (plan.skipAI) {
          // khách chỉ chào ngắn: câu mở đầu đã đủ, không cần AI trả lời thêm
          if (canFill(birthState)) await offerForm();
          await saveTurn(psid, pageId, allText, images.length > 0, [openingNote]);
          await q`UPDATE conversations SET last_at = now() WHERE page_id = ${pageId} AND psid = ${psid}`;
          return;
        }
      }
    } catch (e) {
      await deliveryError('câu mở đầu', e);
    }

    let result;
    try {
      await requireActive();
      result = await respondWithMedia({
        psid,
        pageId,
        text: allText,
        requestOrigin,
        images,
        openingNote,
        // Tử vi: gửi ngay câu báo + ảnh lá số trong lúc AI đang viết bài luận giải
        onProgress: async ({ statusText, imageUrl }) => {
          if (statusText) await sendText(token, psid, statusText).catch((e) => { if (e instanceof ConversationPaused) throw e; });
          // Báo khách đợi rồi giả chat khoảng 10 giây (cài trong trang quản trị) trước khi gửi ảnh lá số
          if (imageUrl) {
            try { await sendChartWithWait(token, psid, imageUrl, { settings }); }
            catch (e) { await deliveryError('gửi ảnh lá số', e); }
            await typingOn(token, psid);
          }
        },
      });
    } catch (e) {
      if (e instanceof ConversationPaused) throw e;
      await alertError('trả lời', e);
      await sendText(token, psid, BUSY_MSG);
      return;
    }

    // Câu nhắc khách gửi thêm thông tin: chờ thêm cho khách có thời gian gõ. Khách nhắn thêm trong lúc chờ thì bỏ câu nhắc, để tin mới xử lý.
    if (result.nudge && nudgeDelayMs() > 0) {
      await sleep(nudgeDelayMs());
      await requireActive();
      const more = await q`SELECT 1 FROM inbox WHERE psid = ${psid} AND page_id = ${pageId} AND bot_revision = ${revision} AND handled = FALSE AND id > ${myId} LIMIT 1`;
      if (more.length > 0) return;
    }

    if (result.imageUrl && !result.imageSentInProgress) {
      // Có đủ thông tin: báo khách đợi, giả chat rồi mới gửi ảnh lá số
      const waitText = String(settings.chart_wait_message || '').replaceAll('{name}', 'bạn').trim() || null;
      try { await sendChartWithWait(token, psid, result.imageUrl, { settings, statusText: waitText }); } catch (e) { await deliveryError('gửi ảnh lá số', e); }
    }
    const buttons = result.quickReplies?.length ? result.quickReplies : null;
    const sendOfferImages = async () => {
      for (const url of result.offerImages || []) {
        try { await sendImage(token, psid, url); } catch(e) { await deliveryError('gửi ảnh gói/QR',e); }
      }
    };
    // Nút gợi ý chỉ hiện ở tin cuối cùng: có nút thì gửi ảnh (QR...) trước, tin chữ kèm nút gửi sau cùng
    if (buttons) await sendOfferImages();
    await sendChatText(token, psid, result.reply, buttons, { list: Boolean(result.showList) });
    if (!buttons) await sendOfferImages();
    if (settings.year_sales_on !== '1' && !result.imageUrl && canFill(birthState)) {
      const latest = await getProfile(psid);
      if (canFill(JSON.parse(latest.tuvi_state || 'null'))) await offerForm();
    }
    await addLog('info', `Đã trả lời ${who}`);
    await q`UPDATE conversations SET last_at = now() WHERE page_id = ${pageId} AND psid = ${psid}`;
  });
}
