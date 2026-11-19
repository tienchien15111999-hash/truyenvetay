import { after } from 'next/server';
import { lookupForm, acceptForm, FormError } from '../../../lib/birth-form.js';
import { finishBirthForm, deliverBirthForm } from '../../../lib/birth-form-delivery.js';

export const maxDuration = 240;
const json = (data,status = 200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req) {
  const data = await req.json().catch(() => null);
  if (!data || !['open','submit'].includes(data.action)) return json({error:'Yêu cầu mở phiếu không hợp lệ.'},400);
  try {
    if (data.action === 'open') {
      const {already} = await lookupForm(data.token);
      return json({received:Boolean(already)});
    }
    const job = await acceptForm(data.token,data.fields);
    if (job.already) return json({received:true});
    const origin = new URL(req.url).origin;
    if (job.preview) {
      try { return json({received:true,preview:true,...await finishBirthForm(job, origin)}); }
      catch { return json({received:true,preview:true,reply:'Phiếu đã lưu. Bạn nhắn “tiếp” trong mục Thử bot để thử lập lá số lại.'}); }
    }
    after(() => deliverBirthForm(job, origin));
    return json({received:true});
  } catch (error) {
    return error instanceof FormError ? json({error:error.message},error.status) :
      json({error:'Chưa kết nối được với phiếu. Bạn thử lại giúp mình nhé.'},503);
  }
}
