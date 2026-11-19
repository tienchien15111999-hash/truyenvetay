import { splitText } from './text.js';
export function chatChunks(text) {
 // Keep paragraphs and sentence endings together where possible; never drop text.
 const paragraphs=String(text||'').trim().split(/\n\s*\n/).filter(Boolean);
 const chunks=[];
 for(const p of paragraphs) {
   for(const piece of splitText(p,650)) {
     if(chunks.length && chunks.at(-1).length+piece.length+2<=650) chunks[chunks.length-1]+='\n\n'+piece;
     else chunks.push(piece);
   }
 }
 return chunks;
}
export function missingBirth(info={}) {
 const missing=[];
 if(!info.fullName)missing.push('họ tên');
 if(!info.gender)missing.push('giới tính');
 if(!info.birthDate)missing.push('ngày, tháng, năm sinh (âm hay dương lịch)');
 if(info.birthHour===null||info.birthHour===undefined||info.birthHour==='')missing.push('giờ sinh');
 return missing;
}
export function missingBirthReply(info) {
 const missing=missingBirth(info);
 if(!missing.length)return '';
 if(missing.length===1)return `Mình còn thiếu ${missing[0]} thôi. Bạn nhắn thêm giúp mình nhé.`;
 return `Bạn gửi thêm ${missing.slice(0,-1).join(', ')} và ${missing.at(-1)} giúp mình nhé. Có đủ rồi mình sẽ lập lá số cho bạn.`;
}

// Thời gian "đang gõ" tương ứng độ dài tin: ~ BASE + số ký tự x MS_PER_CHAR, kẹp trong [MIN, MAX].
// Chỉnh bằng biến môi trường trên Vercel (không cần sửa code): CHAT_TYPING_MS_PER_CHAR (mặc định 30),
// CHAT_TYPING_MAX_MS (mặc định 9000). Đặt CHAT_PACING_OFF=1 để tắt hẳn (dùng khi chạy test).
export function typingDelayMs(text, { first = false } = {}) {
 if(process.env.CHAT_PACING_OFF==='1') return 0;
 const perChar=Number(process.env.CHAT_TYPING_MS_PER_CHAR)>=0&&process.env.CHAT_TYPING_MS_PER_CHAR!==undefined&&process.env.CHAT_TYPING_MS_PER_CHAR!==''?Number(process.env.CHAT_TYPING_MS_PER_CHAR):30;
 const max=Number(process.env.CHAT_TYPING_MAX_MS)>0?Number(process.env.CHAT_TYPING_MAX_MS):9000;
 const len=Array.from(String(text||'')).length;
 const ms=Math.min(max,Math.max(1200,600+len*perChar));
 // Tin đầu tiên: bot đã mất thời gian suy nghĩ rồi nên chỉ chờ thêm một chút
 return first?Math.min(ms,2500):ms;
}
// Danh sách dọc các lựa chọn (chỉ dùng ở màn hình chọn mục), để khách thấy hết mà không cần vuốt ngang các nút
export function optionsList(quickReplies) {
 const titles=(quickReplies||[]).map(q=>String(q.title||'').trim()).filter(Boolean);
 if(titles.length<2) return '';
 return titles.map((t,i)=>`${i+1}. ${t}`).join('\n');
}
// Số giây giả chat trước khi gửi ảnh lá số (cài trong trang quản trị). Mặc định 10, tối đa 30, 0 = gửi ngay.
export function chartDelayMs(settings = {}) {
 if(process.env.CHAT_PACING_OFF==='1') return 0;
 const raw=settings.chart_delay_seconds;
 const n=raw===undefined||raw===null||String(raw).trim()===''?10:Number(raw);
 if(!Number.isFinite(n)||n<0) return 10000;
 return Math.min(30,n)*1000;
}

// Câu nhắc khách gửi thêm thông tin sinh: chờ THÊM bấy nhiêu giây sau thời gian gom tin (30 giây), để khách có thời gian gõ.
// Mặc định thêm 60 giây (tổng khoảng 90 giây kể từ tin cuối của khách). Đổi bằng biến môi trường BIRTH_NUDGE_WAIT_SECONDS trên Vercel.
export function nudgeDelayMs() {
 if(process.env.CHAT_PACING_OFF==='1') return 0;
 const raw=process.env.BIRTH_NUDGE_WAIT_SECONDS;
 const n=raw===undefined||String(raw).trim()===''?60:Number(raw);
 if(!Number.isFinite(n)||n<0) return 60000;
 return Math.min(120,n)*1000;
}
