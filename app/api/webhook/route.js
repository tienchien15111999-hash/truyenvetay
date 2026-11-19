import crypto from 'node:crypto';
import { after } from 'next/server';
import { addLog } from '../../../lib/db.js';
import { alertError } from '../../../lib/alert.js';
import { handleEvent } from '../../../lib/incoming.js';
import { ConversationPaused } from '../../../lib/bot-run.js';

export const maxDuration = 240;
export const dynamic = 'force-dynamic';

// Facebook gọi GET này một lần để xác nhận webhook
export async function GET(req) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.VERIFY_TOKEN) {
    await addLog('info', 'Facebook xác minh webhook: thành công');
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  await addLog('error', 'Facebook xác minh webhook nhưng mã Verify token không khớp với biến VERIFY_TOKEN');
  return new Response('Forbidden', { status: 403 });
}

function validSignature(raw, header) {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) return true; // không cài thì bỏ qua kiểm tra
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    await addLog('error', 'Facebook gửi tin nhưng chữ ký không khớp. Kiểm tra biến FB_APP_SECRET (phải đúng App Secret của ứng dụng Meta) hoặc xoá biến này trên Vercel.');
    return new Response('Bad signature', { status: 403 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }
  if (body.object !== 'page') {
    await addLog('info', `Nhận yêu cầu loại "${body.object}" (không phải Fanpage), bỏ qua`);
    return new Response('ok', { status: 200 });
  }

  // Trả lời Facebook ngay, xử lý tiếp ở phía sau
  after(async () => {
    const total = (body.entry || []).reduce((a, e) => a + (e.messaging || []).length, 0);
    await addLog('info', `Facebook gửi về ${total} sự kiện`);
    for (const entry of body.entry || []) {
      for (const ev of entry.messaging || []) {
        try {
          await handleEvent(ev, entry.id, new URL(req.url).origin);
        } catch (e) {
          if (!(e instanceof ConversationPaused)) await alertError('webhook', e);
        }
      }
    }
  });
  return new Response('EVENT_RECEIVED', { status: 200 });
}

