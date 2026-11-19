'use client';

import { useEffect, useRef, useState } from 'react';
import { statuses } from '../../lib/marital-status.js';
import styles from './sheet.module.css';

const two = n => String(n).padStart(2,'0');
const missingLink = 'Bạn mở nút “Điền phiếu lập lá số” trong tin nhắn của Page nhé. Nếu cần một phiếu mới, bạn nhắn “xin phiếu”.';

async function request(action,token,fields) {
  const res = await fetch('/api/phieu-lap-la-so',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,fields})});
  const result = await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error),{status:res.status});
  return result;
}

export default function BirthSheet() {
  const [stage,setStage] = useState('opening');
  const [calendar,setCalendar] = useState('solar');
  const [error,setError] = useState('');
  const [result,setResult] = useState({});
  const [attempt,setAttempt] = useState(0);
  const secret = useRef('');
  const submitting = useRef(false);
  const currentYear = Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()));

  useEffect(() => {
    let current = true;
    const token = window.location.hash.slice(1);
    secret.current = token;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError(missingLink); setStage('closed'); return;
    }
    setStage('opening'); setError('');
    request('open',token).then(data => {
      if (current) setStage(data.received ? 'done' : 'ready');
    }).catch(err => {
      if (current) {setError(err.status ? err.message : 'Chưa mở được phiếu. Bạn kiểm tra kết nối rồi thử lại nhé.');
        setStage([409,410].includes(err.status) ? 'closed' : 'retry');}
    });
    return () => {current = false;};
  },[attempt]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const fields = {fullName:data.get('fullName'),gender:data.get('gender'),calendar,
      isLeapMonth:calendar==='lunar' && data.has('leap'),
      birthDate:[data.get('year'),two(data.get('month')),two(data.get('day'))].join('-'),
      birthTime:data.get('birthTime'),maritalStatus:data.get('maritalStatus')};
    submitting.current = true; setStage('sending'); setError('');
    try { const response = await request('submit',secret.current,fields); setResult(response); setStage('done'); }
    catch(err) {
      setError(err.status ? err.message : 'Mạng vừa bị ngắt. Bạn có thể bấm gửi lại phiếu này.');
      setStage(err.status===410 ? 'closed' : 'ready');
    } finally { submitting.current = false; }
  }

  const editing = stage==='ready' || stage==='sending';
  return <main className={styles.page}>
    <article className={styles.sheet}>
      <header className={styles.header}>
        <h1>{stage==='done' ? 'Đã nhận phiếu của bạn' : 'Phiếu lập lá số tử vi'}</h1>
        {editing && <p>Bạn điền thông tin của người cần xem để mình lập lá số và gửi lại trong cuộc trò chuyện nhé.</p>}
      </header>
      {stage==='opening' && <p role="status">Đang mở phiếu…</p>}
      {(stage==='closed' || stage==='retry') && <div><p role="alert">{error}</p>
        {stage==='retry' && <button className={styles.send} onClick={() => setAttempt(n=>n+1)}>Mở lại phiếu</button>}</div>}
      {stage==='done' && <section className={styles.done} aria-live="polite">
        <p>{result.preview ? 'Đây là kết quả của hội thoại thử.' : 'Bạn có thể đóng phiếu và quay lại hội thoại để nhận lá số nhé.'}</p>
        {result.imageUrl && <a href={result.imageUrl} target="_blank" rel="noreferrer"><img src={result.imageUrl} alt="Lá số vừa lập trong hội thoại thử" /></a>}
        {result.reply && <p className={styles.reply}>{result.reply}</p>}
      </section>}
      {editing && <form onSubmit={submit}>
        <fieldset disabled={stage==='sending'} className={styles.block}>
          <legend>Thông tin người xem</legend>
          <label>Họ và tên<input name="fullName" autoComplete="name" required maxLength={80} placeholder="Họ và tên của người cần xem" /></label>
          <label>Giới tính<select required name="gender" defaultValue=""><option value="" disabled>Chọn giới tính</option>
            <option value="nu">Nữ</option><option value="nam">Nam</option></select></label>
        </fieldset>
        <fieldset disabled={stage==='sending'} className={styles.block}>
          <legend>Ngày và giờ sinh</legend>
          <div className={styles.calendar} role="group" aria-label="Loại lịch">
            {[['solar','Dương lịch'],['lunar','Âm lịch']].map(([value,label]) =>
              <label key={value}><input type="radio" name="calendar" checked={calendar===value} value={value} onChange={()=>setCalendar(value)} />{label}</label>)}
          </div>
          {calendar==='lunar' && <label className={styles.leap}><input type="checkbox" name="leap" /> Sinh vào tháng nhuận âm lịch</label>}
          <div className={styles.date}>
            <label>Ngày<input type="number" inputMode="numeric" name="day" min="1" max={calendar==='lunar'?30:31} placeholder="DD" required /></label>
            <label>Tháng<input type="number" inputMode="numeric" name="month" min="1" max="12" placeholder="MM" required /></label>
            <label>Năm<input type="number" inputMode="numeric" name="year" min="1900" max={currentYear} placeholder="YYYY" required /></label>
          </div>
          <label>Giờ sinh<input type="time" name="birthTime" required /></label>
        </fieldset>
        <fieldset disabled={stage==='sending'} className={styles.block}>
          <legend>Tình trạng hôn nhân <small>(có thể bỏ qua)</small></legend>
          <select name="maritalStatus" aria-label="Tình trạng hôn nhân" defaultValue=""><option value="">Chọn nếu bạn muốn chia sẻ</option>
            {statuses.map(value=><option key={value} value={value}>{value[0].toUpperCase()+value.slice(1)}</option>)}</select>
        </fieldset>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" disabled={stage==='sending'} className={styles.send}>{stage==='sending' ? 'Đang gửi phiếu…' : 'Gửi phiếu lập lá số'}</button>
      </form>}
    </article>
  </main>;
}
