'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TREE } from '../lib/tree-data.js';

async function api(path, pw, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-admin-password': pw, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Lỗi ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

// Thu nhỏ ảnh trước khi gửi để nhẹ và nhanh
function shrinkImage(file, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // nền trắng, tránh ảnh PNG trong suốt bị đen khi đổi sang JPG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không mở được ảnh này')); };
    img.src = url;
  });
}

function parseList(value) {
  try {
    const v = JSON.parse(value || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function Avatar({ src, name, small }) {
  const [bad, setBad] = useState(false);
  const cls = `avatar${small ? ' sm' : ''}`;
  if (src && !bad) return <img className={cls} src={src} alt="" onError={() => setBad(true)} />;
  return <span className={cls} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}

function Modal({ title, onClose, children, wide }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // luôn dùng hàm đóng mới nhất mà không chạy lại hiệu ứng bên dưới
  useEffect(() => {
    if (closeRef.current) closeRef.current.focus(); // chỉ đặt tiêu điểm một lần khi mở, không giật con trỏ lúc đang gõ
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="top">
          <h2>{title}</h2>
          <button ref={closeRef} className="btn ghost small" onClick={onClose}>Đóng</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- 🔑 Nhập API AI ---------- */
function KeysModal({ pw, onClose }) {
  const [claudeText,setClaudeText]=useState('');
  const [claudeStatus,setClaudeStatus]=useState({});
  const [keys, setKeys] = useState(null);
  const [envCount, setEnvCount] = useState(0);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/admin/keys', pw);
      setKeys(d.keys);
      setClaudeStatus({masked:d.claudeMasked,env:d.claudeEnv});
      setEnvCount(d.envCount);
    } catch (e) { setMsg({ text: e.message, err: true }); }
  }, [pw]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const d = await api('/api/admin/keys', pw, { method: 'POST', body: JSON.stringify({ text, provider: 'gemini' }) });
      setText('');
      setMsg(d.added > 0
        ? { text: `Đã thêm ${d.added} key.${d.ignored ? ` ${d.ignored} key đã có sẵn nên bỏ qua.` : ''}` }
        : { text: 'Không thêm được key nào. Key phải dài và chưa có trong danh sách.', err: true });
      load();
    } catch (e) { setMsg({ text: e.message, err: true }); }
    setBusy(false);
  }

  async function remove(id) {
    if (!confirm('Xoá key này?')) return;
    try { await api(`/api/admin/keys?id=${id}`, pw, { method: 'DELETE' }); load(); } catch (e) { setMsg({ text: e.message, err: true }); }
  }

  return (
    <Modal title="🔑 API AI — Gemini và Claude" onClose={onClose}>
      <p className="hint">Dán key Gemini vào ô dưới, mỗi dòng một key (hoặc cách nhau dấu phẩy). Bot dùng tất cả key và tự chuyển sang key khác khi một key hết lượt.</p>
      {msg && <p className={`notice${msg.err ? ' err' : ''}`} role="status">{msg.text}</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="AIza..." aria-label="Key Gemini" />
      <div className="row"><button className="btn" onClick={add} disabled={busy || !text.trim()}>Thêm Gemini key</button></div>

      <h3 style={{ fontSize: 16, margin: '20px 0 4px' }}>Gemini — key đang dùng</h3>
      {keys === null && <p className="muted">Đang tải...</p>}
      {keys && keys.length === 0 && <p className="muted">Chưa có key nào được thêm ở đây.</p>}
      {keys && keys.map((k) => (
        <div className="listrow" key={k.id}>
          <div className="t"><code>{k.masked}</code></div>
          <button className="btn danger small" onClick={() => remove(k.id)}>Xoá</button>
        </div>
      ))}
      {envCount > 0 && <p className="hint" style={{ marginTop: 12 }}>Ngoài ra còn {envCount} key lấy từ biến GEMINI_API_KEYS trên Vercel, bot dùng chung.</p>}
      <hr />
      <h3>Claude (Anthropic) — dự phòng</h3>
      <p className="hint">Chỉ dùng khi Gemini lỗi hoặc hết thời gian chờ. Không nhập key Google vào ô này.</p>
      <input type="password" autoComplete="off" aria-label="Claude API key" placeholder="sk-ant-..." value={claudeText} onChange={e=>setClaudeText(e.target.value)} />
      <button className="btn" disabled={busy || !claudeText.trim()} onClick={async()=>{
        setBusy(true);try{await api('/api/admin/keys',pw,{method:'POST',body:JSON.stringify({provider:'claude',text:claudeText})});setClaudeText('');setMsg({text:'Đã lưu key Claude dự phòng.'});await load();}catch(e){setMsg({text:e.message,err:true});}finally{setBusy(false);}
      }}>Lưu Claude key</button>
      <p className="hint">{claudeStatus.masked ? `Key đã lưu: ${claudeStatus.masked}` : 'Chưa lưu key Claude tại đây.'}</p>
      {claudeStatus.env && <p className="hint">Đang ưu tiên ANTHROPIC_API_KEY trên Vercel. Muốn dùng key nhập ở đây, xóa biến đó và redeploy.</p>}
      {claudeStatus.masked && <button className="btn danger small" disabled={busy} onClick={async()=>{
        if(!confirm('Xóa key Claude đã lưu?'))return;setBusy(true);
        try{await api('/api/admin/keys?provider=claude',pw,{method:'DELETE'});await load();}catch(e){setMsg({text:e.message,err:true});}finally{setBusy(false);}
      }}>Xóa key Claude đã lưu</button>}
    </Modal>
  );
}

/* ---------- Thêm page (API của Fanpage) ---------- */
function PagesModal({ pw, pages, envToken, onClose, onChanged }) {
  const [token, setToken] = useState('');
  const [needId, setNeedId] = useState(false);
  const [pageId, setPageId] = useState('');
  const [pageName, setPageName] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!token.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await api('/api/admin/pages', pw, {
        method: 'POST',
        body: JSON.stringify({ token, page_id: pageId, name: pageName }),
      });
      setToken('');
      setNeedId(false);
      setPageId('');
      setPageName('');
      setMsg({
        text: `Đã thêm Fanpage "${d.name}".` + (d.subscribed ? '' : ' Chưa tự đăng ký nhận tin, hãy kiểm tra mục "Thêm đăng ký" (messages) ở Meta.'),
      });
      onChanged();
    } catch (e) {
      if (e.data && e.data.need_page_id) setNeedId(true);
      setMsg({ text: e.message, err: true });
    }
    setBusy(false);
  }

  async function toggle(p) {
    try {
      await api('/api/admin/pages', pw, { method: 'PATCH', body: JSON.stringify({ page_id: p.page_id, bot_on: !p.bot_on }) });
      onChanged();
    } catch (e) { setMsg({ text: e.message, err: true }); }
  }

  async function remove(p) {
    if (!confirm(`Xoá Fanpage "${p.name}" khỏi bot? Hội thoại cũ vẫn được giữ.`)) return;
    try { await api(`/api/admin/pages?page_id=${encodeURIComponent(p.page_id)}`, pw, { method: 'DELETE' }); onChanged(); } catch (e) { setMsg({ text: e.message, err: true }); }
  }

  return (
    <Modal title="Thêm page (Fanpage)" onClose={onClose}>
      <p className="hint">Dán mã truy cập Fanpage (Page Access Token) lấy ở Meta, mục Thiết lập API Messenger, phần "Tạo mã truy cập". Thêm nhiều Fanpage thì thêm từng cái một.</p>
      {msg && <p className={`notice${msg.err ? ' err' : ''}`} role="status">{msg.text}</p>}
      <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB..." aria-label="Mã truy cập Fanpage" style={{ minHeight: 90 }} />
      {needId && (
        <div style={{ marginTop: 12 }}>
          <label className="label" htmlFor="pid">Mã Fanpage (dãy số)</label>
          <p className="hint">Là dãy số hiện ngay dưới tên Fanpage ở trang Meta (chỗ Thiết lập API Messenger, phần Tạo mã truy cập).</p>
          <input id="pid" type="text" inputMode="numeric" value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Ví dụ: 1357809350758137" />
          <label className="label" htmlFor="pname" style={{ marginTop: 10 }}>Tên Fanpage (không bắt buộc)</label>
          <input id="pname" type="text" value={pageName} onChange={(e) => setPageName(e.target.value)} placeholder="Để trống cũng được" />
        </div>
      )}
      <div className="row"><button className="btn" onClick={add} disabled={busy || !token.trim()}>{busy ? 'Đang kiểm tra...' : 'Thêm page'}</button></div>

      <h3 style={{ fontSize: 16, margin: '20px 0 4px' }}>Các Fanpage đang nối</h3>
      {pages.length === 0 && <p className="muted">Chưa có Fanpage nào được thêm ở đây.</p>}
      {pages.map((p) => (
        <div className="listrow" key={p.page_id}>
          <Avatar src={p.pic} name={p.name} small />
          <div className="t"><strong>{p.name}</strong><br /><span className="muted" style={{ fontSize: 13 }}>{p.page_id}</span></div>
          <label className="switch">
            <input type="checkbox" checked={p.bot_on} onChange={() => toggle(p)} />
            Bot {p.bot_on ? 'bật' : 'tắt'}
          </label>
          <button className="btn danger small" onClick={() => remove(p)}>Xoá</button>
        </div>
      ))}
      {envToken && <p className="hint" style={{ marginTop: 12 }}>Web đang có sẵn mã Fanpage trong biến PAGE_ACCESS_TOKEN trên Vercel. Fanpage nào chưa thêm ở đây sẽ dùng mã đó.</p>}
    </Modal>
  );
}

/* ---------- Trang chat với khách ---------- */
function ChatView({ pw, pageFilter, pagePicker, settings }) {
  const [list, setList] = useState(null);
  const [cur, setCur] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [payNote, setPayNote] = useState(null);
  const selectedRef = useRef(null);
  const detailRequest = useRef(0);
  const togglePending = useRef(false);
  const [savingBot, setSavingBot] = useState(false);
  const [botError, setBotError] = useState('');
  const endRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const q = pageFilter ? `?page=${encodeURIComponent(pageFilter)}` : '';
      setList((await api('/api/admin/conversations' + q, pw)).list);
      setErr('');
    } catch (e) { setErr(e.message); }
  }, [pw, pageFilter]);

  const loadDetail = useCallback(async (customer) => {
    if (selectedRef.current !== customer) return;
    const request = ++detailRequest.current;
    try {
      const params = new URLSearchParams({psid:customer.psid,page:customer.page_id});
      const data = await api('/api/admin/conversations?' + params, pw);
      if (request === detailRequest.current && selectedRef.current === customer) setDetail(data);
    } catch (e) {
      if (request === detailRequest.current) setErr(e.message);
    }
  }, [pw]);

  useEffect(() => { loadList(); const t = setInterval(loadList, 10000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => {
    if (!cur) return undefined;
    const t = setInterval(() => loadDetail(cur), 10000);
    return () => clearInterval(t);
  }, [cur, loadDetail]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [detail]);

  function open(c) {
    selectedRef.current = c;
    setCur(c); setDetail(null); setPayNote(null); setBotError('');
    loadDetail(c);
  }

  async function toggleCustomerBot() {
    if (!cur || !detail?.customer || togglePending.current) return;
    const customer = cur;
    const enabled = !detail.customer.customer_bot_on;
    togglePending.current = true;
    setSavingBot(true); setBotError('');
    try {
      const result = await api('/api/admin/conversations', pw, {
        method:'PATCH', body:JSON.stringify({page_id:customer.page_id, psid:customer.psid, enabled}),
      });
      setList(rows => rows?.map(row => row.psid === customer.psid && row.page_id === customer.page_id
        ? {...row,...result.customer} : row));
      if (selectedRef.current === customer) {
        ++detailRequest.current;
        setDetail(data => data && ({...data,customer:{...data.customer,...result.customer}}));
      }
    } catch (e) {
      if (selectedRef.current === customer) setBotError(e.message);
    } finally {
      togglePending.current = false;
      setSavingBot(false);
    }
  }

  async function payment(action,kind) {
    if (!cur) return;
    const order = detail?.tuvi;
    const expectedAmount = action==='grant' ? settings[kind==='annual'?'annual_amount':'pay_amount'] : order?.amount;
    const packageLabel = action==='grant' ? (kind==='annual'?'xem năm':'trọn đời') : order?.packageLabel || 'trọn đời';
    const text = kind==='tree_all'
      ? `Mở tất cả các mục khóa cho ${cur.name || 'khách này'}? Chỉ làm khi khách đã trả gộp.`
      : action !== 'revoke'
        ? `Xác nhận đã nhận ${expectedAmount || 'tiền'} cho ${detail?.tuvi?.tree ? 'mục' : 'gói'} ${packageLabel} của ${cur.name || 'khách này'}?`
        : 'Thu hồi quyền xem tiếp của khách này? Bot sẽ không luận các mục còn lại nữa cho tới khi bạn xác nhận lại.';
    if (!confirm(text)) return;
    try {
      const d = await api('/api/admin/payment', pw, { method: 'POST', body: JSON.stringify({ psid: cur.psid, page_id:cur.page_id, action, kind, expectedAmount, orderId: order?.orderId }) });
      setPayNote(action !== 'revoke'
        ? { text: d.sent ? 'Đã xác nhận và đã nhắn báo khách.' : `Đã xác nhận. ${d.note || ''}`, err: !d.sent }
        : { text: 'Đã thu hồi quyền xem tiếp.' });
      loadDetail(cur);
      loadList();
    } catch (e) { setPayNote({ text: e.message, err: true }); }
  }

  async function remove() {
    if (!cur || !confirm('Xoá toàn bộ hội thoại và hồ sơ của khách này?')) return;
    try {
      await api(`/api/admin/conversations?psid=${encodeURIComponent(cur.psid)}`, pw, { method: 'DELETE' });
      setCur(null); setDetail(null); loadList();
    } catch (e) { setErr(e.message); }
  }

  const label = (c) => c.name || `Khách ${String(c.psid).slice(-4)}`;
  const shown = (list || []).filter((c) => {
    const s = search.trim().toLowerCase();
    return !s || label(c).toLowerCase().includes(s) || (c.last_text || '').toLowerCase().includes(s);
  });
  const prof = detail && detail.profile;

  return (
    <div className={`chatwrap${cur ? ' has-cur' : ''}`}>
      <div className="listcol">
        {pagePicker}
        <div className="search">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khách theo tên" aria-label="Tìm khách" />
        </div>
        <div className="items">
          {err && <p className="notice err" style={{ margin: 10 }} role="alert">{err}</p>}
          {list === null && <p className="empty">Đang tải...</p>}
          {list && list.length === 0 && <p className="empty">Chưa có khách nào nhắn tin.</p>}
          {shown.map((c) => (
            <button key={`${c.page_id}-${c.psid}`} className="cust" aria-current={cur && cur.psid === c.psid && cur.page_id === c.page_id} onClick={() => open(c)}>
              <Avatar src={c.pic} name={label(c)} />
              <span className="t">
                <span className="n">{label(c)}{c.tuvi && c.tuvi.stage === 'PENDING_CONFIRM' ? ' 💰' : ''}{c.tuvi && c.tuvi.paid ? ' ✅' : ''}</span>
                <span className="l" style={{ display: 'block' }}>{c.last_text || '...'}</span>
                <span className="p" style={{ display: 'block' }}>
                  {c.customer_bot_on === false && <strong>Bot tắt · </strong>}
                  {c.tuvi && c.tuvi.stage === 'PENDING_CONFIRM' ? <strong style={{ color: 'var(--danger)' }}>Chờ xác nhận tiền · </strong> : null}
                  {c.page_name || 'Fanpage'} · {timeLabel(c.last_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="convcol">
        {!cur && <p className="empty" style={{ margin: 'auto' }}>Chọn một khách bên trái để xem hội thoại.</p>}
        {cur && (
          <>
            <div className="convhead">
              <button className="btn ghost small backbtn" onClick={() => { setCur(null); setDetail(null); }}>← Quay lại</button>
              <Avatar src={cur.pic} name={label(cur)} small />
              <div className="t">
                <div className="n">{label(cur)}</div>
                <div className="muted" style={{ fontSize: 13 }}>{cur.page_name || 'Fanpage'}</div>
              </div>
              <button type="button" className="customer-switch" role="switch"
                aria-label={`Trả lời tự động cho ${label(cur)}`}
                aria-checked={Boolean((detail?.customer || cur).customer_bot_on)}
                disabled={!detail?.customer || savingBot} onClick={toggleCustomerBot}>
                <span className="switch-track" aria-hidden="true" />
                <span>Bot {(detail?.customer || cur).customer_bot_on ? 'bật' : 'tắt'}</span>
              </button>
              {detail && detail.tuvi && detail.tuvi.hasChart && !detail.tuvi.paid && ['OFFERED','PENDING_CONFIRM'].includes(detail.tuvi.stage) && (
                <button className="btn small" onClick={() => payment('confirm')}>✅ Xác nhận đã nhận tiền</button>
              )}
              {detail && detail.tuvi && (detail.tuvi.paid || detail.tuvi.annualPaid || (detail.tuvi.tree && detail.tuvi.treeUnlocked > 0)) && (
                <button className="btn ghost small" onClick={() => payment('revoke')}>Thu hồi quyền xem</button>
              )}
              <button className="btn danger small" onClick={remove}>Xoá khách</button>
            </div>
            {botError && <p className="notice err" role="alert">{botError}</p>}
            {detail?.tuvi?.receipt && <p>Đối chiếu ảnh: {detail.tuvi.receipt.note}. Cần kiểm tra tiền thực nhận.</p>}
            {detail && detail.tuvi && detail.tuvi.hasChart && (
              <div className="profile">
                Tử vi: {detail.tuvi.paid ? '✅ đã trả phí, bot xem tất cả các mục' : ({
                  ANNUAL_PAID: 'đã trả phí gói năm',
                  CHOOSE_PACKAGE: 'đã gửi lá số, chờ khách chọn gói',
                  ASK_LIFETIME: 'đã xem năm miễn phí, đang mời xem trọn đời',
                  FREE_QA: 'đang hỏi đáp miễn phí',
                  TREE: `đang xem theo cây chủ đề${detail.tuvi.treeUnlocked ? ' · đã mở ' + detail.tuvi.treeUnlocked + ' mục trả phí' : ''}`,
                  ASK_SECTION: 'đã lập lá số, đang hỏi khách quan tâm mục nào',
                  FREE_DONE: 'đã xem thử 1 mục miễn phí',
                  OFFERED: 'đã gửi thông tin chuyển khoản, chờ khách chuyển',
                  PENDING_CONFIRM: '💰 khách báo đã chuyển, chờ bạn xác nhận',
                }[detail.tuvi.stage] || 'đã lập lá số')} {detail.tuvi.packageLabel && `· Gói ${detail.tuvi.packageLabel} · ${detail.tuvi.amount}`}
              </div>
            )}
            {detail?.tuvi?.tree && (
              <div className="row" style={{margin:'6px 14px'}}>
                <span className="muted">Khách trả gộp?</span>
                <button className="btn ghost small" onClick={()=>payment('grant','tree_all')}>Mở tất cả các mục</button>
              </div>
            )}
            {detail?.tuvi?.hasChart && !detail.tuvi.tree && !detail.tuvi.paid && !['OFFERED','PENDING_CONFIRM'].includes(detail.tuvi.stage) && (
              <div className="row" style={{margin:'6px 14px'}}>
                <span className="muted">Đã nhận chuyển khoản?</span>
                {settings.annual_mode==='paid' && !detail.tuvi.annualPaid && <button className="btn ghost small" onClick={()=>payment('grant','annual')}>Mở gói năm</button>}
                <button className="btn ghost small" onClick={()=>payment('grant','lifetime')}>Mở gói trọn đời</button>
              </div>
            )}
            {payNote && <p className={`notice${payNote.err ? ' err' : ''}`} style={{ margin: '8px 14px 0' }} role="status">{payNote.text}</p>}
            {prof && prof.tuvi_summary && (
              <div className="profile">
                {prof.tuvi_summary && <div><strong>Tử vi:</strong> {prof.tuvi_summary}</div>}
              </div>
            )}
            <div className="msgs">
              {!detail && <p className="empty">Đang tải...</p>}
              {detail && detail.messages.map((m, i) => (
                <div key={i} className={`msg ${m.role === 'bot' ? 'out' : 'in'}`}>{m.text}</div>
              ))}
              <div ref={endRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Nhật ký (để biết tin dừng ở đâu) ---------- */
function LogView({ pw }) {
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setLogs((await api('/api/admin/logs', pw)).logs); setErr(''); } catch (e) { setErr(e.message); }
  }, [pw]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  async function clear() {
    if (!confirm('Xoá toàn bộ nhật ký?')) return;
    try { await api('/api/admin/logs', pw, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <div className="content">
      <div className="savebar">
        <h2>Nhật ký</h2>
        <div className="row" style={{ margin: 0 }}>
          <button className="btn ghost" onClick={load}>Tải lại</button>
          <button className="btn ghost" onClick={clear}>Xoá nhật ký</button>
        </div>
      </div>
      <p className="hint">Nhắn thử vào Fanpage rồi xem ở đây (tự cập nhật mỗi 8 giây). Nếu không có dòng mới nào, nghĩa là Facebook chưa gửi tin về web. Nếu có dòng màu đỏ, đọc dòng đó để biết bot dừng ở đâu.</p>
      {err && <p className="notice err" role="alert">{err}</p>}
      {logs === null && <p className="muted">Đang tải...</p>}
      {logs && logs.length === 0 && <p className="empty">Chưa có sự kiện nào. Hãy nhắn thử vào Fanpage.</p>}
      {logs && logs.map((l) => (
        <div key={l.id} className="listrow" style={{ alignItems: 'flex-start' }}>
          <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', minWidth: 118 }}>
            {new Date(l.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span style={{ color: l.level === 'error' ? 'var(--danger)' : 'inherit', wordBreak: 'break-word' }}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Bảng kiến thức + giọng bot ---------- */
function KnowledgeBox({ id, label, hint, value, onChange }) {
  const fileRef = useRef(null);
  async function loadFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const text = await f.text();
    onChange(value && value.trim() ? value.trim() + '\n\n' + text : text);
    e.target.value = '';
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <p className="hint">{hint}</p>
      <textarea id={id} className="tall" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="row">
        <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>Nạp thêm từ file .txt hoặc .csv</button>
        <input ref={fileRef} type="file" accept=".txt,.csv,.md,text/plain,text/csv" hidden onChange={loadFile} />
        <span className="count">{(value || '').length.toLocaleString('vi-VN')} ký tự</span>
      </div>
    </div>
  );
}

const KNOW_SECTIONS = [
  ['tuvi', 'Tử vi'],
  ['voice', 'Giọng bot'],
];

function KnowledgeModal({ settings, change, dirty, save, note, onClose }) {
  const [sec, setSec] = useState('tuvi');
  const filled = (v) => Boolean((v || '').trim());
  return (
    <Modal title="📚 Tri thức của bot" onClose={onClose} wide>
      <div className="navtabs" role="tablist" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {KNOW_SECTIONS.map(([id, label]) => (
          <button key={id} role="tab" className="navtab" aria-selected={sec === id} onClick={() => setSec(id)}>{label}</button>
        ))}
      </div>
      {note && <p className={`notice${note.err ? ' err' : ''}`} role="status">{note.text}</p>}

      {sec === 'tuvi' && (
        <KnowledgeBox
          id="tuvi"
          label="Kiến thức luận giải Tử Vi (không bắt buộc)"
          hint="Lá số do web tự an sao, bạn không cần nhập. Ô này dành cho cách luận riêng của bạn: ý nghĩa các sao, cách xem từng cung, những điều bạn muốn bot nhấn mạnh. Bot sẽ ưu tiên làm theo khi luận lá số. Để trống thì bot luận theo kiến thức Tử Vi phổ thông."
          value={settings.tuvi_knowledge}
          onChange={(v) => change('tuvi_knowledge', v)}
        />
      )}
      {sec === 'voice' && (
        <>
          <div className="field">
            <label htmlFor="persona">Giọng điệu và dặn dò thêm</label>
            <p className="hint">Tên bot, cách xưng hô, phong cách nói chuyện, những điều bạn muốn bot luôn làm hoặc không làm. Áp dụng cho tư vấn tử vi.</p>
            <textarea id="persona" value={settings.persona} onChange={(e) => change('persona', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="disc">Câu nhắc cuối mỗi bài luận đầy đủ</label>
            <p className="hint">Bot thêm câu này sau bài luận đầy đủ để khách hiểu đây là nội dung tham khảo.</p>
            <input id="disc" type="text" value={settings.disclaimer} onChange={(e) => change('disclaimer', e.target.value)} />
          </div>
        </>
      )}

      <div className="modalfoot">
        <span className="muted" style={{ fontSize: 14 }}>
          {dirty ? 'Có thay đổi chưa lưu' : `Đã lưu · tử vi ${filled(settings.tuvi_knowledge) ? '✓' : '–'}`}
        </span>
        <button className="btn" onClick={save} disabled={!dirty}>{dirty ? 'Lưu thay đổi' : 'Đã lưu'}</button>
      </div>
    </Modal>
  );
}

/* ---------- Cài đặt câu mở đầu + kho ảnh ---------- */
function OpeningModal({ pw, settings, change, dirty, save, note, onMediaDeleted, onClose }) {
  const [media, setMedia] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const selected = parseList(settings.opening_images).map(String);
  const messages = parseList(settings.opening_messages).map(String);
  const setSelected = (arr) => change('opening_images', JSON.stringify(arr));
  const setMessages = (arr) => change('opening_messages', JSON.stringify(arr));

  const load = useCallback(async () => {
    try { setMedia((await api('/api/admin/media', pw)).media); } catch (e) { setMsg({ text: e.message, err: true }); }
  }, [pw]);
  useEffect(() => { load(); }, [load]);

  function toggle(id) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  function move(id, dir) {
    const i = selected.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    setSelected(next);
  }

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    let ok = 0;
    for (const f of files) {
      try {
        const img = await shrinkImage(f, 1600, 0.9);
        await api('/api/admin/media', pw, { method: 'POST', body: JSON.stringify({ name: f.name, mime: img.mime, data: img.data }) });
        ok += 1;
      } catch (x) {
        setMsg({ text: `Không tải được "${f.name}": ${x.message}`, err: true });
      }
    }
    if (ok) setMsg((m) => m || { text: `Đã tải lên ${ok} ảnh. Bấm vào ảnh để chọn gửi cho khách.` });
    await load();
    setBusy(false);
  }

  async function removeMedia(id) {
    if (!confirm('Xoá ảnh này khỏi kho?')) return;
    try {
      await api(`/api/admin/media?id=${encodeURIComponent(id)}`, pw, { method: 'DELETE' });
      onMediaDeleted(id);
      load();
    } catch (x) { setMsg({ text: x.message, err: true }); }
  }

  return (
    <Modal title="⚙️ Câu mở đầu cho khách mới" onClose={onClose} wide>
      {note && <p className={`notice${note.err ? ' err' : ''}`} role="status">{note.text}</p>}
      {msg && <p className={`notice${msg.err ? ' err' : ''}`} role="status">{msg.text}</p>}

      <div className="field">
        <label className="switch">
          <input type="checkbox" checked={settings.birth_form_web !== '0'} onChange={e=>change('birth_form_web',e.target.checked?'1':'0')} />
          Hiện nút mở phiếu web
        </label>
        <p className="hint">Tắt thì bot không gửi nút phiếu, khách nhắn thông tin bằng tin nhắn ngay trong Messenger (công tắc 📝 trên đầu trang cũng bật/tắt mục này).</p>
        <label htmlFor="birth-intro">Lời mời điền phiếu lập lá số</label>
        <textarea id="birth-intro" value={settings.birth_form_message || ''} onChange={e=>change('birth_form_message',e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="chart-wait">Câu báo khách đợi khi đã nhận đủ thông tin</label>
        <textarea id="chart-wait" rows={2} value={settings.chart_wait_message || ''} onChange={e=>change('chart_wait_message',e.target.value)} />
        <label htmlFor="chart-delay" style={{marginTop:10}}>Giả chat bao nhiêu giây trước khi gửi ảnh lá số</label>
        <input id="chart-delay" type="number" min="0" max="30" value={settings.chart_delay_seconds ?? '10'} onChange={e=>change('chart_delay_seconds',e.target.value)} />
        <p className="hint">Bot nhắn câu báo đợi, hiện "đang gõ" đúng số giây này rồi mới gửi ảnh. Đặt 0 để gửi ngay. Tối đa 30 giây.</p>
      </div>
      <div className="field">
        <label htmlFor="free-questions">Số lượt hỏi thêm khi xem năm miễn phí</label>
        <input id="free-questions" type="number" min="0" max="50" value={settings.free_answer_limit} onChange={e=>change('free_answer_limit',e.target.value)} />
      </div>

      <div className="field">
        <label>Kho ảnh</label>
        <p className="hint">Bấm vào ảnh để chọn gửi. Số trên ảnh là thứ tự gửi, dùng nút ◀ ▶ để đổi chỗ. Ảnh không chọn thì không gửi.</p>
        <div className="row" style={{ marginTop: 0, marginBottom: 10 }}>
          <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>{busy ? 'Đang tải lên...' : '+ Tải ảnh lên'}</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={upload} />
          <span className="count">{selected.length} ảnh được chọn</span>
        </div>
        {media === null && <p className="muted">Đang tải...</p>}
        {media && media.length === 0 && <p className="empty" style={{ padding: 20 }}>Kho ảnh còn trống. Bấm "+ Tải ảnh lên" để thêm.</p>}
        <div className="mediagrid">
          {media && media.map((m) => {
            const pos = selected.indexOf(m.id);
            const on = pos >= 0;
            return (
              <div key={m.id} className={`mcard${on ? ' sel' : ''}`}>
                <button className="mthumb" onClick={() => toggle(m.id)} aria-pressed={on} aria-label={on ? `Bỏ chọn ảnh, đang là ảnh số ${pos + 1}` : 'Chọn ảnh này để gửi'}>
                  <img src={`/api/media/${m.id}`} alt={m.name || 'Ảnh trong kho'} loading="lazy" />
                  {on && <span className="badge">{pos + 1}</span>}
                </button>
                <div className="mrow">
                  {on ? (
                    <>
                      <button className="btn ghost small" onClick={() => move(m.id, -1)} disabled={pos === 0} aria-label="Gửi sớm hơn">◀</button>
                      <button className="btn ghost small" onClick={() => move(m.id, 1)} disabled={pos === selected.length - 1} aria-label="Gửi muộn hơn">▶</button>
                    </>
                  ) : <span className="muted" style={{ fontSize: 13 }}>Chưa chọn</span>}
                  <button className="btn danger small" onClick={() => removeMedia(m.id)} style={{ marginLeft: 'auto' }}>Xoá</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label>Các câu mở đầu</label>
        <p className="hint">Gửi lần lượt từng câu theo thứ tự bên dưới, sau khi đã gửi xong các ảnh. Thêm nhiều câu nếu muốn tách thành nhiều tin nhắn.</p>
        {messages.length === 0 && <p className="muted">Chưa có câu mở đầu nào.</p>}
        {messages.map((m, i) => (
          <div className="openrow" key={i}>
            <span className="badge plain">{i + 1}</span>
            <textarea
              value={m}
              aria-label={`Câu mở đầu số ${i + 1}`}
              placeholder="Ví dụ: Chào bạn! Bạn gửi họ tên, giới tính, ngày sinh và giờ sinh để mình lập lá số tử vi nhé."
              onChange={(e) => setMessages(messages.map((x, j) => (j === i ? e.target.value : x)))}
              style={{ minHeight: 84 }}
            />
            <div className="openbtns">
              <button className="btn ghost small" onClick={() => { if (i > 0) { const n = [...messages]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setMessages(n); } }} disabled={i === 0} aria-label="Đưa lên trên">▲</button>
              <button className="btn ghost small" onClick={() => { if (i < messages.length - 1) { const n = [...messages]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setMessages(n); } }} disabled={i === messages.length - 1} aria-label="Đưa xuống dưới">▼</button>
              <button className="btn danger small" onClick={() => setMessages(messages.filter((_, j) => j !== i))} aria-label="Xoá câu này">✕</button>
            </div>
          </div>
        ))}
        <div className="row"><button className="btn ghost" onClick={() => setMessages([...messages, ''])}>+ Thêm câu mở đầu</button></div>
      </div>

      <div className="modalfoot">
        <span className="muted" style={{ fontSize: 14 }}>{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
        <button className="btn" onClick={save} disabled={!dirty}>{dirty ? 'Lưu thay đổi' : 'Đã lưu'}</button>
      </div>
    </Modal>
  );
}

/* ---------- 💰 Thu phí xem tử vi ---------- */
function PaywallModal({ pw, settings, change, dirty, save, note, onClose }) {
  const [uploading,setUploading] = useState('');
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const busy = Boolean(uploading || saving);
  async function upload(key,file) {
    if (!file) return;
    setUploading(key); setError('');
    try {
      const image = await shrinkImage(file,1600,0.92);
      const {id} = await api('/api/admin/media',pw,{method:'POST',body:JSON.stringify({name:file.name,mime:image.mime,data:image.data})});
      change(key,'/api/media/'+id);
    } catch(e) { setError(e.message); }
    finally { setUploading(''); }
  }
  function imageField(key,label) {
    const src = settings[key];
    return <div className="package-upload" key={key}>
      <div><strong>{label}</strong>
        <label className="upload-control">
          <span>{uploading===key ? 'Đang tải ảnh…' : src ? 'Thay ảnh' : 'Tải ảnh lên'}</span>
          <input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={e=>{const file=e.target.files[0];e.target.value='';upload(key,file);}} />
        </label>
        {src && <button type="button" className="remove-photo" disabled={busy} onClick={()=>change(key,'')}>Gỡ ảnh</button>}
      </div>
      {src && <img src={src} alt={label} />}
    </div>;
  }
  async function submit(e) {
    e.preventDefault(); setError(''); setSaving(true);
    try { await save(); } finally { setSaving(false); }
  }
  return (
    <Modal title="Thu phí xem tử vi" onClose={()=>{if (!busy) onClose();}} wide>
      <form className="billing-form" onSubmit={submit}>
        <fieldset><legend>Chế độ xem</legend>
          <div className="billing-modes">
            {[
              ['free','Miễn phí xem năm','Khách được xem năm tới, trả phí khi chọn xem trọn đời.'],
              ['paid','Thu phí cả hai gói','Khách nhận lá số, chọn gói và thanh toán trước khi xem.']
            ].map(([value,title,description])=><label key={value}>
              <input type="radio" name="annual-mode" value={value} checked={settings.annual_mode===value} onChange={()=>change('annual_mode',value)} />
              <span><strong>{title}</strong><small>{description}</small></span>
            </label>)}
          </div>
        </fieldset>
        <fieldset><legend>Giá gói xem</legend>
          <div className="billing-prices">{[['pay_amount','Trọn đời'],['annual_amount','Xem năm']].map(([key,label])=>
            <label key={key}>{label} (đ)<input type="text" inputMode="numeric" value={settings[key] || ''}
              onChange={e=>change(key,e.target.value)} placeholder={key==='pay_amount'?'199.000':'99.000'} /></label>)}</div>
          {imageField('package_image_url','Ảnh giới thiệu các gói')}
        </fieldset>
        <fieldset><legend>Tài khoản nhận tiền</legend>
          <label>Tên người nhận<input value={settings.receipt_recipient || ''} onChange={e=>change('receipt_recipient',e.target.value)} placeholder="Tên hiển thị trên biên lai" /></label>
          <p className="hint">Số tiền cần khớp theo gói: trọn đời {settings.pay_amount || 'chưa đặt giá'}{settings.annual_mode==='paid' ? ' · xem năm '+(settings.annual_amount || 'chưa đặt giá') : ' · xem năm miễn phí'}. Khi tiền vào tài khoản, bạn mở gói trong hội thoại.</p>
          <details><summary>Thông tin chuyển khoản cho khách</summary>
            <label>Số tài khoản<input type="text" value={settings.receipt_account || ''} onChange={e=>change('receipt_account',e.target.value)} /></label>
            <label>Ngân hàng hoặc hướng dẫn chuyển khoản<textarea rows="2" value={settings.pay_info || ''} onChange={e=>change('pay_info',e.target.value)} /></label>
          </details>
          {imageField('qr_image_url','Mã QR gói trọn đời')}
          {imageField('annual_qr_url','Mã QR gói xem năm')}
        </fieldset>
        {error && <p className="notice err" role="alert">{error}</p>}
        {note && <p className={'notice'+(note.err?' err':'')} role="status">{note.text}</p>}
        <div className="modalfoot">
          <span className="muted">{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
          <button type="submit" className="btn" disabled={!dirty || busy}>{saving?'Đang lưu…':'Lưu thay đổi'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- 🌳 Cây chủ đề ---------- */
const newNodeId = () => 'n' + Math.random().toString(36).slice(2, 8);
const blankNode = (label = '', prompt = '') => ({ id: newNodeId(), label, prompt, answer: '', locked: false, price: '', qr: '', intro_image: '', ai_next: false, children: [] });
function parseTree(value) {
  try { const v = JSON.parse(value || ''); if (v && Array.isArray(v.nodes)) return { ...DEFAULT_TREE, ...v, bundle: { ...DEFAULT_TREE.bundle, ...(v.bundle || {}) } }; } catch { /* dùng cây mẫu */ }
  return DEFAULT_TREE;
}
function mapAt(nodes, path, fn) {
  const [i, ...rest] = path;
  return nodes.map((n, k) => (k !== i ? n : rest.length ? { ...n, children: mapAt(n.children || [], rest, fn) } : fn(n)));
}
function removeAt(nodes, path) {
  const [i, ...rest] = path;
  if (!rest.length) return nodes.filter((_, k) => k !== i);
  return nodes.map((n, k) => (k !== i ? n : { ...n, children: removeAt(n.children || [], rest) }));
}
function moveAt(nodes, path, dir) {
  const [i, ...rest] = path;
  if (rest.length) return nodes.map((n, k) => (k !== i ? n : { ...n, children: moveAt(n.children || [], rest, dir) }));
  const j = i + dir;
  if (j < 0 || j >= nodes.length) return nodes;
  const next = [...nodes];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
function appendAt(nodes, path, items) {
  if (!path.length) return [...nodes, ...items];
  const [i, ...rest] = path;
  return nodes.map((n, k) => (k !== i ? n : rest.length ? { ...n, children: appendAt(n.children || [], rest, items) } : { ...n, ai_next: false, children: [...(n.children || []), ...items] }));
}

function TreeNodeEditor({ node, path, count, ctl, lockedAbove = false }) {
  const key = path.join('.');
  const len = Array.from(node.label || '').length;
  const leaf = !(node.children || []).length;
  const last = path[path.length - 1];
  const open = ctl.isOpen(node.id);
  const kids = (node.children || []).length;
  const countLocked = (list) => (list || []).reduce((t, c) => t + (c.locked ? 1 : 0) + countLocked(c.children), 0);
  const lockedBelow = countLocked(node.children);
  const warns = [];
  if (!String(node.label || '').trim()) warns.push('chưa có chữ trên nút');
  if (len > 20) warns.push('chữ dài quá 20 ký tự');
  if (node.locked && !/\d/.test(String(node.price || ''))) warns.push('khóa nhưng chưa có giá');
  return (
    <div className={`tnode d${Math.min(path.length, 4)}${open ? ' is-open' : ''}${node.locked ? ' is-locked' : ''}`}>
      <div className="tnode-bar">
        <span className={`lockslot${node.locked ? ' on' : lockedAbove ? ' inherit' : ''}`}
          title={node.locked ? 'Mục này đang KHÓA' : lockedAbove ? 'Khóa theo mục cha: khách trả tiền mục cha thì mở luôn mục này' : ''}
          aria-label={node.locked ? 'Mục khóa' : lockedAbove ? 'Khóa theo mục cha' : undefined}>
          {node.locked || lockedAbove ? '🔒' : ''}
        </span>
        <button type="button" className="tnode-main" onClick={() => ctl.toggle(node.id)} aria-expanded={open} aria-label={`${open ? 'Thu gọn' : 'Mở để sửa'} nút ${node.label || ''}`}>
          <span className="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="ttitle">{node.label || '(chưa đặt tên)'}</span>
          {node.locked && <span className="badge lock">🔒 {node.price || '?'}</span>}
          {lockedBelow > 0 && <span className="badge lock" title="Số mục con đang khóa">🔒 {lockedBelow} mục con</span>}
          {node.qr && <span className="badge" title="Đã có ảnh QR">QR</span>}
          {node.intro_image && <span className="badge" title="Đã có ảnh giới thiệu">🖼</span>}
          {node.answer && <span className="badge" title="Có câu trả lời cố định">📝</span>}
          {leaf && node.ai_next && <span className="badge" title="AI gợi ý câu hỏi tiếp">✨</span>}
          <span className="badge muted">{kids ? `${kids} nút con` : 'cuối nhánh'}</span>
          {warns.length > 0 && <span className="badge warn" title={warns.join('; ')}>⚠️ {warns[0]}</span>}
        </button>
        <button className="btn ghost small" onClick={() => ctl.move(path, -1)} disabled={last === 0} aria-label="Đưa lên">▲</button>
        <button className="btn ghost small" onClick={() => ctl.move(path, 1)} disabled={last === count - 1} aria-label="Đưa xuống">▼</button>
        <button className="btn danger small" onClick={() => ctl.remove(path)} aria-label="Xoá nút này">✕</button>
      </div>
      {open && (
        <div className="tnode-body">
          <div className="tnode-head">
            <input type="text" value={node.label} aria-label="Chữ trên nút" placeholder="Chữ trên nút (tối đa 20 ký tự)"
              onChange={(e) => ctl.update(path, { label: e.target.value })} />
            <span className={`count${len > 20 ? ' over' : ''}`}>{len}/20</span>
          </div>
          <textarea value={node.prompt} rows={2} aria-label="Dặn AI luận gì khi khách bấm nút này" placeholder="Dặn AI luận gì khi khách bấm nút này (ví dụ: xem cung Tài Bạch, nói về cách giữ tiền)"
            onChange={(e) => ctl.update(path, { prompt: e.target.value })} />
          <details>
            <summary>Câu trả lời cố định (không bắt buộc)</summary>
            <p className="hint">Điền thì bot gửi đúng nội dung này, không nhờ AI viết. Để trống thì AI luận theo lá số của khách.</p>
            <textarea value={node.answer} rows={3} aria-label="Câu trả lời cố định" onChange={(e) => ctl.update(path, { answer: e.target.value })} />
          </details>
          <div className="row">
            <label className="switch">
              <input type="checkbox" checked={node.locked} onChange={(e) => ctl.update(path, { locked: e.target.checked })} />
              🔒 Khóa, khách trả tiền mới xem
            </label>
            {leaf && (
              <label className="switch">
                <input type="checkbox" checked={node.ai_next} onChange={(e) => ctl.update(path, { ai_next: e.target.checked })} />
                AI gợi ý câu hỏi tiếp cho khách
              </label>
            )}
          </div>
          {node.locked && (
            <div className="row lockrow">
              <input type="text" inputMode="numeric" className="priceinput" value={node.price} placeholder="Giá, ví dụ 99.000" aria-label="Giá của mục này"
                onChange={(e) => ctl.update(path, { price: e.target.value })} />
              <label className="upload-control">
                <span>{ctl.busy === 'q:' + key ? 'Đang tải…' : node.qr ? 'Thay QR' : 'Tải QR lên'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ảnh mã QR của mục này" disabled={Boolean(ctl.busy)}
                  onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; ctl.uploadImage(path, 'qr', 'q:', f); }} />
              </label>
              {node.qr && <img className="qrthumb" src={node.qr} alt="Mã QR của mục này" />}
              {node.qr && <button className="remove-photo" type="button" onClick={() => ctl.update(path, { qr: '' })}>Gỡ QR</button>}
              <label className="upload-control">
                <span>{ctl.busy === 'i:' + key ? 'Đang tải…' : node.intro_image ? 'Thay ảnh giới thiệu' : 'Tải ảnh giới thiệu gói'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ảnh giới thiệu gói của mục này" disabled={Boolean(ctl.busy)}
                  onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; ctl.uploadImage(path, 'intro_image', 'i:', f); }} />
              </label>
              {node.intro_image && <img className="qrthumb" src={node.intro_image} alt="Ảnh giới thiệu gói của mục này" />}
              {node.intro_image && <button className="remove-photo" type="button" onClick={() => ctl.update(path, { intro_image: '' })}>Gỡ ảnh giới thiệu</button>}
            </div>
          )}
          <div className="row">
            {path.length < 4 && <button className="btn ghost small" onClick={() => ctl.add(path, [blankNode()])}>+ Thêm nút con</button>}
            {path.length < 4 && <button className="btn ghost small" onClick={() => ctl.suggest(path)} disabled={Boolean(ctl.busy)}>{ctl.busy === 's:' + key ? 'AI đang nghĩ…' : '✨ AI gợi ý nút con'}</button>}
          </div>
        </div>
      )}
      {kids > 0 && (
        <div className="tnode-kids">
          {node.children.map((c, i) => (
            <TreeNodeEditor key={c.id} node={c} path={[...path, i]} count={node.children.length} ctl={ctl} lockedAbove={lockedAbove || node.locked} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeModal({ pw, settings, change, dirty, save, note, pages, onPagesChanged, onClose }) {
  const tree = parseTree(settings.tree_data);
  const nodes = tree.nodes;
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const setTree = (next) => change('tree_data', JSON.stringify(next));
  // Luôn lấy cây mới nhất lúc ảnh tải xong, để không ghi đè các chỗ bạn vừa sửa trong lúc chờ tải
  const treeRef = useRef(tree);
  treeRef.current = tree;
  // Nút nào đang mở phần sửa (mặc định thu gọn hết cho dễ nhìn cả cây)
  const [openIds, setOpenIds] = useState(() => new Set());
  const allIds = (list) => list.flatMap((n) => [n.id, ...allIds(n.children || [])]);

  async function upload(file) {
    const image = await shrinkImage(file, 1600, 0.92);
    const { id } = await api('/api/admin/media', pw, { method: 'POST', body: JSON.stringify({ name: file.name, mime: image.mime, data: image.data }) });
    return '/api/media/' + id;
  }
  const ctl = {
    busy,
    isOpen: (id) => openIds.has(id),
    toggle: (id) => setOpenIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    openAll: () => setOpenIds(new Set(allIds(treeRef.current.nodes))),
    closeAll: () => setOpenIds(new Set()),
    update: (path, patch) => { const t = treeRef.current; setTree({ ...t, nodes: mapAt(t.nodes, path, (n) => ({ ...n, ...patch })) }); },
    remove: (path) => { if (confirm('Xoá nút này và các nút con của nó?')) setTree({ ...tree, nodes: removeAt(nodes, path) }); },
    move: (path, dir) => setTree({ ...tree, nodes: moveAt(nodes, path, dir) }),
    add: (path, items) => { setTree({ ...tree, nodes: appendAt(nodes, path, items) }); setOpenIds((prev) => new Set([...prev, ...items.map((x) => x.id)])); },
    async uploadImage(path, field, prefix, file) {
      if (!file) return;
      setBusy(prefix + path.join('.')); setMsg(null);
      try { const url = await upload(file); ctl.update(path, { [field]: url }); } catch (e) { setMsg({ text: e.message, err: true }); } finally { setBusy(''); }
    },
    async suggest(path) {
      setBusy('s:' + path.join('.')); setMsg(null);
      const labels = []; let cur = nodes;
      for (const i of path) { labels.push(cur[i].label); cur = cur[i].children || []; }
      try {
        const d = await api('/api/admin/tree-suggest', pw, { method: 'POST', body: JSON.stringify({ path: labels, existing: cur.map((n) => n.label), count: 4 }) });
        setTree({ ...tree, nodes: appendAt(nodes, path, d.items.map((x) => blankNode(x.label, x.prompt))) });
        setMsg({ text: `AI đã thêm ${d.items.length} nút gợi ý. Bạn sửa lại chữ cho hợp ý rồi bấm Lưu thay đổi.` });
      } catch (e) { setMsg({ text: e.message, err: true }); } finally { setBusy(''); }
    },
  };
  async function setMode(p, on) {
    try { await api('/api/admin/pages', pw, { method: 'PATCH', body: JSON.stringify({ page_id: p.page_id, tree_mode: on }) }); onPagesChanged(); }
    catch (e) { setMsg({ text: e.message, err: true }); }
  }

  return (
    <Modal title="🌳 Chế độ cây chủ đề" onClose={onClose} wide>
      <p className="hint">Sau khi khách nhận lá số, bot hiện các nút chủ đề. Khách bấm nút nào thì bot luận mục đó rồi hiện các nút con. Mục có khóa 🔒 thì khách trả tiền riêng cho mục đó, bạn xác nhận trong hội thoại để mở.</p>
      {note && <p className={`notice${note.err ? ' err' : ''}`} role="status">{note.text}</p>}
      {msg && <p className={`notice${msg.err ? ' err' : ''}`} role="status">{msg.text}</p>}

      <fieldset className="treebox"><legend>Chế độ cho từng Fanpage</legend>
        {pages.length === 0 && <p className="muted">Chưa có Fanpage nào được thêm. Bấm “+ Thêm page” trước nhé.</p>}
        {pages.map((p) => (
          <div className="listrow" key={p.page_id}>
            <Avatar src={p.pic} name={p.name} small />
            <div className="t"><strong>{p.name}</strong></div>
            <label className="switch"><input type="radio" name={'mode-' + p.page_id} checked={!p.tree_mode} onChange={() => setMode(p, false)} /> Chế độ cũ</label>
            <label className="switch"><input type="radio" name={'mode-' + p.page_id} checked={Boolean(p.tree_mode)} onChange={() => setMode(p, true)} /> Cây chủ đề</label>
          </div>
        ))}
        <p className="hint">Đổi chế độ có hiệu lực ngay. Khách đã mua hoặc đang chờ xác nhận tiền ở chế độ cũ vẫn được xử lý theo chế độ cũ.</p>
      </fieldset>

      <div className="field">
        <label htmlFor="tree-intro">Câu nhắn hiện cùng các nút gốc (ngay sau khi gửi lá số)</label>
        <p className="hint">Dùng {'{name}'} để chèn tên khách.</p>
        <textarea id="tree-intro" value={tree.intro} onChange={(e) => setTree({ ...tree, intro: e.target.value })} />
      </div>

      <div className="field">
        <label>Các nút chủ đề</label>
        <p className="hint">Mỗi nút gốc là một chủ đề. Nút con hiện sau khi khách bấm nút cha. Messenger chỉ cho chữ trên nút tối đa 20 ký tự và tối đa 13 nút mỗi lần.</p>
        <div className="row treebar">
          <button className="btn ghost small" onClick={ctl.openAll}>Mở hết</button>
          <button className="btn ghost small" onClick={ctl.closeAll}>Thu gọn hết</button>
          <span className="muted" style={{ fontSize: 13 }}>Bấm vào một dòng để sửa. 🔒 ngoài dòng = mục khóa (mờ = khóa theo mục cha) · QR đã có ảnh QR · 🖼 có ảnh giới thiệu · 📝 có câu trả lời cố định · ✨ AI gợi ý tiếp</span>
        </div>
        {(() => {
          const anyLocked = (list) => (list || []).some((n) => n.locked || anyLocked(n.children));
          const noRecipient = !String(settings.receipt_recipient || '').trim();
          return anyLocked(nodes) && noRecipient ? (
            <p className="hint" style={{ color: '#c0392b', fontWeight: 600 }}>
              Có mục khóa nhưng chưa điền <u>Tên người nhận</u> trong 💰. Chưa có tên này thì khách bấm mục khóa sẽ nhận câu "chờ chủ shop bổ sung thông tin thanh toán", dù bạn đã tải mã QR. Bấm 💰, điền Tên người nhận (đúng như trên biên lai) rồi lưu.
            </p>
          ) : null;
        })()}
        {nodes.map((n, i) => <TreeNodeEditor key={n.id} node={n} path={[i]} count={nodes.length} ctl={ctl} />)}
        <div className="row">
          <button className="btn ghost" onClick={() => ctl.add([], [blankNode()])}>+ Thêm nút gốc</button>
          <button className="btn ghost" onClick={() => ctl.suggest([])} disabled={Boolean(busy)}>{busy === 's:' ? 'AI đang nghĩ…' : '✨ AI gợi ý nút gốc'}</button>
        </div>
      </div>

      <fieldset className="treebox"><legend>Gói mở hết (không bắt buộc)</legend>
        <label className="switch">
          <input type="checkbox" checked={tree.bundle.on} onChange={(e) => setTree({ ...tree, bundle: { ...tree.bundle, on: e.target.checked } })} />
          Cho khách mua một lần để mở tất cả các mục khóa
        </label>
        {tree.bundle.on && (
          <div className="row">
            <input type="text" value={tree.bundle.label} aria-label="Tên gói" maxLength={16} onChange={(e) => setTree({ ...tree, bundle: { ...tree.bundle, label: e.target.value } })} />
            <input type="text" inputMode="numeric" className="priceinput" value={tree.bundle.price} placeholder="Giá, ví dụ 199.000" aria-label="Giá gói mở hết"
              onChange={(e) => setTree({ ...tree, bundle: { ...tree.bundle, price: e.target.value } })} />
            <label className="upload-control">
              <span>{busy === 'q:bundle' ? 'Đang tải…' : tree.bundle.qr ? 'Thay QR' : 'Tải QR lên'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ảnh mã QR gói mở hết" disabled={Boolean(busy)}
                onChange={async (e) => {
                  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
                  setBusy('q:bundle'); setMsg(null);
                  try { const qr = await upload(f); const t = treeRef.current; setTree({ ...t, bundle: { ...t.bundle, qr } }); } catch (x) { setMsg({ text: x.message, err: true }); } finally { setBusy(''); }
                }} />
            </label>
            {tree.bundle.qr && <img className="qrthumb" src={tree.bundle.qr} alt="Mã QR gói mở hết" />}
            <label className="upload-control">
              <span>{busy === 'i:bundle' ? 'Đang tải…' : tree.bundle.intro_image ? 'Thay ảnh giới thiệu' : 'Tải ảnh giới thiệu gói'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ảnh giới thiệu gói mở hết" disabled={Boolean(busy)}
                onChange={async (e) => {
                  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
                  setBusy('i:bundle'); setMsg(null);
                  try { const url = await upload(f); const t = treeRef.current; setTree({ ...t, bundle: { ...t.bundle, intro_image: url } }); } catch (x) { setMsg({ text: x.message, err: true }); } finally { setBusy(''); }
                }} />
            </label>
            {tree.bundle.intro_image && <img className="qrthumb" src={tree.bundle.intro_image} alt="Ảnh giới thiệu gói mở hết" />}
            {tree.bundle.intro_image && <button className="remove-photo" type="button" onClick={() => { const t = treeRef.current; setTree({ ...t, bundle: { ...t.bundle, intro_image: '' } }); }}>Gỡ ảnh giới thiệu</button>}
          </div>
        )}
      </fieldset>

      <fieldset className="treebox"><legend>Thanh toán</legend>
        <p className="hint">Tên người nhận, số tài khoản và ngân hàng nhập ở mục 💰 Thu phí xem tử vi. Mục khóa không tải QR riêng thì bot tự tạo QR nếu bạn điền mã ngân hàng bên dưới.</p>
        <label className="label" htmlFor="bank-code">Mã ngân hàng để tự tạo QR (không bắt buộc)</label>
        <input id="bank-code" type="text" value={settings.tree_bank_code || ''} maxLength={12} placeholder="Ví dụ: MB, VCB, TCB, ACB"
          onChange={(e) => change('tree_bank_code', e.target.value)} />
        <label className="label" htmlFor="tree-offer" style={{ marginTop: 12 }}>Lời mời chuyển khoản khi khách bấm mục khóa</label>
        <p className="hint">Dùng {'{label}'} (tên mục), {'{name}'}, {'{payinfo}'} (số tiền, người nhận, nội dung chuyển khoản).</p>
        <textarea id="tree-offer" value={settings.tree_offer_message || ''} onChange={(e) => change('tree_offer_message', e.target.value)} />
        <label className="label" htmlFor="tree-paid" style={{ marginTop: 12 }}>Lời nhắn khi bạn xác nhận đã nhận tiền</label>
        <textarea id="tree-paid" value={settings.tree_paid_message || ''} onChange={(e) => change('tree_paid_message', e.target.value)} />
      </fieldset>

      <div className="modalfoot">
        <span className="muted" style={{ fontSize: 14 }}>{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
        <button className="btn" onClick={save} disabled={!dirty}>{dirty ? 'Lưu thay đổi' : 'Đã lưu'}</button>
      </div>
    </Modal>
  );
}

/* ---------- Thử bot ---------- */
function TestView({ pw, dirty, pageFilter, pages }) {
  const [log, setLog] = useState([]);
  const [text, setText] = useState('');
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [useTree, setUseTree] = useState(() => Boolean(pages.find((p) => p.page_id === pageFilter)?.tree_mode));
  const fileRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [log, busy]);

  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { setImg(await shrinkImage(f)); setErr(''); } catch (x) { setErr(x.message); }
  }

  async function send(override) {
    const typed = typeof override === 'string' ? override : text;
    if (busy || (!typed.trim() && !img)) return;
    setLog((l) => [...l.filter((m) => !m.chips), { who: 'me', text: typed.trim(), preview: img && img.preview }]);
    setBusy(true);
    setErr('');
    const payload = { text: typed.trim(), image: img ? { mime: img.mime, data: img.data } : null, treeMode: useTree };
    setText('');
    setImg(null);
    try {
      const data = await api('/api/admin/test', pw, { method: 'POST', body: JSON.stringify(payload) });
      const add = [];
      if (data.opening) {
        for (const u of data.opening.images) add.push({ who: 'bot', text: '', preview: u, big: true });
        for (const m of data.opening.messages) add.push({ who: 'bot', text: m });
      }
      if (data.reply) add.push({ who: 'bot', text: data.reply, preview: data.imageUrl || null, big: Boolean(data.imageUrl) });
      for (const url of data.offerImages || []) add.push({who:'bot',text:'',preview:url,big:true});
      if (data.formUrl) add.push({who:'bot', formUrl:data.formUrl});
      if ((data.quickReplies || []).length) add.push({ chips: data.quickReplies });
      setLog((l) => [...l, ...add]);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    try { await api('/api/admin/conversations?psid=admin-test', pw, { method: 'DELETE' }); } catch { /* bỏ qua */ }
    setLog([]);
    setErr('');
  }

  return (
    <div className="content">
      <div className="savebar"><h2>Thử bot</h2></div>
      {dirty && <p className="notice">Bạn cần bấm "Lưu thay đổi" trong mục 📚 Tri thức thì bot mới dùng nội dung mới khi thử.</p>}
      <div className="chat" aria-live="polite">
        {log.length === 0 && !busy && <p className="empty">Nhắn “xem tử vi” để bắt đầu hoặc “xin phiếu” để mở phiếu lập lá số. Bật “Thử theo chế độ cây chủ đề” để thấy các nút bấm.</p>}
        {log.map((m, i) => m.chips ? (
          <div key={i} className="chips" role="group" aria-label="Nút gợi ý của bot">
            {m.chips.map((c) => <button key={c} className="chip" disabled={busy} onClick={() => send(c)}>{c}</button>)}
          </div>
        ) : (
          <div key={i} className={`bubble ${m.who}`}>
            {m.preview && <img className={m.big ? 'laso' : ''} src={m.preview} alt={m.big ? 'Ảnh bot gửi' : 'Ảnh đã gửi'} />}
            {m.text}
            {m.formUrl && <a href={m.formUrl} target="_blank" rel="noreferrer">Điền phiếu lập lá số</a>}
          </div>
        ))}
        {busy && <div className="bubble bot muted">Đang xem...</div>}
        <div ref={endRef} />
      </div>
      {err && <p className="notice err" role="alert" style={{ marginTop: 12 }}>{err}</p>}
      <div className="field" style={{ marginTop: 14 }}>
        <label className="switch"><input type="checkbox" checked={useTree} onChange={(e) => setUseTree(e.target.checked)} /> Thử theo chế độ cây chủ đề</label>
        <label htmlFor="t">Tin nhắn thử</label>
        <input id="t" type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ví dụ: Xem tử vi cho Nguyễn Văn A, Nam, 15/08/1995 dương lịch, giờ Thìn" />
        <div className="row">
          <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>{img ? 'Đổi ảnh' : 'Chọn ảnh'}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
          {img && <img src={img.preview} alt="Ảnh sẽ gửi" style={{ height: 40, borderRadius: 6 }} />}
          <button className="btn" onClick={() => send()} disabled={busy}>Gửi</button>
          <button className="btn ghost" onClick={reset}>Xoá hội thoại thử</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Trang chính ---------- */
export default function Home() {
  const [pw, setPw] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [settings, setSettings] = useState(null);
  const [view, setView] = useState('chat');
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState(null);
  const [loginErr, setLoginErr] = useState('');
  const [pages, setPages] = useState([]);
  const [envToken, setEnvToken] = useState(false);
  const [pageFilter, setPageFilter] = useState('');
  const [toggleBusy, setToggleBusy] = useState(false);
  const [pageMenu, setPageMenu] = useState(false);
  const [controlError, setControlError] = useState('');
  const [modal, setModal] = useState(null); // 'keys' | 'pages' | null

  const loadPages = useCallback(async (password) => {
    try {
      const d = await api('/api/admin/pages', password || pw);
      setPages(d.pages);
      setPageFilter(current => d.pages.some(p => p.page_id === current) ? current : (d.pages[0]?.page_id || ''));
      setEnvToken(d.envToken);
    } catch { /* bỏ qua */ }
  }, [pw]);

  async function tryLogin(password) {
    try {
      const data = await api('/api/admin/settings', password);
      sessionStorage.setItem('xt_pw', password);
      setPw(password);
      setSettings(data.settings);
      setLoginErr('');
      loadPages(password);
    } catch (e) {
      sessionStorage.removeItem('xt_pw');
      setLoginErr(e.message);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('xt_pw');
    if (saved) tryLogin(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  async function save() {
    try {
      await api('/api/admin/settings', pw, { method: 'PUT', body: JSON.stringify({ settings }) });
      setDirty(false);
      setNote({ text: 'Đã lưu. Bot dùng nội dung mới ngay từ tin nhắn kế tiếp.' });
    } catch (e) { setNote({ text: e.message, err: true }); }
  }

  async function closeKnowledge() {
    if (dirty) {
      if (!confirm('Bạn chưa lưu thay đổi. Đóng mà không lưu?')) return;
      try {
        const data = await api('/api/admin/settings', pw);
        setSettings(data.settings);
      } catch { /* giữ nguyên */ }
      setDirty(false);
    }
    setNote(null);
    setModal(null);
  }

  async function toggleBot(on) {
    setToggleBusy(true); setControlError('');
    const value = on ? '1' : '0';
    try {
      await api('/api/admin/settings', pw, {method:'PUT',body:JSON.stringify({settings:{bot_on:value}})});
      setSettings(s=>({...s,bot_on:value}));
    } catch(e) { setControlError(e.message); }
    finally { setToggleBusy(false); }
  }
  async function toggleForm() {
    setToggleBusy(true); setControlError('');
    const value = settings.birth_form_web === '0' ? '1' : '0';
    try {
      await api('/api/admin/settings', pw, {method:'PUT',body:JSON.stringify({settings:{birth_form_web:value}})});
      setSettings(s=>({...s,birth_form_web:value}));
    } catch(e) { setControlError(e.message); }
    finally { setToggleBusy(false); }
  }
  async function togglePage() {
    const page = pages.find(p=>p.page_id===pageFilter);
    if (!page) return;
    setToggleBusy(true); setControlError('');
    try {
      await api('/api/admin/pages',pw,{method:'PATCH',body:JSON.stringify({page_id:page.page_id,bot_on:!page.bot_on})});
      setPages(items=>items.map(p=>p.page_id===page.page_id?{...p,bot_on:!page.bot_on}:p));
    } catch(e) { setControlError(e.message); }
    finally { setToggleBusy(false); }
  }

  if (!settings) {
    return (
      <main className="login">
        <h1>Bot tử vi</h1>
        <label className="label" htmlFor="pw">Mật khẩu</label>
        <input id="pw" type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryLogin(pwInput)} autoFocus />
        {loginErr && <p className="notice err" role="alert" style={{ marginTop: 12 }}>{loginErr}</p>}
        <div className="row"><button className="btn" onClick={() => tryLogin(pwInput)}>Vào</button></div>
      </main>
    );
  }

  const selectedPage = pages.find(p=>p.page_id===pageFilter);
  const pagePicker = <div className="page-picker">
    <button className="page-selected" aria-expanded={pageMenu} aria-controls="page-options" onClick={()=>setPageMenu(v=>!v)}>
      <Avatar src={selectedPage?.pic} name={selectedPage?.name || 'Tất cả Fanpage'} small />
      <strong>{selectedPage?.name || 'Tất cả Fanpage'}</strong><span>▾</span>
    </button>
    {pageMenu && <div id="page-options" className="page-options" onKeyDown={e=>{if(e.key==='Escape')setPageMenu(false);}}>
      {[{page_id:'',name:'Tất cả Fanpage'},...pages].map(p=><button key={p.page_id} aria-pressed={pageFilter===p.page_id} onClick={()=>{setPageFilter(p.page_id);setPageMenu(false);}}>
        <Avatar src={p.pic} name={p.name} small /><span>{p.name}</span>{p.page_id && <small>{p.bot_on?'Bật':'Tắt'}</small>}
      </button>)}
      <button onClick={()=>{setModal('pages');setPageMenu(false);}}>＋ Quản lý Fanpage</button>
    </div>}
    {settings.bot_on === '0' && <p className="page-hint">Toàn bộ bot đang tắt, kể cả page có công tắc bật.</p>}
  </div>;
  const NAV = [['chat', 'Chat với khách'], ['test', 'Thử bot'], ['logs', 'Nhật ký']];

  return (
    <div className="app">
      <header className="bar">
        <h1>Hội thoại khách hàng</h1>
        <nav className="navtabs" role="tablist">
          {NAV.map(([id, label]) => (
            <button key={id} role="tab" className="navtab" aria-selected={view === id} onClick={() => { setView(id); setNote(null); }}>{label}</button>
          ))}
        </nav>
        <div className="bar-right">
          <button className={`botpill ${settings.bot_on !== '0' ? 'on' : 'off'}`} role="switch" aria-checked={settings.bot_on !== '0'} disabled={toggleBusy} onClick={()=>toggleBot(settings.bot_on === '0')}>🤖 Toàn bộ bot: {settings.bot_on !== '0' ? 'BẬT' : 'TẮT'}</button>
          <button className={`botpill ${selectedPage?.bot_on ? 'on' : 'off'}`} role="switch" aria-checked={Boolean(selectedPage?.bot_on)} disabled={toggleBusy || !selectedPage} onClick={togglePage} title={selectedPage ? `Bật/tắt bot cho ${selectedPage.name}` : 'Chọn một Fanpage trước'}>
            {selectedPage && <Avatar src={selectedPage.pic} name={selectedPage.name} small />}
            <span>{selectedPage?.name || 'Chưa chọn page'}: {selectedPage?.bot_on ? 'BẬT' : 'TẮT'}</span>
          </button>
          <button className={`botpill ${settings.birth_form_web !== '0' ? 'on' : 'off'}`} role="switch" aria-checked={settings.birth_form_web !== '0'} disabled={toggleBusy} onClick={toggleForm} title="Bật: bot gửi nút phiếu lập lá số. Tắt: khách nhắn thông tin bằng tay trong Messenger.">📝 Gửi phiếu: {settings.birth_form_web !== '0' ? 'BẬT' : 'TẮT'}</button>
          <button className="iconbtn" onClick={() => { setNote(null); setModal('paywall'); }} aria-label="Thu phí xem tử vi" title="Thu phí xem tử vi">💰</button>
          <button className="iconbtn" onClick={() => { setNote(null); setModal('tree'); }} aria-label="Chế độ cây chủ đề" title="Cây chủ đề">🌳</button>
          <button className="iconbtn" onClick={() => { setNote(null); setModal('opening'); }} aria-label="Cài đặt câu mở đầu và kho ảnh" title="Câu mở đầu">⚙️</button>
          <button className="iconbtn" onClick={() => { setNote(null); setModal('knowledge'); }} aria-label="Tri thức tử vi của bot" title="Tri thức">📚</button>
          <button className="iconbtn" onClick={() => setModal('keys')} aria-label="Nhập API của AI" title="API của AI">🔑</button>
          <button className="btn" onClick={() => setModal('pages')}>+ Thêm page</button>
        </div>
      </header>

      {controlError && <div className="notice err" role="alert">{controlError}</div>}
      <main className="main">
        {view === 'chat' && <ChatView key={pageFilter} pw={pw} settings={settings} pageFilter={pageFilter} pagePicker={pagePicker} />}
        {view === 'test' && <TestView key={pageFilter} pw={pw} dirty={dirty} pageFilter={pageFilter} pages={pages} />}
        {view === 'logs' && <LogView pw={pw} />}
      </main>

      {modal === 'knowledge' && <KnowledgeModal settings={settings} change={change} dirty={dirty} save={save} note={note} onClose={closeKnowledge} />}
      {modal === 'opening' && (
        <OpeningModal
          pw={pw}
          settings={settings}
          change={change}
          dirty={dirty}
          save={save}
          note={note}
          onMediaDeleted={(id) => setSettings((st) => ({ ...st, opening_images: JSON.stringify(parseList(st.opening_images).filter((x) => x !== id)) }))}
          onClose={closeKnowledge}
        />
      )}
      {modal === 'paywall' && <PaywallModal pw={pw} settings={settings} change={change} dirty={dirty} save={save} note={note} onClose={closeKnowledge} />}
      {modal === 'tree' && <TreeModal pw={pw} settings={settings} change={change} dirty={dirty} save={save} note={note} pages={pages} onPagesChanged={() => loadPages()} onClose={closeKnowledge} />}
      {modal === 'keys' && <KeysModal pw={pw} onClose={() => setModal(null)} />}
      {modal === 'pages' && <PagesModal pw={pw} pages={pages} envToken={envToken} onClose={() => setModal(null)} onChanged={() => loadPages()} />}
    </div>
  );
}
