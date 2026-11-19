import { maritalContext } from './marital-status.js';
import { TUVI_TEACHING_STYLE } from './tuvi-style.js';
import { generateLaSo } from './tuvi.js';
import { askGemini } from './gemini.js';
import { saveTuViProfile, saveTurn } from './db.js';
import { cleanForMessenger, mergeSameRole } from './text.js';
import { fillTemplate } from './tuviflow.js';

export const isLifetimeRequest = text => /(?:tử vi|tu vi|lá số|la so|xem).*(?:trọn đời|tron doi|cả đời|ca doi)|(?:trọn đời|tron doi).*(?:tử vi|tu vi)/i.test(text || '');
const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim().replace(/[.!?]+$/,'');
export function lifetimeCommand(text) {
  const t = normalized(text);
  if (/^(xem tiep|tiep|tiep tuc|phan tiep|doc tiep|bat dau|xem tron doi)$/.test(t)) return {kind:'next'};
  if (/^(dung|tam dung|dung lai|de sau|thoi|huy)$/.test(t)) return {kind:'pause'};
  if (/^(muc luc|cac phan|tien do)$/.test(t)) return {kind:'menu'};
  const m = t.match(/^(?:xem lai|doc lai) phan (\d+)$/);
  return m ? {kind:'replay',index:Number(m[1])-1} : {kind:'question'};
}

export function lifetimePlan(chart, firstTopic) {
  const parts = [
    ['overview','Tổng quan bản mệnh và Thân'],
    ['career','Công danh và sự nghiệp'],
    ['wealth','Tài chính và điền sản'],
    ['family','Tình duyên, gia đạo và con cái'],
    ['wellbeing','Sức khỏe, phúc phần và lối sống'],
    ['stages','Tiền vận, trung vận và hậu vận'],
  ].map(([key,title])=>({key,title}));
  const decades = Object.values(chart.palaces).filter(p=>Number(p.decadalStart)>0).sort((a,b)=>a.decadalStart-b.decadalStart);
  for (const p of decades) parts.push({key:`decade_${p.decadalStart}`,title:`Đại vận ${p.decadalStart}–${p.decadalEnd} tuổi`,decade:{start:p.decadalStart,end:p.decadalEnd,palace:p.name,branch:p.earthlyBranch}});
  parts.push({key:'closing',title:'Tổng kết và gợi ý thực tế'});
  const index=parts.findIndex(p=>p.key===firstTopic);
  if(index>0)parts.unshift(...parts.splice(index,1));
  return parts;
}

export function lifetimePrompt(settings, chart, part, question = false, maritalStatus) {
  return `${settings.persona}\n${TUVI_TEACHING_STYLE}\nLUẬN TỬ VI TRỌN ĐỜI\n${question ? 'Trả lời đúng câu hỏi của khách, không tự chuyển sang phần mới.' : `Chỉ luận phần: ${part.title}. Không viết các phần tiếp theo.`}
${part?.decade ? `Đại vận đang xét: ${JSON.stringify(part.decade)}. Phân biệt cung đại vận với cung Mệnh gốc.` : ''}
${maritalContext(maritalStatus)}
DỮ LIỆU LÁ SỐ DO CODE TÍNH:\n${JSON.stringify(chart)}
KIẾN THỨC BỔ SUNG CỦA CHỦ BOT:\n${settings.tuvi_knowledge || '(chưa có)'}
QUY TẮC:
- Chỉ dùng sao, cung, mốc tuổi có trong dữ liệu. Không tự an thêm sao hoặc gán sao lưu niên/đại vận chưa được tính.
- Đại vận: đây là nhận xét dựa trên cung hạn và sao gốc; dữ liệu chưa có lớp sao lưu riêng, không khẳng định sự kiện chính xác từng năm.
- Tiền/trung/hậu vận chỉ là cách chia giai đoạn để trình bày, không phải kết luận về tuổi thọ. Nêu rõ khoảng tuổi nếu dùng; liên hệ các đại vận đã có.
- Các đại vận ở tuổi cao là mốc trên bàn số, không dự đoán khách sống đến tuổi đó. Không dự báo tuổi chết, bệnh cụ thể, tai nạn, ly hôn hoặc làm giàu chắc chắn.
- Viết 1200–1800 ký tự, 2–4 đoạn ngắn, dễ đọc trên Messenger; dùng “mình/bạn”. Nêu căn cứ cung/sao và gợi ý thực tế, phân biệt diễn giải truyền thống với sự thật chắc chắn.
- Không hù dọa hay thúc ép chuyển tiền. Không chẩn đoán, không khuyên thuốc hoặc đầu tư theo lá số.
- Không tự báo khách đã trả tiền, không tự ghi tiến độ, không tự thêm tiêu đề “phần ...” hay lời mời “xem tiếp”; ứng dụng sẽ thêm.
- Nếu dữ liệu không đủ để trả lời, nói rõ giới hạn. Nếu khách đang khủng hoảng, ưu tiên hỗ trợ an toàn, không tiếp tục luận số.
- Kết bằng câu: ${settings.disclaimer}`;
}

