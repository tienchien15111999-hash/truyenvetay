export function packageImageUrl(value, base) {
  if (typeof value !== 'string') return null;
  if (/^https:\/\//i.test(value)) return value;
  if (!/^\/api\/media\/[a-f0-9]{16,64}$/.test(value) || !base) return null;
  return new URL(value, base).href;
}
