import { ensureSchema, sql } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  const logs = await sql()`SELECT id, level, text, created_at FROM logs ORDER BY id DESC LIMIT 100`;
  return Response.json({ logs });
}

export async function DELETE(req) {
  if (!isAdmin(req)) return denied();
  await ensureSchema();
  await sql()`DELETE FROM logs`;
  return Response.json({ ok: true });
}
