// Parse the shop's form directly; use the model for less structured replies.
import { askGemini } from './gemini.js';
import { buildExtractBirthInfoPrompt } from './prompt.js';
import { missingBirth } from './chat-pacing.js';
import { maritalAnswer } from './marital-status.js';

const fold = s => s.normalize('NFC').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const labels = {
  fullName:'ho va ten|ho ten|hoten|full name|ten cua (?:em|minh|toi)|ten',
  gender:'gioi tinh|gioitinh|gt',
  birthDate:'ngay(?:\\/thang\\/nam| thang nam)? sinh|ngaysinh|ns',
  birthHour:'gio sinh|giosinh|sinh luc',
  maritalStatus:'tinh trang hon nhan(?: hien tai)?|hon nhan|tthn',
};
const labelPattern = new RegExp('(?:^|(?<=[\\s,;|]))('+Object.values(labels).join('|')+')(?:\\s*\\([^()\\n]*\\))?\\s*[:：=]\\s*','g');
const plainLabel = /^(ho va ten|ho ten|gioi tinh|ngay sinh|gio sinh|tinh trang hon nhan|hon nhan)\s+(?:la\s+)?/;
const genders = new Map([['nu','nu'],['nam','nam'],['female','nu'],['male','nam']]);
const hours = ['Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi','Thân','Dậu','Tuất','Hợi'];
const invalidName = /^(?:ho ten|ho va ten|ten|chao|xin chao|cam on|bo qua|khong ro|chua ro|khong biet|khong co|chua co|null|unknown|undefined)$/;
export function nameValue(text) {
  if (typeof text !== 'string') return null;
  const value=text.trim().replace(/\s+/g,' ');
  return /^[\p{L}][\p{L} .’'-]{0,79}$/u.test(value) && !invalidName.test(fold(value)) ? value : null;
}
function dateValue(text) {
  const t=fold(String(text ?? ''));
  const iso=t.match(/\b(19\d{2}|20\d{2}|2100)[.\/-](\d{1,2})[.\/-](\d{1,2})\b/);
  const vn=t.match(/\b(\d{1,2})\s*(?:[.\/-]|thang)\s*(\d{1,2})\s*(?:[.\/-]|nam)\s*(19\d{2}|20\d{2}|2100)\b/);
  if (!iso && !vn) return null;
  const [y,m,d]=iso ? iso.slice(1) : [vn[3],vn[2],vn[1]];
  return [y,m.padStart(2,'0'),d.padStart(2,'0')].join('-');
}
function hourValue(text, allowBare=false) {
  const original=String(text ?? '').normalize('NFC').trim();
  const t=fold(original);
  const index=hours.findIndex(h=>original.toLowerCase()===h.toLowerCase() || new RegExp('(?:^|\\s)giờ\\s+'+h+'(?=$|[\\s.,;])','iu').test(original));
  if (index>=0 && (allowBare || /\bgio\b/.test(t))) return index===0?23:index*2;
  const clock=t.replace(/\bruoi\b/g,'30').replace(/(\d)(am|pm)\b/g,'$1 $2');
  const m=clock.match(/\b(\d{1,2})\s*(?:h|gio|:|g)\s*(\d{1,2})?(?:\s*(?:phut|p))?(?:\s*(sang|trua|chieu|toi|dem|am|pm))?\b/) ||
    clock.match(/\b(\d{1,2})\s+(sang|trua|chieu|toi|dem|am|pm)\b/) ||
    (allowBare && t.match(/^(\d{1,2})$/));
  if (!m) return null;
  let h=Number(m[1]);const period=m[3] || (/^\D+$/.test(m[2] || '') ? m[2] : '');
  if (h>23 || Number(m[2])>59 || (period && h>12)) return null;
  if (period && ['chieu','toi','pm'].includes(period) && h<12) h+=12;
  if (['am','sang','dem'].includes(period) && h===12) h=0;
  if (period==='dem' && h>=7 && h<=11) h+=12;
  return h;
}
function readValue(fields,key,value) {
  const t=fold(value).trim();
  if (key==='gender' && genders.has(t)) fields.gender=genders.get(t);
  if (key==='fullName' && nameValue(value)) fields.fullName=nameValue(value);
  if (key==='maritalStatus') {
    const status=maritalAnswer(value,{},true);
    if (status) fields.maritalStatus=status;
    else if (/[a-z]/.test(t) && !/^(?:chua dien|nhap tai day|null|vi du|vd)\b/.test(t)) fields.maritalProvided=true;
  }
  const hour=key==='birthHour'?hourValue(value,true):null;
  if (hour!==null) fields.birthHour=hour;
}

export function formFields(message, current={}) {
  const fields={};
  const lines=String(message || '').normalize('NFC').split(/\r?\n/).filter(line=>!/^\s*\(?(?:ví dụ|vi du|vd)\s*[:：]/iu.test(line)).join('\n').split(/[\n,;|]+/).map(s=>s.trim().replace(/^(?:[•*–-]|\d[.)])\s*/,'')).filter(Boolean);
  const candidates=[];
  let pendingLabel=null;
  for (const line of lines) {
    const t=fold(line);
    if (/^(?:\(?vi du\b|vd\s*:)/.test(t)) continue;
    const markers=[...t.matchAll(labelPattern)];
    // Work with the values only; copied labels often include examples and "âm hay dương lịch".
    const values=markers.map((m,i)=>({
      key:Object.keys(labels).find(k=>new RegExp('^(?:'+labels[k]+')$').test(m[1])),
      value:line.slice(m.index+m[0].length, markers[i+1]?.index).trim(),
    }));
    if (!markers.length) {
      const label=plainLabel.exec(t);
      if(label) {
        values.push({key:Object.keys(labels).find(k=>new RegExp('^(?:'+labels[k]+')$').test(label[1])),value:line.slice(label[0].length)});
      } else values.push({key:pendingLabel,value:line});
    }
    for (const {key,value} of values) {
      pendingLabel=null;
      if (!value) {pendingLabel=key;continue;}
      if (key) readValue(fields,key,value);
      const v=fold(value);
      if (!key || key==='birthDate' || key==='birthHour') {
        const date=dateValue(value);if(date) fields.birthDate=date;
        const hour=hourValue(value,key==='birthHour');if(hour!==null) fields.birthHour=hour;
        if (/\b(am lich|al|lich am)\b/.test(v) || v==='am' || (date && /(?:\d{4}|\d{1,2})\s*[(]?am\b/.test(v))) fields.isLunar=true;
        else if (/\b(duong lich|dl|lich duong)\b/.test(v) || v==='duong' || (date && /\d\s*[(]?duong\b/.test(v))) fields.isLunar=false;
        if (/\bnhuan\b/.test(v)) {fields.isLeapMonth=!/\bkhong nhuan\b/.test(v);fields.isLunar=true;}
      }
      if(!key) {
        if(genders.has(v)) fields.gender=genders.get(v);
        // Compact forms: a name and gender immediately before the numeric date.
        // Require two name words so "Nguyễn Nam" is not mistaken for "Nguyễn, nam".
        const heading=/^(.+?)\s+(nam|nu)\s+(?:(?:sinh|ngay)\s+)*(?=\d{1,4}[/.-])/.exec(v);
        if(heading) {
          const prefix=value.slice(0,heading[1].length).replace(/^(?:(?:mình|em|tôi) )?tên (?:là )?/iu,'');
          if(prefix.trim().split(/\s+/).length>=2 && nameValue(prefix)) {
            fields.fullName=prefix.trim();fields.gender=heading[2];
          }
        }
        const status=maritalAnswer(value,{},true);
        if(status) fields.maritalStatus=status;
        else if(dateValue(value)) {
          const tail=/(?:^|\s)((?:đã |đang )?(?:kết hôn|độc thân|ly hôn|ly thân|có người yêu)|chưa kết hôn)\s*$/iu.exec(value);
          if(tail)readValue(fields,'maritalStatus',tail[1]);
        }
        const prefix=/^(?:(?:minh|toi|em)\s+)?(?:ho (?:va )?ten|ten)\s+(?:la\s+)?/.exec(v);
        if(prefix) readValue(fields,'fullName',value.slice(prefix[0].length));
        else if(nameValue(value) && !status && !genders.has(v) && !/\b(sinh|lich|gio|chao|muon|xem|hoi|gui|minh|toi|khong|bo qua)\b/.test(v)) candidates.push(value);
      }
    }
  }
  if(!fields.fullName && candidates.length===1) {
    const value=candidates[0];
    if ((value.split(/\s+/).length>=2 && (fields.gender || fields.birthDate || /^(nguyen|tran|le|pham|phan|vu|vo|dang|bui|do|ho|ngo|duong|ly)\s/.test(fold(value)))) ||
        (missingBirth(current).length===1 && !current.fullName)) fields.fullName=value;
  }
  if(fields.birthHour==null && current.birthHour==null && missingBirth(current).length===1) {
    const hour=hourValue(message,true);if(hour!==null) fields.birthHour=hour;
  }
  const viewYear=fold(String(message)).match(/\b(?:nam (?:muon )?xem|xem (?:tu vi )?nam)\s*[:=]?\s*(20\d{2}|21\d{2}|2200)\b/);
  if(viewYear) fields.viewYear=Number(viewYear[1]);
  return fields;
}

function jsonObject(raw) {
  const text=String(raw || '').trim(), start=text.indexOf('{'), end=text.lastIndexOf('}');
  if(start<0 || end<start)return {};
  try {return JSON.parse(text.slice(start,end+1)) || {};} catch {return {};}
}

// Recover facts from customer messages in the current form only. Never parse
// the bot's examples or borrow details from a previously completed chart.
export function recoverBirth(previous, history=[]) {
  if (!missingBirth(previous).length) return previous;
  let start=-1;
  for(let i=history.length-1;i>=0;i--) {
    const row=history[i], text=fold(String(row.text || ''));
    if(row.role==='user' && /la so moi|nguoi khac|lap lai/.test(text)) break;
    if(row.role!=='bot') continue;
    if(/da lap (?:xong )?la so|ban muon minh luan theo goi nao/.test(text)) break;
    if(/ho (?:va )?ten/.test(text) && /gioi tinh/.test(text) && /gio sinh/.test(text) && !/bo sung|con thieu/.test(text)) {start=i;break;}
  }
  if(start<0)return previous;
  const facts={};
  for(const row of history.slice(start+1)) {
    if(row.role==='user') Object.assign(facts,formFields(row.text,facts));
  }
  const info={...previous};
  for(const [key,value] of Object.entries(facts)) if(info[key]==null || info[key]==='')info[key]=value;
  return info;
}

export async function collectBirth(message,previous={}, {askedMarital=false,extraKeys=[],history=[],extract=askGemini}={}) {
  previous=recoverBirth(previous,history);
  const local=formFields(message,previous);
  const info={...previous,...local};
  // Canonicalize old waiting profiles as well as newly extracted values.
  info.gender=genders.get(fold(String(info.gender ?? '')).trim()) || null;
  info.birthDate=dateValue(info.birthDate);
  info.birthHour=hourValue(info.birthHour,true);
  info.fullName=nameValue(info.fullName);
  if (local.isLunar===false) info.isLeapMonth=false;
  const shortStatus=maritalAnswer(message,{},askedMarital);
  if (shortStatus) info.maritalStatus=shortStatus;
  const parts=Object.keys(local).length;
  // A complete form can go straight to the chart. Ask the model about any
  // optional freeform relationship wording that local parsing didn't resolve.
  const needsModel=!shortStatus && (missingBirth(info).length>0 ||
    (!info.maritalStatus && !askedMarital && (local.maritalProvided || /(?:chồng|vợ|hẹn hò|yêu|kết hôn|ly hôn|gia đình)/iu.test(message))));
  if(!needsModel) return info;
  let ai;
  try {
    ai=jsonObject(await extract({system:'Bạn chỉ trả về JSON thuần túy, không markdown.',userText:buildExtractBirthInfoPrompt(message,info),extraKeys,temperature:0.1,task:'fast',maxOutputTokens:600}));
  } catch(error) {
    if(error.noFallback || (!parts && !Object.keys(previous).some(k=>previous[k]!=null && ['birthDate','birthHour','fullName','gender'].includes(k)))) throw error;
    return info;
  }
  const date=dateValue(ai.birthDate);
  if(!info.fullName && nameValue(ai.fullName)) info.fullName=nameValue(ai.fullName);
  if(!info.gender) info.gender=genders.get(fold(String(ai.gender ?? '')).trim()) || null;
  if(!info.birthDate && date) info.birthDate=date;
  if(info.birthHour==null) info.birthHour=hourValue(ai.birthHour,true);
  if (info.isLunar==null && typeof ai.isLunar==='boolean') info.isLunar=ai.isLunar;
  if (info.isLunar && info.isLeapMonth==null && ai.isLeapMonth===true) info.isLeapMonth=true;
  if (!local.maritalStatus) {
    const status=maritalAnswer(message,ai,askedMarital);if(status) info.maritalStatus=status;
  }
  return info;
}
