import { currentRun, requireActive } from './bot-run.js';
import { withMaritalField } from './marital-status.js';
import { neon } from '@neondatabase/serverless';
import { DEFAULT_SETTINGS, SETTING_KEYS } from './defaults.js';

let _sql = null;
let _ready = null;
let _settingsCache = null;
let _settingsCacheAt = 0;
const SETTINGS_TTL_MS = 10000; // ghi nhớ cài đặt 10 giây cho nhanh

export function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('Thiếu biến DATABASE_URL (chưa nối Neon)');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Tự tạo bảng lần đầu chạy, không cần làm gì thêm
export function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const q = sql();
      // giai đoạn 1: tạo các bảng (chạy song song cho nhanh)
      await Promise.all([
        q`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
        q`CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY, psid TEXT NOT NULL, role TEXT NOT NULL,
          text TEXT, had_image BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS profiles (
          psid TEXT PRIMARY KEY, face_summary TEXT, palm_summary TEXT,
          tuvi_state TEXT, tuvi_summary TEXT, updated_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS inbox (
          id SERIAL PRIMARY KEY, psid TEXT NOT NULL, mid TEXT UNIQUE, text TEXT,
          image_urls TEXT, handled BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS pages (
          page_id TEXT PRIMARY KEY, name TEXT, pic TEXT, token TEXT NOT NULL,
          bot_on BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS ai_keys (
          id SERIAL PRIMARY KEY, api_key TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS conversations (
          page_id TEXT NOT NULL, psid TEXT NOT NULL, name TEXT, pic TEXT,
          last_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (page_id, psid))`,
        q`CREATE TABLE IF NOT EXISTS birth_form_links (
          page_id TEXT NOT NULL, psid TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
          revision BIGINT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
          PRIMARY KEY (page_id, psid))`,
        q`CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY, name TEXT, mime TEXT NOT NULL, data_b64 TEXT NOT NULL,
          size INTEGER, created_at TIMESTAMPTZ DEFAULT now())`,
        q`CREATE TABLE IF NOT EXISTS logs (
          id SERIAL PRIMARY KEY, level TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
      ]);
      await q`CREATE TABLE IF NOT EXISTS claude_keys (id INTEGER PRIMARY KEY CHECK (id = 1), api_key TEXT NOT NULL)`;
      // giai đoạn 2: chỉ mục và cột bổ sung cho bảng đã có từ bản cũ
      await Promise.all([
        q`CREATE INDEX IF NOT EXISTS messages_psid_idx ON messages (psid, id)`,
        q`CREATE INDEX IF NOT EXISTS inbox_psid_idx ON inbox (psid, id)`,
        q`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS birth_form_claimed BOOLEAN DEFAULT FALSE`,
        q`ALTER TABLE messages ADD COLUMN IF NOT EXISTS page_id TEXT, ADD COLUMN IF NOT EXISTS inbox_id INTEGER`,
        q`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_bot_on BOOLEAN NOT NULL DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS bot_revision BIGINT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS bot_changed_at TIMESTAMPTZ`,
        q`ALTER TABLE inbox ADD COLUMN IF NOT EXISTS page_id TEXT, ADD COLUMN IF NOT EXISTS bot_revision BIGINT`,
        q`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tuvi_state TEXT`,
        q`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tuvi_summary TEXT`,
        q`ALTER TABLE pages ADD COLUMN IF NOT EXISTS tree_mode BOOLEAN NOT NULL DEFAULT FALSE`,
      ]);
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

export async function getSettings(fresh = false) {
  const now = Date.now();
  if (!fresh && _settingsCache && now - _settingsCacheAt < SETTINGS_TTL_MS) return _settingsCache;
  await ensureSchema();
  const rows = await sql()`SELECT key, value FROM settings`;
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (SETTING_KEYS.includes(r.key)) out[r.key] = r.value;
  out.birth_form_message = withMaritalField(out.birth_form_message);
  _settingsCache = out;
  _settingsCacheAt = now;
  return out;
}

export async function saveSettings(obj) {
  await ensureSchema();
  const q = sql();
  const changes = Object.fromEntries(SETTING_KEYS.filter(key=>typeof obj[key]==='string').map(key=>[key,obj[key]]));
  if (Object.keys(changes).length) {
    await q`INSERT INTO settings (key,value) SELECT key,value FROM jsonb_each_text(${JSON.stringify(changes)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
  }
  _settingsCache = null;
  _settingsCacheAt = 0;
}

export async function getProfile(psid) {
  const rows = await sql()`SELECT face_summary, palm_summary, tuvi_state, tuvi_summary FROM profiles WHERE psid = ${psid}`;
  return rows[0] || { face_summary: null, palm_summary: null, tuvi_state: null, tuvi_summary: null };
}

export async function saveProfile(psid, face, palm) {
  if (!face && !palm) return;
  await sql()`INSERT INTO profiles (psid, face_summary, palm_summary) VALUES (${psid}, ${face}, ${palm})
    ON CONFLICT (psid) DO UPDATE SET
      face_summary = COALESCE(${face}, profiles.face_summary),
      palm_summary = COALESCE(${palm}, profiles.palm_summary),
      updated_at = now()`;
}

export async function saveTuViProfile(psid, tuviStateObj, tuviSummary = null) {
  await requireActive();
  const stateStr = tuviStateObj ? JSON.stringify(tuviStateObj) : null;
  await sql()`INSERT INTO profiles (psid, tuvi_state, tuvi_summary) VALUES (${psid}, ${stateStr}, ${tuviSummary})
    ON CONFLICT (psid) DO UPDATE SET
      tuvi_state = COALESCE(${stateStr}, profiles.tuvi_state),
      tuvi_summary = COALESCE(${tuviSummary}, profiles.tuvi_summary),
      updated_at = now()`;
}

// Compare the original snapshot so a delayed bot reply cannot undo a payment decision.
export async function updateTuViSnapshot(psid, previous, next) {
  await requireActive();
  const rows = await sql()`UPDATE profiles SET tuvi_state = ${JSON.stringify(next)}, updated_at = now()
    WHERE psid = ${psid} AND tuvi_state = ${previous} RETURNING psid`;
  return rows.length > 0;
}

export async function getHistory(psid, limit = 16) {
  const run = currentRun();
  if (run?.inboxId) {
    const rows = await sql()`SELECT role, text FROM messages WHERE psid = ${psid}
      AND (page_id = ${run.pageId} OR page_id IS NULL) AND (inbox_id IS NULL OR inbox_id < ${run.inboxId})
      ORDER BY id DESC LIMIT ${limit}`;
    return rows.reverse();
  }
  const rows = await sql()`SELECT role, text FROM messages WHERE psid = ${psid} ORDER BY id DESC LIMIT ${limit}`;
  return rows.reverse();
}

export async function addMessage(psid, role, text, hadImage = false, pageId = null) {
  await sql()`INSERT INTO messages (psid, role, text, had_image, page_id) VALUES (${psid}, ${role}, ${text}, ${hadImage}, ${pageId})`;
}

// Fanpage này đang dùng chế độ cây chủ đề không? Lỗi hoặc không có Fanpage thì coi như chế độ cũ.
export async function pageTreeMode(pageId) {
  if (!pageId) return false;
  try {
    await ensureSchema();
    const rows = await sql()`SELECT tree_mode FROM pages WHERE page_id = ${pageId}`;
    const v = rows[0]?.tree_mode;
    return v === true || v === 't' || v === 'true';
  } catch { return false; }
}

export async function getAiKeys() {
  await ensureSchema();
  const rows = await sql()`SELECT api_key FROM ai_keys ORDER BY id`;
  return rows.map((r) => r.api_key);
}

export async function deleteCustomer(psid) {
  await ensureSchema();
  const q = sql();
  await q`DELETE FROM birth_form_links WHERE psid = ${psid}`;
  await q`DELETE FROM messages WHERE psid = ${psid}`;
  await q`DELETE FROM profiles WHERE psid = ${psid}`;
  await q`DELETE FROM inbox WHERE psid = ${psid}`;
  await q`DELETE FROM conversations WHERE psid = ${psid}`;
}

// Ghi nhật ký để xem trong tab "Nhật ký" của trang quản trị (lỗi ghi nhật ký thì bỏ qua)
export async function addLog(level, text) {
  try {
    await ensureSchema();
    const q = sql();
    await q`INSERT INTO logs (level, text) VALUES (${level}, ${String(text).slice(0, 500)})`;
    await q`DELETE FROM logs WHERE id < (SELECT COALESCE(MAX(id), 0) FROM logs) - 300`;
  } catch { /* bỏ qua */ }
}

// ---------- Kho ảnh (dùng cho câu mở đầu) ----------
export async function countMessages(psid) {
  const run = currentRun();
  if (run?.inboxId) {
    const rows = await sql()`SELECT count(*)::int AS n FROM messages WHERE psid = ${psid}
      AND (inbox_id IS NULL OR inbox_id < ${run.inboxId})`;
    return Number(rows[0].n);
  }
  const rows = await sql()`SELECT count(*)::int AS n FROM messages WHERE psid = ${psid}`;
  return Number(rows[0] && rows[0].n) || 0;
}

export async function listMedia() {
  await ensureSchema();
  return sql()`SELECT id, name, size, created_at FROM media ORDER BY created_at DESC`;
}

export async function addMedia({ id, name, mime, dataB64, size }) {
  await ensureSchema();
  await sql()`INSERT INTO media (id, name, mime, data_b64, size) VALUES (${id}, ${name}, ${mime}, ${dataB64}, ${size})`;
}

export async function getMedia(id) {
  await ensureSchema();
  const rows = await sql()`SELECT mime, data_b64 FROM media WHERE id = ${id}`;
  return rows[0] || null;
}

// Xoá ảnh khỏi kho, đồng thời gỡ khỏi danh sách ảnh câu mở đầu
export async function deleteMedia(id) {
  await ensureSchema();
  const q = sql();
  await q`DELETE FROM media WHERE id = ${id}`;
  const rows = await q`SELECT value FROM settings WHERE key = 'opening_images'`;
  if (rows[0]) {
    let list = [];
    try { list = JSON.parse(rows[0].value); } catch { list = []; }
    const next = (Array.isArray(list) ? list : []).filter((x) => x !== id);
    await q`UPDATE settings SET value = ${JSON.stringify(next)} WHERE key = 'opening_images'`;
  }
  _settingsCache = null;
  _settingsCacheAt = 0;
}

// Lưu một lượt hội thoại: tin của khách trước, rồi lần lượt các tin của bot (tuần tự để không bị đảo thứ tự)
export async function saveTurn(psid, pageId, userText, hadImage, botTexts) {
  if (currentRun()?.inboxId || currentRun()?.logsDeliveries) return; // Webhook logs inbound on receipt, outbound on actual delivery.
  await addMessage(psid, 'user', userText, hadImage, pageId);
  for (const t of botTexts.filter(Boolean)) await addMessage(psid, 'bot', t, false, pageId);
}

// Mã truy cập của Fanpage mà khách này đang chat (không có thì dùng biến PAGE_ACCESS_TOKEN)
export async function getPageTokenForPsid(psid, pageId = null) {
  await ensureSchema();
  const q = sql();
  const conv = await q`SELECT page_id, bot_revision, customer_bot_on FROM conversations WHERE psid = ${psid}
    AND (${pageId}::text IS NULL OR page_id = ${pageId}) LIMIT 1`;
  if (pageId && !conv[0]) return null;
  if (conv[0]) {
    const pg = await q`SELECT token FROM pages WHERE page_id = ${conv[0].page_id}`;
    if (pg[0] && pg[0].token) return { token: pg[0].token, pageId: conv[0].page_id, revision:conv[0].bot_revision };
  }
  if (process.env.PAGE_ACCESS_TOKEN) return { token: process.env.PAGE_ACCESS_TOKEN, pageId: conv[0]?.page_id || null, revision:conv[0]?.bot_revision };
  return null;
}

export async function getClaudeKey() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  if (!process.env.DATABASE_URL) return null;
  await ensureSchema();
  const rows=await sql()`SELECT api_key FROM claude_keys WHERE id = 1`;
  return rows[0]?.api_key || null;
}

export function deliveryGuard(pageId, psid, revision) {
  return async () => {
    const rows = await sql()`SELECT 1 FROM conversations c WHERE c.page_id = ${pageId} AND c.psid = ${psid}
      AND c.customer_bot_on AND c.bot_revision = ${revision}
      AND NOT EXISTS (SELECT 1 FROM pages WHERE page_id = c.page_id AND bot_on = FALSE)
      AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'bot_on' AND value = '0')`;
    return rows.length > 0;
  };
}
