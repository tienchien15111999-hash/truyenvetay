import { ensureSchema, sql, deleteCustomer } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

// Rút gọn trạng thái tử vi của khách để hiện trên giao diện (không gửi cả dữ liệu ngày sinh ra ngoài)
function summarizeState(raw) {
  try {
    const st = raw ? JSON.parse(raw) : null;
    if (!st || st.status !== 'COMPLETED') return { hasChart: false, stage: null, paid: false };
    return { hasChart: true, stage: st.paid ? 'PAID' : st.stage || null, paid: Boolean(st.paid), annualPaid:Boolean(st.annualPaid), sales:st.flow==='YEAR_SALES', tree:Boolean(st.tree), treeUnlocked:(st.tree?.unlocked||[]).length + (st.tree?.bundle ? 1 : 0), orderId:st.payment?.id || null,
      packageLabel:st.payment?.label || null, amount:st.payment?.amount || null, receipt: st.receipt ? {matched:st.receipt.matched,note:st.receipt.note,checkedAt:st.receipt.checkedAt} : null };
  } catch {
    return { hasChart: false, stage: null, paid: false };
  }
}

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const q = sql();
  const params = new URL(req.url).searchParams;
  const psid = params.get('psid');
  const page = params.get('page');
  if (psid) {
    const messages = await q`SELECT role, text, created_at FROM (
      SELECT id, role, text, created_at FROM messages WHERE psid = ${psid}
      AND (${page}::text IS NULL OR page_id = ${page} OR page_id IS NULL) ORDER BY id DESC LIMIT 300
    ) recent ORDER BY id`;
    const prof = await q`SELECT face_summary, palm_summary, tuvi_summary, tuvi_state FROM profiles WHERE psid = ${psid}`;
    const conv = await q`SELECT c.page_id, c.psid, c.customer_bot_on, c.bot_revision, c.name, c.pic, p.name AS page_name FROM conversations c
                         LEFT JOIN pages p ON p.page_id = c.page_id WHERE c.psid = ${psid} AND (${page}::text IS NULL OR c.page_id = ${page}) LIMIT 1`;
    const profile = prof[0] ? { face_summary: prof[0].face_summary, palm_summary: prof[0].palm_summary, tuvi_summary: prof[0].tuvi_summary } : null;
    return Response.json({ messages, profile, customer: conv[0] || null, tuvi: summarizeState(prof[0] && prof[0].tuvi_state) });
  }
  const list = page
    ? await q`SELECT c.page_id, c.psid, c.customer_bot_on, c.bot_revision, c.name, c.pic, c.last_at, p.name AS page_name,
                (SELECT text FROM messages m WHERE m.psid = c.psid AND (m.page_id = c.page_id OR m.page_id IS NULL) ORDER BY m.id DESC LIMIT 1) AS last_text,
                (SELECT tuvi_state FROM profiles pr WHERE pr.psid = c.psid) AS tuvi_state
              FROM conversations c LEFT JOIN pages p ON p.page_id = c.page_id
              WHERE c.page_id = ${page} ORDER BY c.last_at DESC LIMIT 100`
    : await q`SELECT c.page_id, c.psid, c.customer_bot_on, c.bot_revision, c.name, c.pic, c.last_at, p.name AS page_name,
                (SELECT text FROM messages m WHERE m.psid = c.psid AND (m.page_id = c.page_id OR m.page_id IS NULL) ORDER BY m.id DESC LIMIT 1) AS last_text,
                (SELECT tuvi_state FROM profiles pr WHERE pr.psid = c.psid) AS tuvi_state
              FROM conversations c LEFT JOIN pages p ON p.page_id = c.page_id
              ORDER BY c.last_at DESC LIMIT 100`;
  return Response.json({
    list: list.map(({ tuvi_state, ...rest }) => ({ ...rest, tuvi: summarizeState(tuvi_state) })),
  });
}

export async function DELETE(req) {
  if (!isAdmin(req)) return denied();
  const psid = new URL(req.url).searchParams.get('psid');
  if (!psid) return Response.json({ error: 'Thiếu psid' }, { status: 400 });
  await deleteCustomer(psid);
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  if (!isAdmin(req)) return denied();
  const body = await req.json().catch(() => null);
  if (!body || typeof body.page_id !== 'string' || !body.page_id.trim() ||
      typeof body.psid !== 'string' || !body.psid.trim() || typeof body.enabled !== 'boolean') {
    return Response.json({error:'Thiếu Fanpage, khách hoặc trạng thái bot.'},{status:400});
  }
  await ensureSchema();
  const rows = await sql()`UPDATE conversations SET customer_bot_on = ${body.enabled},
    bot_changed_at = CASE WHEN customer_bot_on <> ${body.enabled} THEN clock_timestamp() ELSE bot_changed_at END,
    bot_revision = bot_revision + CASE WHEN customer_bot_on <> ${body.enabled} THEN 1 ELSE 0 END
    WHERE page_id = ${body.page_id} AND psid = ${body.psid}
    RETURNING page_id, psid, customer_bot_on, bot_revision`;
  if (!rows.length) return Response.json({error:'Không tìm thấy hội thoại này.'},{status:404});
  return Response.json({customer:rows[0]});
}
