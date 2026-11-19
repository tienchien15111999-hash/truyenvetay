import { askGemini } from '../../../../lib/gemini.js';
import { getAiKeys } from '../../../../lib/db.js';
import { fitTitle, TREE_LIMITS } from '../../../../lib/tree-data.js';
import { isAdmin, denied } from '../../../../lib/auth.js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Chủ shop bí ý: AI đề xuất các nút con (chữ trên nút + hướng dẫn cho AI khi trả lời). Chỉ là gợi ý, chủ shop tự sửa.
export async function POST(req) {
  if (!isAdmin(req)) return denied();
  const body = await req.json().catch(() => ({}));
  const path = (Array.isArray(body.path) ? body.path : []).map((x) => String(x).slice(0, 60)).slice(0, 6);
  const existing = (Array.isArray(body.existing) ? body.existing : []).map((x) => String(x).slice(0, 60)).slice(0, 20);
  const count = Math.min(6, Math.max(1, Number(body.count) || 4));
  const where = path.length ? `Nút cha: ${path.join(' › ')}.` : 'Đây là các nút gốc hiện ngay sau khi khách nhận lá số.';
  try {
    const raw = await askGemini({
      system: 'Bạn chỉ trả về JSON thuần túy, không markdown.',
      history: [],
      extraKeys: await getAiKeys(),
      temperature: 0.8,
      maxOutputTokens: 900,
      userText: `Chủ một Fanpage xem tử vi đang soạn các nút bấm gợi ý trong Messenger để khách bấm xem từng chủ đề của lá số.\n${where}\nCác nút đã có (đừng lặp lại): ${existing.length ? existing.join(', ') : '(chưa có)'}.\nHãy đề xuất ${count} nút ${path.length ? 'con' : 'gốc'}. Mỗi nút gồm:\n- "label": chữ trên nút, tối đa 18 ký tự, tiếng Việt, có thể bắt đầu bằng 1 emoji.\n- "prompt": một đến hai câu dặn AI nên luận gì khi khách bấm nút này (dựa trên cung, sao của lá số), không nhắc tiền, không dọa dẫm, không chẩn đoán bệnh.\nTrả về: {"items":[{"label":"...","prompt":"..."}]}`,
    });
    const m = String(raw).match(/\{[\s\S]*\}/);
    const items = (m ? JSON.parse(m[0]).items : [])
      .filter((x) => x && x.label)
      .slice(0, count)
      .map((x) => ({ label: fitTitle(String(x.label)), prompt: String(x.prompt || '').slice(0, TREE_LIMITS.prompt) }));
    if (!items.length) return Response.json({ error: 'AI chưa gợi ý được, bạn thử lại nhé.' }, { status: 502 });
    return Response.json({ items });
  } catch (e) {
    return Response.json({ error: 'Chưa gọi được AI: ' + e.message }, { status: 502 });
  }
}
