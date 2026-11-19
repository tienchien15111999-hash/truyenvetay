import { redirect } from 'next/navigation';

// Trang đầu của bot nằm ở địa chỉ gốc "/"
export default function AdminRedirect() {
  redirect('/');
}
