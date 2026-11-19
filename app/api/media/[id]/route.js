import { getMedia } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

// Địa chỉ ảnh công khai (Facebook cần tải ảnh từ đây để gửi cho khách). Mã ảnh là chuỗi ngẫu nhiên khó đoán.
export async function GET(req, { params }) {
  const { id } = await params;
  if (!/^[a-f0-9]{16,64}$/.test(String(id))) return new Response('Not found', { status: 404 });
  const m = await getMedia(id);
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m.data_b64, 'base64'), {
    status: 200,
    headers: { 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=86400' },
  });
}
