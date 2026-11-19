// Only customer-provided context for the reading. Chart calculations use birth data.
export const MARITAL_FORM_LINE = '• Tình trạng hôn nhân hiện tại (có thể bỏ qua):';
export const MARITAL_QUESTION = 'Để phần tình cảm sát với hoàn cảnh của bạn hơn, bạn cho mình biết tình trạng hôn nhân hiện tại nhé? Nếu muốn giữ riêng tư, bạn nhắn “bỏ qua” là được.';
export const statuses = ['độc thân', 'chưa kết hôn', 'đang có người yêu', 'đã kết hôn', 'đang ly thân', 'đã ly hôn', 'góa', 'không muốn chia sẻ'];
const skipped = statuses.at(-1);

function fold(text) {
  return typeof text === 'string' ? text.trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/\s+/g,' ') : '';
}
const canonical = new Map(statuses.map(value => [fold(value), value]));
const aliases = new Map(Object.entries({
  'chua lap gia dinh':'chưa kết hôn', 'da lap gia dinh':'đã kết hôn',
  'co gia dinh':'đã kết hôn', 'da co gia dinh':'đã kết hôn', 'co gd':'đã kết hôn', 'da lap gd':'đã kết hôn',
  'co chong':'đã kết hôn', 'co vo':'đã kết hôn', 'co ck':'đã kết hôn', 'da co ck':'đã kết hôn',
  'chua chong':'chưa kết hôn', 'chua vo':'chưa kết hôn', 'chua co gia dinh':'chưa kết hôn',
  'da co nguoi yeu':'đang có người yêu', 'co nguoi yeu':'đang có người yêu',
  'ket hon':'đã kết hôn',
  'da co chong':'đã kết hôn', 'da co vo':'đã kết hôn', 'dang hen ho':'đang có người yêu',
  'ly hon':'đã ly hôn', 'ly than':'đang ly thân', 'goa chong':'góa', 'goa vo':'góa',
  'bo qua':skipped, 'xin bo qua':skipped, 'bo qua muc nay':skipped, 'khong tien chia se':skipped,
}));

export function withMaritalField(form) {
  const text = String(form || '');
  if (/hon nhan|tinh trang (?:tinh cam|quan he)|(?:da |chua )?ket hon|lap gia dinh|doc than/.test(fold(text))) return text;
  return [text.trimEnd(), MARITAL_FORM_LINE].filter(Boolean).join('\n');
}

export const MARITAL_EXTRACTION = `Với tình trạng hôn nhân, chỉ ghi lời khách xác nhận về hiện tại của chính người được lập lá số trong tin nhắn mới. Không suy từ tuổi, ngày sinh, con cái, câu hỏi, người khác hoặc ví dụ trong form. “Chưa kết hôn” không đồng nghĩa với “độc thân”. Nếu có, chọn một trong: ${statuses.join('; ')} và chép nguyên văn cụm từ làm căn cứ vào maritalEvidence. Nếu thiếu, để cả hai trường null và giữ thông tin đã có.`;

export function maritalAnswer(message, fields = {}, asked = false) {
  const text = fold(message);
  const short = text.replace(/^(?:da |vang )?(?:(?:minh|em|toi) )?/, '').replace(/[.!]+$/, '').replace(/ (?:a|nhe)$/, '').trim();
  const unprefixed = text.replace(/[.!]+$/, '').replace(/ (?:a|nhe)$/, '').trim();
  const exact = canonical.get(unprefixed) || aliases.get(unprefixed) || canonical.get(short) || aliases.get(short);
  if (exact && (exact !== skipped || asked || short.includes('chia se'))) return exact;
  const value = canonical.get(fold(fields?.maritalStatus));
  const evidence = fold(fields?.maritalEvidence);
  return value && evidence && text.includes(evidence) ? value : null;
}

export function maritalContext(status) {
  if (!statuses.includes(status) || status === skipped) return 'Khi luận tình cảm, dùng cách nói trung tính vì khách chưa chia sẻ tình trạng hôn nhân.';
  return `Khách tự khai tình trạng hôn nhân hiện tại: ${status}. Chỉ dùng để chọn lời luận và ví dụ phù hợp khi nói về tình cảm, gia đạo. Không mặc định khách có con, muốn kết hôn hay tái hôn.`;
}
