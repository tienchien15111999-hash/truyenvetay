import { currentRun, requireActive } from './bot-run.js';
import { chatChunks, typingDelayMs, optionsList, chartDelayMs } from './chat-pacing.js';
import { splitText } from './text.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

// Khách không được thấy icon/emoji trong tin bot gửi (kể cả ổ khóa trên nút, lời AI viết, câu mặc định).
// Muốn cho phép lại icon: đặt biến môi trường ALLOW_EMOJI=1 trên Vercel.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;
export function stripEmoji(text) {
  const raw = String(text ?? '');
  if (process.env.ALLOW_EMOJI === '1') return raw;
  const out = raw.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').trim();
  return out || raw;
}
function cleanPayload(payload) {
  const m = payload && payload.message;
  if (!m) return payload;
  const message = { ...m };
  if (typeof m.text === 'string') message.text = stripEmoji(m.text);
  if (Array.isArray(m.quick_replies)) message.quick_replies = m.quick_replies.map((q) => (q && typeof q.title === 'string' ? { ...q, title: stripEmoji(q.title) } : q));
  const t = m.attachment && m.attachment.payload;
  if (t && t.template_type === 'button') {
    message.attachment = { ...m.attachment, payload: { ...t, text: stripEmoji(t.text), buttons: (t.buttons || []).map((b) => (b && b.title ? { ...b, title: stripEmoji(b.title) } : b)) } };
  }
  return { ...payload, message };
}

async function post(token, rawPayload, historyMessage = null) {
  await requireActive();
  const payload = cleanPayload(rawPayload);
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Facebook gửi tin lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (payload.message) await currentRun()?.onDelivered?.(historyMessage || payload.message);
}

export async function typingOn(token, psid) {
  try {
    await post(token, { recipient: { id: psid }, sender_action: 'typing_on' });
  } catch { /* không quan trọng */ }
}

export async function sendText(token, psid, text) {
  for (const chunk of splitText(text, 1900)) {
    await post(token, { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: chunk } });
  }
}

export async function sendBirthFormButton(token, psid, url) {
  const title = 'Điền phiếu lập lá số';
  const record = {text:'[Nút điền phiếu lập lá số]'};
  const envelope = {recipient:{id:psid}, messaging_type:'RESPONSE'};
  try {
    await post(token, {...envelope, message:{attachment:{type:'template', payload:{
      template_type:'button', text:'Bạn bấm bên dưới để điền thông tin sinh nhé.',
      buttons:[{type:'web_url', title, url}],
    }}}}, record);
  } catch (error) {
    if (!error.message.startsWith('Facebook gửi tin lỗi 400')) throw error;
    await sendText(token, psid, 'Bạn nhắn ngay trong cuộc trò chuyện này giúp mình họ tên, giới tính, ngày sinh (âm hay dương lịch) và giờ sinh nhé. Tình trạng hôn nhân bạn có thể bỏ qua.');
  }
}

export async function sendImage(token, psid, imageUrl) {
  await post(token, {
    recipient: { id: psid },
    messaging_type: 'RESPONSE',
    message: { attachment: { type: 'image', payload: { url: imageUrl, is_reusable: true } } },
  });
}

// Tải ảnh khách gửi về, trả {mime, data(base64)}
export async function downloadImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('Ảnh quá lớn');
  let mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) mime = 'image/jpeg';
  return { mime, data: buf.toString('base64') };
}

// Lấy tên + ảnh đại diện của khách (không được thì bỏ qua)
export async function fetchProfile(token, psid) {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(psid)}?fields=name,profile_pic&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return { name: d.name || null, pic: d.profile_pic || null };
  } catch {
    return null;
  }
}

export function pagePic(id) {
  return `${GRAPH}/${id}/picture?type=square`;
}

// Kiểm tra mã truy cập là của Fanpage, trả {id, name, pic}
// Chỉ hỏi những trường không cần quyền đặc biệt (id, name), ảnh lấy từ địa chỉ ảnh công khai của Page.
export async function getPageInfo(token) {
  const res = await fetch(`${GRAPH}/me?fields=id,name&metadata=1&access_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(10000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (d.error && d.error.message) || `lỗi ${res.status}`;
    if (/session|token|expired|invalid|malformed/i.test(m) && !/permission/i.test(m)) {
      throw new Error('Mã không đúng hoặc đã hết hạn. Hãy tạo mã mới rồi dán lại.');
    }
    const err = new Error('Facebook báo lỗi: ' + m);
    // thiếu quyền đọc thông tin Fanpage: web sẽ xin người dùng nhập mã số Fanpage
    if (/permission|reviewable|pages_read_engagement|Public (Content|Metadata) Access|does not exist/i.test(m)) err.code = 'permission';
    throw err;
  }
  const type = d.metadata && d.metadata.type;
  if (type && type !== 'page') {
    throw new Error('Đây không phải mã của Fanpage. Hãy dùng mã tạo ở mục "Tạo mã truy cập" sau khi bấm Kết nối Fanpage.');
  }
  if (!d.id) throw new Error('Không đọc được thông tin Fanpage từ mã này.');
  return { id: d.id, name: d.name || `Fanpage ${d.id}`, pic: pagePic(d.id) };
}

// Đăng ký Fanpage nhận tin nhắn gửi về webhook (cố gắng làm, không bắt buộc)
export async function subscribePage(pageId, token) {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ subscribed_fields: 'messages', access_token: token }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendChatText(token, psid, text, quickReplies = null, { list = false } = {}) {
 const chunks=chatChunks(text);
 // Chỉ ở màn hình chọn mục mới liệt kê các lựa chọn thành từng dòng (nút ngang phải vuốt mới thấy hết).
 // Sau mỗi câu trả lời thường thì không thêm gì, cho giống người nhắn thật.
 const listText=list && quickReplies?.length ? optionsList(quickReplies) : '';
 if(listText && chunks.length) chunks[chunks.length-1]+='\n\n'+listText;
 for(let i=0;i<chunks.length;i++) {
   // Hiện "đang gõ" rồi chờ theo độ dài tin sắp gửi, giống người thật gõ
   const wait=typingDelayMs(chunks[i],{first:i===0});
   if(wait>0 || i>0) { await typingOn(token,psid); await new Promise(resolve=>setTimeout(resolve,wait)); }
   const message={text:chunks[i]};
   // Nút gợi ý chỉ hiện ở tin cuối cùng khách thấy, nên gắn vào đoạn cuối
   if(quickReplies?.length && i===chunks.length-1) message.quick_replies=quickReplies;
   await post(token,{recipient:{id:psid},messaging_type:'RESPONSE',message});
 }
}

// Gửi lá số kiểu người thật: báo khách đợi, hiện "đang gõ" khoảng N giây (cài trong trang quản trị), rồi mới gửi ảnh.
// statusText = null thì không gửi câu báo (đã gửi trước đó).
export async function sendChartWithWait(token, psid, imageUrl, { settings = {}, statusText = null } = {}) {
 if(!imageUrl) return;
 const total=chartDelayMs(settings);
 if(statusText) await sendText(token,psid,statusText);
 let left=total;
 // "đang gõ" của Messenger tắt sau khoảng 20 giây, nên nhắc lại mỗi 8 giây
 while(left>0) {
   await typingOn(token,psid);
   const step=Math.min(left,8000);
   await new Promise(resolve=>setTimeout(resolve,step));
   left-=step;
 }
 await sendImage(token,psid,imageUrl);
}