export async function readLifetimePart({settings,state,extraKeys=[]}) {
  const chart = generateLaSo(state.info);
  const plan = lifetimePlan(chart,state.firstTopic);
  const progress = state.lifetime || {version:1,next:0,answers:{},paused:false};
  const index = progress.next || 0;
  if (index >= plan.length) return {reply:'Mình đã gửi đủ các phần tử vi trọn đời. Bạn có thể hỏi sâu một vấn đề hoặc nhắn “xem lại phần 1”.',state};
  const part = plan[index];
  const raw = await askGemini({system:lifetimePrompt(settings,chart,part,false,state.info.maritalStatus),history:[],userText:`Luận phần ${part.title}.`,extraKeys,maxOutputTokens:1800});
  const text = cleanForMessenger(raw).trim();
  if (!text) throw new Error('Chưa nhận được bài luận; tiến độ chưa thay đổi');
  const footer = index+1===plan.length ? 'Đã hoàn thành các phần. Bạn có thể hỏi thêm hoặc nhắn “xem lại phần 1”.' : 'Nhắn “xem tiếp” để đọc phần sau, “mục lục” để xem tiến độ hoặc “tạm dừng”.';
  const reply = `Phần ${index+1}/${plan.length}: ${part.title}\n\n${text}\n\n${footer}`;
  return {reply,state:{...state,mode:'LIFETIME',lifetime:{...progress,version:1,next:index+1,paused:false,completed:index+1===plan.length,answers:{...progress.answers,[part.key]:reply}}}};
}

export async function runLifetime(ctx) {
  const {psid,pageId,settings,state,userText,images=[],extraKeys=[],rawHistory=[],openingNote}=ctx;
  const requested = isLifetimeRequest(userText);
  if (images.length || (state.mode!=='LIFETIME' && !requested)) return null;
  let current = {...state,mode:'LIFETIME'};
  const cmd = requested && state.mode !== 'LIFETIME' ? {kind:'next'} : lifetimeCommand(userText);
  const replyAndSave = async(reply,next=current)=>{
    if (ctx.saveSalesReply) return ctx.saveSalesReply(reply, next);
    await saveTuViProfile(psid,next);
    await saveTurn(psid,pageId,userText,false,[openingNote,reply]);
    return {reply,imageUrl:null,imageSentInProgress:false};
  };
  const chart = generateLaSo(current.info);
  const plan = lifetimePlan(chart,state.firstTopic);
  if (cmd.kind==='pause') return replyAndSave('Mình đã tạm dừng. Khi muốn đọc tiếp, bạn nhắn “xem tiếp” nhé.',{...current,lifetime:{...current.lifetime,paused:true}});
  if (cmd.kind==='menu') return replyAndSave(plan.map((p,i)=>`${i+1}. ${p.title}${i<(current.lifetime?.next||0)?' ✓':''}`).join('\n')+'\n\nNhắn “xem tiếp” hoặc “xem lại phần N” (phần đã nhận).');
  if (cmd.kind==='replay') {
    const saved = current.lifetime?.answers?.[plan[cmd.index]?.key];
    return replyAndSave(saved || 'Phần này chưa được gửi hoặc không tồn tại. Nhắn “mục lục” để xem tiến độ.');
  }
  const gated = settings.paywall_on==='1' && !current.paid;
  const previewAllowed = gated && current.stage==='ASK_SECTION' && !current.freeSection && !(current.lifetime?.next>0);
  if (gated && !previewAllowed) {
    if (cmd.kind==='question') return null; // payment claims and questions remain with the existing funnel
    if (current.stage==='PENDING_CONFIRM') return replyAndSave('Mình đang chờ chủ shop xác nhận thanh toán. Sau khi xác nhận, bạn nhắn “xem tiếp” để đọc phần kế tiếp.');
    const offer=fillTemplate(settings.offer_message,{name:current.info.fullName,amount:settings.pay_amount||'số tiền theo thỏa thuận',payinfo:settings.pay_info||'(chủ shop chưa cấu hình thông tin chuyển khoản)'});
    return replyAndSave(offer,{...current,stage:'OFFERED'});
  }
  if (cmd.kind==='next') {
    const result=await readLifetimePart({settings,state:current,extraKeys});
    if (previewAllowed) result.state={...result.state,stage:'FREE_DONE',freeSection:'tong_quan',sectionsRead:[...(current.sectionsRead||[]),'tong_quan']};
    return replyAndSave(result.reply,result.state);
  }
  if (gated) return null;
  // Follow-up questions get the full chart but never advance the reading pointer.
  const text=await askGemini({system:lifetimePrompt(settings,chart,null,true,state.info.maritalStatus),history:mergeSameRole(rawHistory),userText,extraKeys,maxOutputTokens:1800});
  return replyAndSave(cleanForMessenger(text));
}

export const TOPIC_MENU='Bạn muốn xem mục nào trước?\n1. Tổng quan bản mệnh\n2. Công việc, sự nghiệp\n3. Tài chính, nhà đất\n4. Tình duyên, gia đình\n5. Sức khỏe, lối sống\n6. Các giai đoạn cuộc đời\nBạn chọn số hoặc nhắn tên mục nhé.';
export function selectTopic(text){
 const t=normalized(text), keys=['overview','career','wealth','family','wellbeing','stages'];
 if(/^[1-6]$/.test(t))return keys[Number(t)-1];
 return [/tong quan|ban menh/,/cong viec|su nghiep|cong danh/,/tai chinh|tien bac|nha dat/,/tinh duyen|gia dinh|hon nhan|gia dao/,/suc khoe|loi song/,/giai doan|tien van|hau van/].map((r,i)=>r.test(t)?keys[i]:null).find(Boolean)||null;
}
