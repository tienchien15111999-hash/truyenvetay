import { ensureSchema, sql } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';
import { getPageInfo, subscribePage, pagePic } from '../../../../lib/messenger.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const pages = await sql()`SELECT page_id, name, pic, bot_on, tree_mode FROM pages ORDER BY created_at`;
  return Response.json({ pages, envToken: Boolean(process.env.PAGE_ACCESS_TOKEN) });
}

// Thêm Fanpage bằng mã truy cập (Page Access Token)
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const body = await req.json();
  const token = String(body.token || '').trim();
  if (token.length < 30) return Response.json({ error: 'Mã truy cập chưa đúng, bạn dán lại toàn bộ mã nhé.' }, { status: 400 });
  let info;
  try {
    info = await getPageInfo(token);
  } catch (e) {
    if (e.code !== 'permission') return Response.json({ error: e.message }, { status: 400 });
    // Facebook không cho web tự đọc tên Fanpage: dùng mã số do người dùng nhập
    const pid = String(body.page_id || '').trim();
    if (!/^\d{5,}$/.test(pid)) {
      return Response.json({
        error: 'Facebook không cho web tự đọc tên Fanpage lúc này. Bạn nhập thêm Mã Fanpage (dãy số) ở ô bên dưới rồi bấm Thêm page lại.',
        need_page_id: true,
      }, { status: 400 });
    }
    info = { id: pid, name: String(body.name || '').trim() || `Fanpage ${pid.slice(-4)}`, pic: pagePic(pid) };
  }
  await sql()`INSERT INTO pages (page_id, name, pic, token) VALUES (${info.id}, ${info.name}, ${info.pic}, ${token})
              ON CONFLICT (page_id) DO UPDATE SET name = EXCLUDED.name, pic = EXCLUDED.pic, token = EXCLUDED.token`;
  const subscribed = await subscribePage(info.id, token);
  return Response.json({ ok: true, name: info.name, subscribed });
}

// Bật/tắt bot và chọn chế độ (cũ hoặc cây chủ đề) riêng cho từng Fanpage
export async function PATCH(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const body = await req.json();
  if (!body.page_id) return Response.json({ error: 'Thiếu page_id' }, { status: 400 });
  const id = String(body.page_id);
  if ('bot_on' in body) await sql()`UPDATE pages SET bot_on = ${Boolean(body.bot_on)} WHERE page_id = ${id}`;
  if ('tree_mode' in body) await sql()`UPDATE pages SET tree_mode = ${Boolean(body.tree_mode)} WHERE page_id = ${id}`;
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const id = new URL(req.url).searchParams.get('page_id');
  if (!id) return Response.json({ error: 'Thiếu page_id' }, { status: 400 });
  await sql()`DELETE FROM pages WHERE page_id = ${id}`;
  return Response.json({ ok: true });
}
