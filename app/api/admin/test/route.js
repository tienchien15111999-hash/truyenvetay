import { respondWithMedia, saveTurn } from '../../../../lib/bot.js';
import { planOpening } from '../../../../lib/opening.js';
import { birthFormText } from '../../../../lib/year-sales.js';
import { ensureSchema, getProfile, getSettings } from '../../../../lib/db.js';
import { canFill, wantsForm, birthFormUrl } from '../../../../lib/birth-form.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';

// Thử bot ngay trong trang admin, không cần qua Messenger
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  const body = await req.json();
  const text = body.text || '';
  const images = body.image && body.image.data ? [{ mime: body.image.mime || 'image/jpeg', data: body.image.data }] : [];
  try {
    await ensureSchema();
    const base = new URL(req.url).origin;
    const settings = await getSettings(true);
    const invite = async (resend = false) => {
      if (settings.birth_form_web === '0') return null;
      const profile = await getProfile('admin-test');
      return canFill(JSON.parse(profile.tuvi_state || 'null'))
        ? birthFormUrl({psid:'admin-test',base,resend}) : null;
    };
    if (wantsForm(text)) {
      if (settings.birth_form_web==='0') {
        const profile=await getProfile('admin-test');
        const state=JSON.parse(profile.tuvi_state || 'null');
        if (canFill(state) && state) {
          const reply=birthFormText(settings,state.info?.viewYear);
          await saveTurn('admin-test',null,text,false,[reply]);
          return Response.json({reply});
        }
      }
      const formUrl = await invite(true);
      if (formUrl) return Response.json({formUrl});
    }
    // Chat thử mới (chưa có tin nào) thì cũng nhận câu mở đầu như khách mới
    const plan = await planOpening('admin-test', text, images.length);
    const opening = plan ? { images: plan.imageIds.map((id) => `/api/media/${id}`), messages: plan.messages } : null;
    if (plan && plan.skipAI) {
      await saveTurn('admin-test', null, text, images.length > 0, [plan.note]);
      return Response.json({ reply: null, imageUrl: null, opening, formUrl:await invite() });
    }
    const { reply, imageUrl, offerImages, quickReplies } = await respondWithMedia({
      psid: 'admin-test',
      treeMode: body.treeMode === true,
      requestOrigin:new URL(req.url).origin,
      text,
      images,
      openingNote: plan ? plan.note : null,
    });
    // Chuyển imageUrl thành đường dẫn tương đối để xem được cả trên localhost lẫn Vercel
    let localImageUrl = imageUrl;
    if (imageUrl && imageUrl.includes('/api/laso?')) {
      localImageUrl = '/api/laso?' + imageUrl.split('/api/laso?')[1];
    }
    return Response.json({ reply, imageUrl: localImageUrl, offerImages, quickReplies: (quickReplies || []).map((q) => q.title), opening, formUrl:imageUrl ? null : await invite() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
