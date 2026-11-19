import { randomBytes, randomUUID } from 'node:crypto';
import { sql, ensureSchema, getSettings } from './db.js';
import { nameValue } from './birth-intake.js';
import { statuses } from './marital-status.js';
import { generateLaSo } from './tuvi.js';
import { normalizeChoice } from './sales-packages.js';
import { nextYear } from './year-sales.js';

export class FormError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const canFill = state => !state || state.status === 'WAITING_INFO';
const preview = ticket => ticket.page_id === '' && ticket.psid === 'admin-test';
const unavailable = () => new FormError(410, 'Phiếu này đã hết hiệu lực. Bạn nhắn “xin phiếu” trong hội thoại để nhận phiếu mới nhé.');
export const wantsForm = text => /^(?:cho (?:minh|em) |ban )?(?:xin|mo|dien|gui(?: lai)?) phieu(?: lap la so)?(?: nhe| a)?$/.test(normalizeChoice(text));

// Reuse an outstanding invitation. Only the worker that creates it sends the first button.
export async function birthFormUrl({pageId = '', psid, revision = 0, base, resend = false}) {
  if (!base || (!pageId && psid !== 'admin-test')) return null;
  const candidate = randomBytes(32).toString('hex');
  const q = sql();
  const created = await q`INSERT INTO birth_form_links (page_id, psid, revision, token, expires_at)
    VALUES (${pageId}, ${psid}, ${revision}, ${candidate}, now() + interval '12 hours')
    ON CONFLICT (page_id, psid) DO UPDATE SET token=excluded.token, revision=excluded.revision,
      expires_at=excluded.expires_at, used_at=NULL
    WHERE birth_form_links.expires_at <= now() OR birth_form_links.revision < excluded.revision
    RETURNING token`;
  let token = created[0]?.token;
  if (!token && resend) {
    const active = await q`SELECT token FROM birth_form_links WHERE page_id=${pageId} AND psid=${psid}
      AND revision=${revision} AND expires_at > now() AND used_at IS NULL`;
    token = active[0]?.token;
  }
  return token ? new URL('/phieu-lap-la-so#' + token, base).href : null;
}

export function readBirthFields(fields, viewYear, today = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Ho_Chi_Minh' }).format(new Date())) {
  if (!fields || typeof fields !== 'object') throw new FormError(422, 'Bạn kiểm tra lại các mục trên phiếu nhé.');
  const fullName = nameValue(typeof fields.fullName === 'string' ? fields.fullName.normalize('NFC') : null);
  if (!fullName) throw new FormError(422, 'Bạn điền họ tên của người cần lập lá số (tối đa 80 ký tự) nhé.');
  if (!['nam','nu'].includes(fields.gender)) throw new FormError(422, 'Bạn chọn giới tính để lập lá số nhé.');
  if (!['solar','lunar'].includes(fields.calendar)) throw new FormError(422, 'Bạn chọn âm lịch hoặc dương lịch nhé.');
  if (typeof fields.birthDate !== 'string' || typeof fields.birthTime !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fields.birthDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(fields.birthTime)) {
    throw new FormError(422, 'Bạn kiểm tra lại ngày và giờ sinh nhé.');
  }
  const maritalStatus = fields.maritalStatus || 'không muốn chia sẻ';
  if (!statuses.includes(maritalStatus)) throw new FormError(422, 'Bạn chọn lại tình trạng hôn nhân hoặc bỏ trống mục này nhé.');
  const info = {fullName, gender:fields.gender, birthDate:fields.birthDate, birthHour:Number(fields.birthTime.slice(0,2)),
    isLunar:fields.calendar==='lunar', isLeapMonth:fields.calendar==='lunar' && fields.isLeapMonth===true, maritalStatus, viewYear};
  let solar;
  try { solar = generateLaSo(info).thienBan.solarDate.split('-').map(n => n.padStart(2,'0')).join('-'); }
  catch { throw new FormError(422, 'Ngày sinh không hợp lệ. Bạn kiểm tra lại ngày, loại lịch và tháng nhuận nhé.'); }
  if (solar > today) throw new FormError(422, 'Ngày sinh phải là hôm nay hoặc một ngày trước hôm nay.');
  return info;
}

