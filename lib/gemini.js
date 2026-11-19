import { getClaudeKey } from './db.js';
import { askClaude, hasClaudeKey } from './claude.js';
import { timeoutSetting, withDeadline } from './ai-http.js';

// Gọi Gemini: xoay vòng nhiều key + nhiều model, lỗi tạm thời (429/503/timeout) thì thử cái khác

const DEFAULT_MODELS = 'gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.8-flash';
const MAX_ATTEMPTS = 3;

function list(envValue, fallback = '') {
  return String(envValue || fallback).split(',').map((s) => s.trim()).filter(Boolean);
}

async function askGoogle({ system, history, userText, images, extraKeys = [], temperature = 0.8, maxOutputTokens = 2048, task = 'reading' }) {
  // key nhập trong trang quản trị (extraKeys) + key trong biến Vercel, bỏ trùng
  const keys = [...new Set([...extraKeys, ...list(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)])];
  const models = list(process.env.GEMINI_MODELS, DEFAULT_MODELS);
  if (!keys.length) throw new Error('Chưa có key Gemini nào (bấm biểu tượng 🔑 để thêm)');

  const userParts = [];
  for (const img of images || []) userParts.push({ inlineData: { mimeType: img.mime, data: img.data } });
  userParts.push({ text: userText || '(khách gửi ảnh, không kèm lời nhắn)' });

  const contents = (history || []).map(turn => ({...turn, parts: [...(turn.parts || [])]}));
  const last = contents[contents.length - 1];
  if (last && last.role === 'user') {
    // gộp vào lượt user cuối để không có 2 lượt user liền nhau
    last.parts = [...last.parts, ...userParts];
  } else {
    contents.push({ role: 'user', parts: userParts });
  }

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature, maxOutputTokens },
  };

  // thứ tự thử: key xoay vòng ngẫu nhiên điểm bắt đầu, model theo thứ tự ưu tiên
  const startKey = Math.floor(Math.random() * keys.length);
  const combos = [];
  for (let i = 0; i < Math.max(models.length, keys.length, MAX_ATTEMPTS); i++) {
    combos.push({ model: models[i % models.length], key: keys[(startKey + i) % keys.length] });
  }

  const fast = task === 'fast';
  const perAttempt = timeoutSetting(fast ? 'GEMINI_FAST_TIMEOUT_MS' : 'GEMINI_READING_TIMEOUT_MS', fast ? 12000 : 45000);
  const budget = timeoutSetting(fast ? 'GEMINI_FAST_BUDGET_MS' : 'GEMINI_READING_BUDGET_MS', fast ? 20000 : 60000);
  const deadline = performance.now() + budget;
  let lastErr = null;
  for (const c of combos.slice(0, MAX_ATTEMPTS)) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 50) break; // Do not start a request with only a few milliseconds left.
    try {
      const text = await withDeadline(Math.min(perAttempt, remaining), async signal => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const t = (await res.text()).slice(0, 300);
        lastErr = new Error(`Gemini HTTP ${res.status} (${c.model}): ${t}`);
        if (res.status === 400) throw Object.assign(lastErr, { fatal: true });
        throw lastErr;
      }
      const data = await res.json();
      const cand = data.candidates && data.candidates[0];
      const text = cand && cand.content && cand.content.parts
        ? cand.content.parts.filter(p => !p.thought).map((p) => p.text || '').join('').trim()
        : '';
      if (data.promptFeedback?.blockReason || ['SAFETY','PROHIBITED_CONTENT','BLOCKLIST','SPII'].includes(cand?.finishReason)) {
        throw Object.assign(new Error('Yêu cầu bị bộ lọc nội dung chặn'), {fatal:true, noFallback:true});
      }
      if (text) return text;
      throw new Error(`Gemini trả rỗng (${c.model})`);
      });
      return text;
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
    }
  }
  throw lastErr || new Error('Gemini không trả lời');
}

// Backward-compatible entry point: every existing bot call gains Claude fallback.
export async function askGemini(options) {
  try {
    return await askGoogle(options);
  } catch (googleError) {
    if (googleError.noFallback) throw googleError;
    const claudeKey = await getClaudeKey();
    if (!claudeKey) throw googleError;
    try {
      return await askClaude({...options, task: options.task || 'reading', apiKey: claudeKey});
    } catch (claudeError) {
      throw new Error(`Gemini không khả dụng; Claude dự phòng thất bại: ${claudeError.message}`);
    }
  }
}
