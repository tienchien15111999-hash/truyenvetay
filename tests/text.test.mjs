import assert from 'node:assert/strict';
import { splitText, parseProfileMarkers, cleanForMessenger, mergeSameRole } from '../lib/text.js';

assert.deepEqual(splitText('xin chào'), ['xin chào']);
const long = Array.from({ length: 30 }, (_, i) => 'Đoạn số ' + i + ' ' + 'a'.repeat(150)).join('\n\n');
const parts = splitText(long, 1900);
assert.ok(parts.length >= 2);
assert.ok(parts.every((p) => p.length <= 1900));
assert.ok(splitText('x'.repeat(5000), 1900).every((p) => p.length <= 1900));

const r = parseProfileMarkers('Bạn có trán cao.\n\n**Tính cách** ổn định.\n[[HOSO:mat]] Trán cao, mắt sáng; điềm tĩnh.\n[[HOSO:tay]] Đường trí đạo dài.');
assert.equal(r.face, 'Trán cao, mắt sáng; điềm tĩnh.');
assert.equal(r.palm, 'Đường trí đạo dài.');
assert.ok(!r.clean.includes('HOSO'));
assert.ok(!r.clean.includes('**'));
assert.ok(r.clean.includes('Tính cách ổn định.'));
assert.equal(parseProfileMarkers('chào bạn').face, null);

assert.equal(cleanForMessenger('## Tiêu đề\n* một\n- hai'), 'Tiêu đề\n• một\n• hai');

const m = mergeSameRole([
  { role: 'bot', text: 'a' },
  { role: 'user', text: 'b' },
  { role: 'user', text: 'c' },
  { role: 'bot', text: 'd' },
]);
assert.equal(m.length, 2);
assert.equal(m[0].role, 'user');
assert.equal(m[0].parts[0].text, 'b\nc');
console.log('text tests OK');
