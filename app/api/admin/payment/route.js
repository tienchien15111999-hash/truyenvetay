import { ConversationPaused, withBotRun } from '../../../../lib/bot-run.js';
import { amountVnd } from '../../../../lib/receipt.js';
import { annualReading, newPayment } from '../../../../lib/sales-packages.js';
import { TOPIC_MENU } from '../../../../lib/lifetime.js';
import { ensureSchema, getSettings, getProfile, updateTuViSnapshot, getAiKeys, addMessage } from '../../../../lib/db.js';
import { sendText, sendChatText } from '../../../../lib/messenger.js';
import { confirmTree } from '../../../../lib/tree.js';
import { loadTree, toQuickReplies } from '../../../../lib/tree-data.js';
import { getPageTokenForPsid, deliveryGuard } from '../../../../lib/db.js';
import { fillTemplate } from '../../../../lib/tuviflow.js';
import { addLog } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

// Chủ shop xác nhận đã nhận tiền của khách (action: "confirm") hoặc thu hồi quyền xem (action: "revoke")
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const body = await req.json();
  const psid = String(body.psid || '');
  const action = body.action;
  if (!['confirm','revoke','grant'].includes(action)) return Response.json({error:'Thao tác không hợp lệ.'},{status:400});
  if (!psid) return Response.json({ error: 'Thiếu mã khách' }, { status: 400 });

  const profile = await getProfile(psid);
  let state = null;
  try { state = profile.tuvi_state ? JSON.parse(profile.tuvi_state) : null; } catch { state = null; }
  if (!state || state.status !== 'COMPLETED') {
    return Response.json({ error: 'Khách này chưa lập lá số Tử Vi nên chưa cần xác nhận thanh toán.' }, { status: 400 });
  }
  const name = (state.info && state.info.fullName) || 'bạn';

  const settings = await getSettings(true);
  const conflict = () => Response.json({error:'Gói của khách vừa thay đổi. Hãy tải lại hội thoại.'},{status:409});
  const pending = ['OFFERED','PENDING_CONFIRM'].includes(state.stage);

  // Chế độ cây chủ đề: mở đúng mục khách vừa trả (confirm), mở tất cả (grant) hoặc thu hồi (revoke)
  if (state.tree) {
    const tree = loadTree(settings);
    let treeAction;
    if (action === 'revoke') {
      if (!(state.tree.unlocked?.length || state.tree.bundle)) return conflict();
      treeAction = 'revoke';
    } else if (action === 'confirm') {
      if (!pending || !state.payment?.id || body.orderId !== state.payment.id) return conflict();
      treeAction = 'confirm';
    } else {
      if (body.kind !== 'tree_all' || state.tree.bundle) return conflict();
      treeAction = 'grant_all';
    }
    const result = confirmTree(tree, state, treeAction, settings);
    if (!await updateTuViSnapshot(psid, profile.tuvi_state, result.next)) return conflict();
    if (treeAction === 'revoke') {
      await addLog('info', `Đã thu hồi các mục đã mở của khách …${psid.slice(-4)}`);
      return Response.json({ ok: true, paid: false });
    }
    await addLog('info', `Đã xác nhận ${treeAction === 'grant_all' ? 'mở tất cả các mục' : 'mục «' + (state.payment?.label || '') + '»'} của ${name} (…${psid.slice(-4)})`);
    const treeFound = await getPageTokenForPsid(psid, body.page_id);
    const treeActive = treeFound?.pageId ? deliveryGuard(treeFound.pageId, psid, treeFound.revision) : async () => true;
    const treePaused = 'Đã lưu quyền xem. Bot đang tắt hoặc trạng thái đã thay đổi nên chưa gửi tin cho khách.';
    if (treeFound && !await treeActive()) return Response.json({ ok: true, paid: true, sent: false, note: treePaused });
    if (!treeFound) return Response.json({ ok: true, paid: true, sent: false, note: 'Chưa có mã Fanpage để nhắn cho khách.' });
    try {
      await withBotRun({ isActive: treeActive }, () => sendChatText(treeFound.token, psid, result.message, toQuickReplies(result.offered)));
      await addMessage(psid, 'bot', result.message, false, treeFound.pageId);
      return Response.json({ ok: true, paid: true, sent: true, note: '' });
    } catch (e) {
      if (e instanceof ConversationPaused) return Response.json({ ok: true, paid: true, sent: false, note: treePaused });
      await addLog('error', `Không gửi được tin báo đã nhận tiền: ${e.message}`);
      return Response.json({ ok: true, paid: true, sent: false, note: 'Không nhắn được cho khách (có thể đã quá 24 giờ kể từ tin nhắn cuối của khách). Bạn hãy nhắn tay cho khách.' });
    }
  }
  if (body.orderId && body.orderId !== state.payment?.id) return conflict();
  if (action === 'revoke') {
    if (!state.paid && !state.annualPaid) return conflict();
    const next = {...state,paid:false,annualPaid:false,annualReport:null,stage:'OFFERED'};
    if (!await updateTuViSnapshot(psid,profile.tuvi_state,next)) return conflict();
    await addLog('info', `Đã thu hồi quyền xem tiếp của khách …${psid.slice(-4)}`);
    return Response.json({ok:true,paid:false});
  }

  if (state.paid || (state.payment?.id && body.orderId !== state.payment.id)) return conflict();
  if (action === 'grant') {
    const kind=body.kind;
    if (!['annual','lifetime'].includes(kind) || pending ||
        (kind==='annual' && (state.annualPaid || settings.annual_mode!=='paid'))) return conflict();
    const manual = newPayment(settings,kind,state.info.viewYear);
    if (!manual) return Response.json({error:'Bạn nhập giá gói và tên người nhận trong mục Thu phí xem tử vi trước nhé.'},{status:400});
    if (amountVnd(body.expectedAmount)!==amountVnd(manual.amount)) return conflict();
    state={...state,flow:'YEAR_SALES',payment:manual,receipt:null,receiptOptions:null};
  } else if ((state.flow==='YEAR_SALES' || settings.year_sales_on==='1') && !pending) return conflict();
  const annual = state.payment?.kind === 'annual';
  const next = annual ? {...state,annualPaid:true,paid:false,stage:'ANNUAL_PAID'} : {...state,paid:true,stage:'PAID'};
  if (!await updateTuViSnapshot(psid,profile.tuvi_state,next)) return conflict();
  await addLog('info', `Đã xác nhận gói ${state.payment?.label || 'trọn đời'} của ${name} (…${psid.slice(-4)})`);
  const found = await getPageTokenForPsid(psid, body.page_id);
  const isActive = found?.pageId ? deliveryGuard(found.pageId,psid,found.revision) : async () => true;
  const pausedNote = 'Đã lưu quyền xem. Bot đang tắt hoặc trạng thái đã thay đổi nên chưa gửi tin cho khách.';
  if (found && !await isActive()) return Response.json({ok:true,paid:true,sent:false,note:pausedNote});
  let message;
  if (annual) {
    message = `Mình đã nhận thanh toán gói năm ${state.info.viewYear} của bạn.`;
    try {
      const report = await annualReading(settings,state.info,await getAiKeys());
      if (!await updateTuViSnapshot(psid,JSON.stringify(next),{...next,annualReport:report})) {
        return Response.json({ok:true,paid:true,sent:false,note:'Hội thoại vừa thay đổi. Kiểm tra trạng thái hiện tại trước khi gửi lại.'});
      }
      message += '\n\n'+report+'\n\nBạn có thể hỏi thêm về năm này hoặc nhắn “chọn gói trọn đời”.';
    } catch {
      message += ' Bạn nhắn “xem bài năm” để mình gửi bài nhé.';
    }
  } else {
    message = fillTemplate(settings.paid_ok_message,{name});
    if (state.flow==='YEAR_SALES' && !state.lifetime?.next) message += '\n\n'+TOPIC_MENU;
    else if (state.mode==='LIFETIME' || state.flow==='YEAR_SALES') message += '\n\nBạn nhắn “xem tiếp” để mình gửi phần tử vi trọn đời kế tiếp.';
  }
  let sent = false;
  let note = '';
  try {
    if (!found) {
      note = 'Chưa có mã Fanpage để nhắn cho khách.';
    } else {
      await withBotRun({isActive}, () => sendText(found.token, psid, message));
      await addMessage(psid, 'bot', message, false, found.pageId);
      sent = true;
    }
  } catch (e) {
    if (e instanceof ConversationPaused) return Response.json({ok:true,paid:true,sent:false,note:pausedNote});
    note = 'Không nhắn được cho khách (có thể đã quá 24 giờ kể từ tin nhắn cuối của khách). Bạn hãy nhắn tay cho khách.';
    await addLog('error', `Không gửi được tin báo đã nhận tiền: ${e.message}`);
  }
  return Response.json({ ok: true, paid: true, sent, note });
}
