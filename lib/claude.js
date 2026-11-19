import { timeoutSetting, withDeadline } from './ai-http.js';

export function hasClaudeKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// Adapt the bot's Gemini-shaped history without modifying the original input.
export function claudeMessages({ history = [], userText, images = [] }) {
  const messages = [];
  const append = (role, content) => {
    if (!content.length) return;
    const previous = messages.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else messages.push({ role, content });
  };
  const image = (mime, data) => {
    if (!['image/jpeg','image/png','image/gif','image/webp'].includes(mime)) {
      throw new Error(`Claude không hỗ trợ ảnh ${mime}`);
    }
    return {type:'image', source:{type:'base64', media_type:mime, data}};
  };
  for (const turn of history) {
    const role = turn.role === 'model' || turn.role === 'assistant' ? 'assistant' : 'user';
    const content = (turn.parts || []).flatMap(part => {
      if (part.text?.trim()) return [{type:'text', text:part.text}];
      if (part.inlineData && role === 'user') return [image(part.inlineData.mimeType, part.inlineData.data)];
      return [];
    });
    // Claude requires a user turn first; DB history may start with a bot greeting.
    if (!messages.length && role === 'assistant') continue;
    append(role, content);
  }
  append('user', [
    ...images.map(img => image(img.mime, img.data)),
    {type:'text', text:userText || '(khách gửi ảnh, không kèm lời nhắn)'},
  ]);
  return messages;
}

export async function askClaude(options) {
  const key = options.apiKey || process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY');
  const model = process.env.CLAUDE_MODEL?.trim() || 'claude-haiku-4-5-20251001';
  const body = {
    model,
    max_tokens: options.maxOutputTokens ?? 2048,
    system: options.system || '',
    messages: claudeMessages(options),
  };
  // Leave sampling/thinking at the model default for compatibility across Claude models.
  return withDeadline(timeoutSetting(options.task === 'fast' ? 'CLAUDE_FAST_TIMEOUT_MS' : 'CLAUDE_READING_TIMEOUT_MS', options.task === 'fast' ? 15000 : 45000), async signal => {
    const headers = {'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'};
    if (process.env.ANTHROPIC_WORKSPACE_ID?.trim()) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID.trim();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers, body:JSON.stringify(body), signal,
    });
    if (!res.ok) {
      // Do not expose upstream response bodies or credentials in admin/webhook logs.
      throw new Error(`Claude HTTP ${res.status} (${model})`);
    }
    const data = await res.json();
    const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text || '').join('\n').trim();
    if (!text) throw new Error(`Claude trả rỗng (${model})`);
    return text;
  });
}
