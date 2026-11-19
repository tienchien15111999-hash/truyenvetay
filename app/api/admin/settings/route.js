import { getSettings, saveSettings } from '../../../../lib/db.js';
import { amountVnd } from '../../../../lib/receipt.js';
import { isAdmin, denied } from '../../../../lib/auth.js';
import { normalizeTree } from '../../../../lib/tree-data.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isAdmin(req)) return denied();
  return Response.json({ settings: await getSettings() });
}

export async function PUT(req) {
  if (!isAdmin(req)) return denied();
  const body = await req.json();
  const { paywall_on, ...settings } = body.settings || {};
  if ('annual_mode' in settings && !['free','paid'].includes(settings.annual_mode)) {
    return Response.json({error:'Chọn chế độ xem năm miễn phí hoặc thu phí cả hai gói.'},{status:400});
  }
  for (const [key,label] of [['annual_amount','gói năm'],['pay_amount','gói trọn đời']]) {
    if (settings[key] && !amountVnd(settings[key])) return Response.json({error:'Giá '+label+' cần là số tiền VND lớn hơn 0, ví dụ 99.000.'},{status:400});
  }
  if (typeof settings.tree_data === 'string' && settings.tree_data.trim()) {
    try { settings.tree_data = JSON.stringify(normalizeTree(JSON.parse(settings.tree_data))); }
    catch (e) { return Response.json({ error: e instanceof SyntaxError ? 'Cây chủ đề bị hỏng, bạn tải lại trang rồi sửa lại nhé.' : e.message }, { status: 400 }); }
  }
  if ('chart_delay_seconds' in settings) {
    const n = Number(String(settings.chart_delay_seconds).trim());
    if (String(settings.chart_delay_seconds).trim() === '' || !Number.isFinite(n) || n < 0 || n > 30) {
      return Response.json({ error: 'Số giây giả chat cần từ 0 đến 30.' }, { status: 400 });
    }
    settings.chart_delay_seconds = String(Math.round(n));
  }
  if (typeof settings.tree_bank_code === 'string') {
    settings.tree_bank_code = settings.tree_bank_code.trim();
    if (settings.tree_bank_code && !/^[A-Za-z0-9]{2,12}$/.test(settings.tree_bank_code)) {
      return Response.json({ error: 'Mã ngân hàng chỉ gồm chữ và số, ví dụ MB hoặc VCB.' }, { status: 400 });
    }
  }
  await saveSettings(settings);
  return Response.json({ ok: true });
}