export async function lookupForm(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw unavailable();
  await ensureSchema();
  const rows = await sql()`SELECT t.page_id,t.psid,t.revision,t.used_at,p.tuvi_state,
    EXISTS (SELECT 1 FROM conversations c WHERE c.page_id=t.page_id AND c.psid=t.psid
      AND c.bot_revision=t.revision AND c.customer_bot_on
      AND NOT EXISTS (SELECT 1 FROM pages WHERE page_id=c.page_id AND bot_on=FALSE)
      AND NOT EXISTS (SELECT 1 FROM settings WHERE key='bot_on' AND value='0')) AS active
    FROM birth_form_links t
    LEFT JOIN profiles p ON p.psid=t.psid WHERE t.token=${token} AND t.expires_at > now()`;
  const ticket = rows[0];
  if (!ticket) throw unavailable();
  if (ticket.used_at) return {already:true};
  const state = JSON.parse(ticket.tuvi_state || 'null');
  if (!canFill(state)) throw new FormError(409, 'Hội thoại đã chuyển sang bước khác. Bạn quay lại tin nhắn để xem tiếp nhé.');
  if (!preview(ticket) && !ticket.active) throw unavailable();
  return {ticket, state};
}

export async function acceptForm(token, fields) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const {already, ticket, state} = await lookupForm(token);
    if (already) return {already:true};
    const settings = await getSettings(true);
    const sales = state?.flow === 'YEAR_SALES' || settings.year_sales_on === '1';
    const viewYear = sales ? nextYear() : state?.info?.viewYear || nextYear()-1;
    const info = readBirthFields(fields, viewYear);
    const formReceipt = randomUUID();
    const next = {...(sales ? {flow:'YEAR_SALES',freeAnswers:0,paid:false} : {}), ...state,
      status:'WAITING_INFO', askedMarital:true, info, formReceipt};
    const rows = await sql()`WITH ticket AS (
        SELECT * FROM birth_form_links WHERE token=${token} AND used_at IS NULL AND expires_at>now() FOR UPDATE
      ), live AS (
        SELECT c.page_id,c.psid FROM conversations c JOIN ticket t USING(page_id,psid)
        WHERE c.bot_revision=t.revision AND c.customer_bot_on
          AND NOT EXISTS (SELECT 1 FROM pages WHERE page_id=c.page_id AND bot_on=FALSE)
          AND NOT EXISTS (SELECT 1 FROM settings WHERE key='bot_on' AND value='0') FOR UPDATE OF c
      ), saved AS (
        INSERT INTO profiles (psid,tuvi_state) SELECT t.psid,${JSON.stringify(next)} FROM ticket t
        WHERE (t.page_id='' AND t.psid='admin-test') OR EXISTS (SELECT 1 FROM live)
        ON CONFLICT (psid) DO UPDATE SET tuvi_state=excluded.tuvi_state,updated_at=now()
          WHERE profiles.tuvi_state IS NOT DISTINCT FROM ${ticket.tuvi_state}
        RETURNING psid
      ), used AS (
        UPDATE birth_form_links t SET used_at=now() FROM saved WHERE t.token=${token} AND t.psid=saved.psid
        RETURNING t.page_id,t.psid
      ), bumped AS (
        UPDATE conversations c SET bot_revision=c.bot_revision+1,bot_changed_at=now(),last_at=now()
        FROM used WHERE c.page_id=used.page_id AND c.psid=used.psid RETURNING c.bot_revision
      ), logged AS (
        INSERT INTO messages(psid,page_id,role,text) SELECT psid,NULLIF(page_id,''),'user','[Đã gửi phiếu lập lá số]' FROM used
      ) SELECT used.*, (SELECT bot_revision FROM bumped) AS revision FROM used`;
    if (rows.length) return {pageId:ticket.page_id, psid:ticket.psid, revision:rows[0].revision, formReceipt, preview:preview(ticket)};
  }
  const {already} = await lookupForm(token);
  if (already) return {already:true};
  throw new FormError(409,'Hội thoại vừa được cập nhật. Bạn bấm gửi phiếu lại giúp mình nhé.');
}
