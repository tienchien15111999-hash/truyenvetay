import { ensureSchema, sql } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

function mask(k) {
  return k.length > 10 ? `${k.slice(0, 4)}••••••${k.slice(-4)}` : '••••••';
}

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const rows = await sql()`SELECT id, api_key FROM ai_keys ORDER BY id`;
  const claude = await sql()`SELECT api_key FROM claude_keys WHERE id = 1`;
  const claudeMasked = claude[0] ? mask(claude[0].api_key) : null;
  const envCount = String(process.env.GEMINI_API_KEYS || '').split(',').filter((s) => s.trim()).length;
  return Response.json({ claudeMasked, claudeEnv: Boolean(process.env.ANTHROPIC_API_KEY?.trim()), keys: rows.map((r) => ({ id: r.id, masked: mask(r.api_key) })), envCount });
}

// Dán một hoặc nhiều key (mỗi dòng một key, hoặc cách nhau bằng dấu phẩy)
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const body = await req.json();
  if (body.provider === 'claude') {
    const key=String(body.text || '').trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return Response.json({error:'Ô Claude cần một Anthropic API key bắt đầu bằng sk-ant-.'},{status:400});
    await sql()`INSERT INTO claude_keys (id,api_key) VALUES (1,${key}) ON CONFLICT (id) DO UPDATE SET api_key = EXCLUDED.api_key`;
    return Response.json({ok:true,added:1,ignored:0});
  }
  if (body.provider && body.provider !== 'gemini') return Response.json({error:'Nhà cung cấp không hợp lệ'},{status:400});
  if (String(body.text || '').includes('sk-ant-')) return Response.json({error:'Đây là key Claude. Hãy nhập vào ô Claude dự phòng.'},{status:400});
  const found = String(body.text || '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 20);
  const q = sql();
  let added = 0;
  for (const key of [...new Set(found)]) {
    const r = await q`INSERT INTO ai_keys (api_key) VALUES (${key}) ON CONFLICT (api_key) DO NOTHING RETURNING id`;
    added += r.length;
  }
  return Response.json({ ok: true, added, ignored: found.length - added });
}

export async function DELETE(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  if (new URL(req.url).searchParams.get('provider') === 'claude') {
    await sql()`DELETE FROM claude_keys WHERE id = 1`;
    return Response.json({ok:true});
  }
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'Thiếu id' }, { status: 400 });
  await sql()`DELETE FROM ai_keys WHERE id = ${id}`;
  return Response.json({ ok: true });
}
