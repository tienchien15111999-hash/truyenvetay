export function shop() {
  return process.env.SHOP_NAME || 'Fanpage';
}
export function contact() {
  return process.env.CONTACT_EMAIL || '(chưa cài CONTACT_EMAIL)';
}
