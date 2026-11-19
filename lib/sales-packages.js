import { randomBytes } from 'node:crypto';
import { amountVnd } from './receipt.js';
import { generateLaSo } from './tuvi.js';
import { askGemini } from './gemini.js';
import { lifetimePrompt } from './lifetime.js';
import { cleanForMessenger } from './text.js';

export function packageMenu(settings, year) {
  const price = amount => amountVnd(amount) ? ' · ' + amountVnd(amount).toLocaleString('vi-VN') + ' đ' : '';
  return [
    'Bạn muốn mình luận theo gói nào?',
    `1. Xem năm ${year}${price(settings.annual_amount)}`,
    `2. Xem trọn đời${price(settings.pay_amount)}`,
    'Bạn nhắn số 1, số 2 hoặc tên gói nhé.',
  ].join('\n');
}

export function normalizeChoice(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
}

export function packageChoice(text, year) {
  const t = normalizeChoice(text);
  if (/\?|\b(khong|chua|hay la|bao nhieu|gia sao)\b/.test(t)) return null;
  const lead = '(?:(?:da|vang|em|toi|minh|cho|xin|muon|lay|dang ky|chon|mua|xem|goi|so|co)[ ,]+)*';
  const end = '(?: (?:truoc|nhe|a|di))*$';
  if (new RegExp('^' + lead + '(?:1|nam(?: (?:sau|toi|sap toi|' + Number(year) + '))?|' + Number(year) + ')' + end).test(t)) return 'annual';
  if (new RegExp('^' + lead + '(?:2|tron doi|ca doi)' + end).test(t)) return 'lifetime';
  return null;
}

export function newPayment(settings, kind, year) {
  const amount = kind === 'annual' ? settings.annual_amount : settings.pay_amount;
  if (!amountVnd(amount) || !settings.receipt_recipient?.trim()) return null;
  const ref = (kind === 'annual' ? 'N' : 'TD') + randomBytes(5).toString('hex').toUpperCase();
  return {
    id: ref, kind, year, amount,
    label: kind === 'annual' ? `xem năm ${year}` : 'xem trọn đời',
    recipient: settings.receipt_recipient.trim(), account: settings.receipt_account?.trim() || '',
    receiptMatch:'name_amount',
    content: (settings.receipt_content?.trim() || 'TV {ref}').replaceAll('{ref}',ref),
    bankInfo: settings.pay_info || '',
    qr: kind === 'annual' ? settings.annual_qr_url : settings.qr_image_url,
  };
}

export async function annualReading(settings, info, extraKeys, question) {
  const chart = generateLaSo(info);
  const system = lifetimePrompt(settings, chart, {title:`Tổng quan năm ${info.viewYear}`}, false, info.maritalStatus) +
    `\nChỉ luận xu hướng trong năm ${info.viewYear}; ngoài phạm vi này thì nhắc khách chọn gói trọn đời. Chưa có sao lưu niên đầy đủ, không khẳng định sự kiện sẽ xảy ra.`;
  const text = cleanForMessenger(await askGemini({system, userText:question || 'Luận tổng quan năm xem theo lá số.', extraKeys,maxOutputTokens:1600}));
  if (!text.trim()) throw new Error('Chưa nhận được bài luận năm.');
  return text;
}
