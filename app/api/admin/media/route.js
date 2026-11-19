import crypto from 'node:crypto';
import { listMedia, addMedia, deleteMedia, getSettings } from '../../../../lib/db.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 3 * 1024 * 1024; // mỗi ảnh tối đa 3 MB sau khi thu nhỏ

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  return Response.json({ media: await listMedia() });
}

// Tải một ảnh lên kho: { name, mime, data (base64) }
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  const body = await req.json();
  const mime = String(body.mime || '');
  const data = String(body.data || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime) || !data) {
    return Response.json({ error: 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.' }, { status: 400 });
  }
  const size = Math.floor((data.length * 3) / 4);
  if (size > MAX_BYTES) return Response.json({ error: 'Ảnh quá lớn (tối đa 3 MB).' }, { status: 400 });
  const id = crypto.randomBytes(12).toString('hex');
  await addMedia({ id, name: String(body.name || 'anh').slice(0, 100), mime, dataB64: data, size });
  return Response.json({ ok: true, id });
}

export async function DELETE(req) {
  if (!isAdmin(req)) return denied();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Thiếu id' }, { status: 400 });
  const settings=await getSettings(true);
  if (['package_image_url','annual_qr_url','qr_image_url'].some(key=>settings[key]?.endsWith('/api/media/'+id))) {
    return Response.json({error:'Ảnh đang dùng trong mục Thu phí xem tử vi. Bạn gỡ hoặc thay ảnh ở đó trước nhé.'},{status:409});
  }
  if (String(settings.tree_data || '').includes('/api/media/' + id)) {
    return Response.json({error:'Ảnh đang dùng làm mã QR trong cây chủ đề (🌳). Bạn gỡ hoặc thay ảnh ở đó trước nhé.'},{status:409});
  }
  await deleteMedia(id);
  return Response.json({ ok: true });
}
