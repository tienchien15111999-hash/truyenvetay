import { MARITAL_QUESTION } from './marital-status.js';
import { compareReceipt, readReceipt, paymentDetails } from './receipt.js';
import { TOPIC_MENU, selectTopic } from './lifetime.js';
import { missingBirth, missingBirthReply } from './chat-pacing.js';
import { askGemini } from './gemini.js';
import { generateLaSo } from './tuvi.js';
import { collectBirth, formFields } from './birth-intake.js';
import { lifetimePrompt, runLifetime } from './lifetime.js';
import { saveTuViProfile, saveTurn, updateTuViSnapshot, getSettings, getProfile } from './db.js';
import { cleanForMessenger, mergeSameRole } from './text.js';
import { annualReading, newPayment, packageMenu, packageChoice, normalizeChoice } from './sales-packages.js';
import { packageImageUrl } from './package-media.js';
import { notifyOwner } from './alert.js';
import { treeStart } from './tree.js';
export const freeLimit = value => /^\d+$/.test(String(value)) ? Math.min(50,Number(value)) : 3;
export const nextYear = () => Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric'}).format(new Date()))+1;
export const birthFormText = (settings, year=nextYear()) => settings.birth_form_message.replaceAll('{year}',String(year));
export async function runYearSales(ctx) {
 const {psid,pageId,settings,profile,userText,baseUrl,images=[],extraKeys=[],rawHistory=[]}=ctx;
 let state=ctx.state;
 let snapshot=profile.tuvi_state;
 let firstGreeting='';
 let firstImages=[];
 const storeState=async(next)=>{
   if(snapshot) {
     if(!await updateTuViSnapshot(psid,snapshot,next))return false;
   } else await saveTuViProfile(psid,next);
   snapshot=JSON.stringify(next);
   return true;
 };
 const annualPaidMode = settings.annual_mode === 'paid';
 if (state?.flow !== 'YEAR_SALES') {
   if (settings.year_sales_on !== '1') return null;
   if (state?.status === 'COMPLETED') {
     if (state.paid || (['OFFERED','PENDING_CONFIRM'].includes(state.stage) && !state.payment?.id)) return null;
     // A lifetime purchase already in progress keeps its confirmation path.
     state = {...state, info:{...state.info,viewYear:state.payment?.year || nextYear()}, flow:'YEAR_SALES', freeAnswers:state.freeAnswers || 0, stage:['OFFERED','PENDING_CONFIRM'].includes(state.stage) ? state.stage : 'CHOOSE_PACKAGE'};
   }
 }
 // Two batches can finish extracting in a different order. Merge only fields
 // that were not replaced by the newer turn, then re-evaluate completeness.
 async function onConflict(attempt) {
   if(ctx.state?.status==='WAITING_INFO' && attempt.info && (ctx.mergeAttempts || 0)<2) {
     const profile=await getProfile(psid);
     const latest=JSON.parse(profile.tuvi_state || 'null');
     if(latest?.status==='COMPLETED') return {reply:'',imageUrl:null};
     if(latest?.status==='WAITING_INFO' && latest.flow==='YEAR_SALES') {
       const info={...latest.info};
       for(const [key,value] of Object.entries(attempt.info)) {
         if(value!=null && (info[key]==null || info[key]===ctx.state.info?.[key]))info[key]=value;
       }
       return runYearSales({...ctx,profile,state:latest,intakeInfo:info,mergeAttempts:(ctx.mergeAttempts || 0)+1});
     }
   }
   return {reply:'Hồ sơ vừa được cập nhật. Bạn nhắn “tiếp” để mình xem tiếp nhé.',imageUrl:null};
 }
 const respond=async(reply,next=state,other={})=>{
   if(!await storeState(next))return onConflict(next);
   if(firstGreeting)reply=firstGreeting+'\n\n'+reply;
   if(firstImages.length)other={...other,offerImages:[...firstImages,...(other.offerImages||[])]};
   await saveTurn(psid,pageId,userText,images.length>0,[reply]);
   return {reply,imageUrl:null,...other};
 };
 const invite='Bạn có muốn xem tử vi trọn đời để hiểu sâu hơn về công việc, tài chính hoặc tình duyên không?';
 const menu=()=>packageMenu(settings,state.info.viewYear);
 const choose=()=>respond(menu(),{...state,stage:'CHOOSE_PACKAGE'});
 async function checkout(kind) {
   const payment=newPayment(settings,kind,state.info.viewYear);
   if (!payment) {
     await notifyOwner('Chưa đủ giá hoặc thông tin nhận tiền cho gói '+(kind==='annual'?'năm':'trọn đời')+'.');
     return respond('Mình đang chờ chủ shop bổ sung thông tin thanh toán cho gói này. Bạn nhắn lại sau giúp mình nhé.');
   }
   const qr = packageImageUrl(payment.qr,baseUrl);
   const urls = qr ? [qr] : [];
   return respond(paymentDetails(settings,payment),{...state,payment,receipt:null,stage:'OFFERED'},{offerImages:urls});
 }
 if(state?.status==='WAITING_INFO' && state.flow!=='YEAR_SALES'){
   state={...state,flow:'YEAR_SALES',freeAnswers:0,paid:false,info:{...state.info,viewYear:nextYear()}};
 }
 if(!state || state.flow!=='YEAR_SALES') {
   state={flow:'YEAR_SALES',status:'WAITING_INFO',info:{viewYear:nextYear()},paid:false,freeAnswers:0};
   let messages=[],ids=[];
   try{const v=JSON.parse(settings.opening_messages||'[]');if(Array.isArray(v))messages=v.filter(x=>typeof x==='string');}catch{}
   try{const v=JSON.parse(settings.opening_images||'[]');if(Array.isArray(v))ids=v.filter(x=>/^[a-f0-9]{16,64}$/.test(x));}catch{}
   const openingImages=[...(baseUrl?ids.map(id=>`${baseUrl}/api/media/${id}`):[]),packageImageUrl(settings.package_image_url,baseUrl)].filter(Boolean);
   const supplied=formFields(userText);
   const hasDetails=Object.keys(supplied).length>0;
   const invitation=annualPaidMode ? 'Mình sẽ gửi lá số để bạn chọn gói muốn xem nhé.' : `Mình mời bạn xem miễn phí năm ${state.info.viewYear} nhé!`;
   const greeting=[...messages,invitation].join('\n\n');
   const form=birthFormText(settings,state.info.viewYear);
   const intro=missingBirth(supplied).length ? greeting+'\n\n'+form : greeting;
   if(ctx.openingOnly || !hasDetails) return respond(intro,state,{offerImages:[...new Set(openingImages)]});
   firstGreeting=greeting;
   firstImages=[...new Set(openingImages)];
 }
 if(state.status==='WAITING_INFO') {
   const info=ctx.intakeInfo || await collectBirth(userText,state.info,{extraKeys,askedMarital:state.askedMarital,history:ctx.state?.status==='WAITING_INFO' ? rawHistory : []});
   info.viewYear=state.info.viewYear||nextYear();
   state={...state,info};
   if(missingBirth(info).length) return respond(missingBirthReply(info),undefined,{nudge:true});
   try{generateLaSo(info);}catch{return respond('Mình chưa lập được lá số với ngày sinh này. Bạn kiểm tra lại ngày/tháng/năm và cho biết là âm hay dương lịch nhé.',{...state,info:{...info,birthDate:null}});}
   if (!info.maritalStatus && !info.maritalProvided && !state.askedMarital) return respond(MARITAL_QUESTION,{...state,askedMarital:true});
   const query=new URLSearchParams({name:info.fullName,gender:info.gender,date:info.birthDate,hour:String(info.birthHour),lunar:info.isLunar?'1':'0',leap:info.isLeapMonth?'1':'0',viewYear:String(info.viewYear)});
   const image={imageUrl:baseUrl?`${baseUrl}/api/laso?${query}`:null};
   state={...state,status:'COMPLETED'};
   if (ctx.treeMode && ctx.tree) {
     // Chế độ cây chủ đề: gửi lá số rồi hiện các nút chủ đề, không luận năm hay hỏi gói
     const started=treeStart(ctx.tree,state);
     return respond(started.reply,started.next,{...image,quickReplies:started.quickReplies,showList:true});
   }
   if (annualPaidMode) return respond(menu(),{...state,stage:'CHOOSE_PACKAGE'},image);
   if(!await storeState({...state,status:'WAITING_INFO',askedMarital:true}))return onConflict(state);
   const text=await annualReading(settings,info,extraKeys);
   if ((await getSettings(true)).annual_mode==='paid') return respond(menu(),{...state,stage:'CHOOSE_PACKAGE'},image);
   return respond(text+'\n\n'+invite,{...state,stage:'ASK_LIFETIME'},image);
 }
 if(state.paid) {
   if(!state.firstTopic && !state.lifetime?.next){
     const topic=selectTopic(userText);
     if(!topic)return respond(TOPIC_MENU);
     state={...state,firstTopic:topic};
     return runLifetime({...ctx,saveSalesReply:respond,state:{...state,mode:'LIFETIME'},images:[],userText:'xem tiếp'});
   }
   if(images.length)return respond('Bạn nhắn câu hỏi bằng chữ để mình xem tiếp theo lá số nhé.');
   return runLifetime({...ctx,saveSalesReply:respond,state:{...state,mode:'LIFETIME'},userText:/^(bắt đầu|xem tiếp|tiếp tục)$/i.test(userText.trim())?'xem tiếp':userText});
 }
 const awaitingPayment=['OFFERED','PENDING_CONFIRM'].includes(state.stage);
 async function recordReceipt(payment,receipt) {
   const next={...state,payment,receipt,receiptOptions:null,stage:receipt.matched || state.stage==='PENDING_CONFIRM'?'PENDING_CONFIRM':'OFFERED'};
   const reply=receipt.matched
     ? `Ảnh khớp tên người nhận và số tiền của gói ${payment.label}. Mình đang chờ chủ shop xác nhận tiền đã vào tài khoản nhé.`
     : receipt.note+'. Bạn có thể gửi ảnh rõ hơn để mình kiểm tra lại nhé.';
   if (!await storeState(next)) return onConflict(next);
   await saveTurn(psid,pageId,userText,images.length>0,[reply]);
   await notifyOwner(`Khách ${state.info.fullName} (…${psid.slice(-4)}), gói ${payment.label} · ${payment.amount}. ${receipt.note}. Kiểm tra tiền thực nhận trong ngân hàng để mở gói.`);
   return {reply,imageUrl:null};
 }
 if (images.length && (!awaitingPayment || state.payment)) {
   const data=await readReceipt({images,extraKeys});
   if (awaitingPayment) return recordReceipt(state.payment,compareReceipt(data,state.payment));
   const kinds=annualPaidMode && !state.annualPaid ? ['annual','lifetime'] : ['lifetime'];
   const matches=kinds.map(kind=>newPayment(settings,kind,state.info.viewYear)).filter(Boolean)
     .map(payment=>({payment,receipt:compareReceipt(data,payment)})).filter(item=>item.receipt.matched);
   if(matches.length===1) return recordReceipt(matches[0].payment,matches[0].receipt);
   if(matches.length>1) return respond('Ảnh khớp tên người nhận. Hai gói có cùng số tiền, bạn nhắn “gói năm” hoặc “gói trọn đời” giúp mình nhé.',
     {...state,receiptOptions:matches});
   const note='Chưa đối chiếu được ảnh với tên người nhận và giá gói';
   return respond('Mình chưa đối chiếu được ảnh với tên người nhận và giá gói. Bạn cho mình biết gói đã chuyển hoặc gửi lại ảnh giao dịch rõ hơn nhé.',
     {...state,receiptOptions:null,receipt:{matched:false,note,checkedAt:new Date().toISOString()}});
 }
 if (state.receiptOptions?.length) {
   const kind=packageChoice(userText,state.info.viewYear);
   const match=state.receiptOptions.find(item=>item.payment.kind===kind);
   if(match) return recordReceipt(match.payment,match.receipt);
   return respond('Bạn đã chuyển cho gói năm hay gói trọn đời? Mình đã có ảnh giao dịch của bạn rồi nhé.');
 }
 if(['OFFERED','PENDING_CONFIRM'].includes(state.stage)) {
   const command=normalizeChoice(userText);
   if(state.annualPaid && /^(xem bai nam|xem lai bai nam)$/.test(command)){
     const report=state.annualReport || await annualReading(settings,state.info,extraKeys);
     return respond(report,{...state,annualReport:report});
   }
   if(state.stage==='OFFERED' && /^(chon lai|doi goi|chon lai goi|huy chon goi)$/.test(command)){
     const next={...state,payment:null,receipt:null};
     if(state.annualPaid) return respond('Bạn vẫn có thể xem bài năm. Khi muốn nâng gói, bạn nhắn “chọn gói trọn đời”.',{...next,stage:'ANNUAL_PAID'});
     if(annualPaidMode) return respond(menu(),{...next,stage:'CHOOSE_PACKAGE'});
     return respond(invite,{...next,stage:'ASK_LIFETIME'});
   }
   if(/đã chuyển|chuyển khoản rồi|đã ck|chuyển xong|đã thanh toán/i.test(userText)) {
     await notifyOwner(`Khách ${state.info.fullName} báo đã chuyển khoản. Vui lòng kiểm tra ngân hàng.`);
     return respond('Bạn gửi ảnh giao dịch thành công để mình đối chiếu nhé. Chủ shop sẽ xác nhận tiền thực nhận.',{...state,stage:'PENDING_CONFIRM'});
   }
   return respond(state.stage==='PENDING_CONFIRM'?'Mình đang chờ xác nhận tiền thực nhận. Bạn có thể gửi ảnh giao dịch để đối chiếu.':paymentDetails(settings,state.payment));
 }
 const choice=packageChoice(userText,state.info.viewYear);
 const normalized=normalizeChoice(userText);
 if (state.annualPaid) {
   if (choice==='lifetime') return checkout('lifetime');
   const replay=!state.annualReport || choice==='annual' || /^(xem lai|xem nam|xem bai nam|xem lai bai nam|bat dau|xem tiep)$/.test(normalized);
   const text = replay && state.annualReport ? state.annualReport :
     await annualReading(settings,state.info,extraKeys,replay ? null : userText);
   return respond(text+'\n\nBạn muốn xem thêm về năm này thì cứ hỏi mình. Để xem cả cuộc đời, bạn nhắn “chọn gói trọn đời” nhé.',
     replay ? {...state,annualReport:text} : state);
 }
 if (annualPaidMode) {
   if (choice) return checkout(choice);
   return choose();
 }
 if (state.stage==='CHOOSE_PACKAGE') {
   if(choice==='lifetime') return checkout('lifetime');
   const text=await annualReading(settings,state.info,extraKeys);
   if((await getSettings(true)).annual_mode==='paid')return choose();
   return respond(text+'\n\n'+invite,{...state,stage:'ASK_LIFETIME'});
 }
 const yes=/^(?:da |vang )?(co|ok|dong y|muon)(?: (?:a|nhe))?$/.test(normalized);
 if ((state.stage==='ASK_LIFETIME' && yes) || (choice==='lifetime' && normalized!=='2')) return checkout('lifetime');
 if(/^(không|khong|chưa|chua|để sau|thôi)[.! ]*$/i.test(userText.trim()))return respond('Được nhé, khi muốn xem trọn đời bạn cứ nhắn mình.',{...state,stage:'FREE_QA'});
 if(state.freeAnswers>=freeLimit(settings.free_answer_limit))return respond(invite,{...state,stage:'ASK_LIFETIME'});
 if(!userText || /^(cảm ơn|ok|chào|hi|hello)[.! ]*$/i.test(userText))return respond('Bạn muốn hỏi điều gì về lá số? Lời chào và cảm ơn không trừ lượt hỏi.');
 const chart=generateLaSo(state.info);
 const answer=await askGemini({system:lifetimePrompt(settings,chart,null,true,state.info.maritalStatus),history:mergeSameRole(rawHistory),userText,extraKeys,maxOutputTokens:1600});
 if(!answer.trim()) throw new Error('AI chưa trả lời, chưa trừ lượt');
 if ((await getSettings(true)).annual_mode==='paid') return choose();
 const count=(state.freeAnswers||0)+1, exhausted=count>=freeLimit(settings.free_answer_limit);
 return respond(cleanForMessenger(answer)+(exhausted?'\n\n'+invite:`\n\nCòn ${freeLimit(settings.free_answer_limit)-count} lượt hỏi miễn phí.`),{...state,freeAnswers:count,stage:exhausted?'ASK_LIFETIME':'FREE_QA'});
}
