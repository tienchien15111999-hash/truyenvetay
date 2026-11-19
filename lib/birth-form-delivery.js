import { respondWithMedia } from './bot.js';
import { withBotRun, requireActive, ConversationPaused } from './bot-run.js';
import { deliveryGuard, getPageTokenForPsid, addMessage, addLog, getSettings } from './db.js';
import { sendChatText, sendText, sendImage, sendChartWithWait } from './messenger.js';

export async function finishBirthForm(job, requestOrigin) {
  const {psid, pageId, formReceipt, revision, preview} = job;
  const run = {pageId, logsDeliveries:true,
    isActive:preview ? async () => true : deliveryGuard(pageId, psid, revision),
    onDelivered:m => addMessage(psid,'bot',m.text || '[Đã gửi ảnh]',Boolean(m.attachment),pageId)};
  return withBotRun(run, async () => {
    await requireActive();
    const account = preview ? null : await getPageTokenForPsid(psid,pageId);
    if (!preview && !account?.token) throw new Error('Thiếu mã Fanpage');
    const result = await respondWithMedia({psid, pageId:pageId || null, text:'Đã gửi phiếu.', requestOrigin, formReceipt});
    if (preview) {
      if (result.reply) await addMessage(psid,'bot',result.reply);
      return {reply:result.reply, imageUrl:result.imageUrl};
    }
    if (result.imageUrl) {
      // Khách vừa điền phiếu: báo đợi, giả chat khoảng 10 giây rồi mới gửi ảnh lá số
      const settings = await getSettings();
      const waitText = String(settings.chart_wait_message || '').replaceAll('{name}','bạn').trim() || null;
      await sendChartWithWait(account.token,psid,result.imageUrl,{settings,statusText:waitText});
    }
    const buttons = result.quickReplies?.length ? result.quickReplies : null;
    if (buttons) for (const url of result.offerImages || []) await sendImage(account.token,psid,url);
    await sendChatText(account.token,psid,result.reply,buttons,{list:Boolean(result.showList)});
    if (!buttons) for (const url of result.offerImages || []) await sendImage(account.token,psid,url);
  });
}

export async function deliverBirthForm(job, origin) {
  try { await finishBirthForm(job, origin); }
  catch (error) {
    if (error instanceof ConversationPaused) return;
    await addLog('error','Đã lưu phiếu lập lá số nhưng chưa gửi được kết quả cho khách …' + job.psid.slice(-4));
    const account = await getPageTokenForPsid(job.psid, job.pageId);
    if (account?.token) {
      const notice = 'Mình đã nhận được phiếu của bạn. Mình chưa gửi được kết quả, bạn nhắn “tiếp” để mình hỗ trợ nhé.';
      await withBotRun({isActive:deliveryGuard(job.pageId,job.psid,job.revision),
        onDelivered:() => addMessage(job.psid,'bot',notice,false,job.pageId)},
        () => sendText(account.token,job.psid,notice)).catch(() => {});
    }
  }
}
