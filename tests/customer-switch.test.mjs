process.env.CHAT_PACING_OFF='1';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../lib/defaults.js';
// Legacy conversation fixtures from before the two-package checkout.
DEFAULT_SETTINGS.year_sales_on='0';
import { handleEvent } from '../lib/incoming.js';
import { PATCH } from '../app/api/admin/conversations/route.js';
import { deliveryGuard } from '../lib/db.js';
import { withBotRun, ConversationPaused } from '../lib/bot-run.js';
import { sendChatText } from '../lib/messenger.js';

process.env.DATABASE_URL = 'postgres://test:test@fixture/db';
process.env.ADMIN_PASSWORD = 'test';
const customers = new Map();
const received = new Set();
const inbound = [];
const traffic = [];
let mid = 0;
let globalOn = true;
const key = (page,id) => page + '/' + id;
function customer(page,id) {
  const k=key(page,id);
  if (!customers.has(k)) customers.set(k,{page_id:page,psid:id,customer_bot_on:true,bot_revision:0,changed:0});
  return customers.get(k);
}
const a=customer('one','A');
const b=customer('one','B');
const otherPage=customer('two','A');
function patch(c,enabled,password='test') {
  return PATCH(new Request('http://localhost/api/admin/conversations',{method:'PATCH',
    headers:{'x-admin-password':password,'Content-Type':'application/json'},
    body:JSON.stringify({page_id:c.page_id,psid:c.psid,enabled})}));
}
function event(c,text='') {
  return {sender:{id:c.psid},recipient:{id:c.page_id},timestamp:Date.now()+1,
    message:{mid:String(++mid),text}};
}
let afterText;
let slowAI=false;
let aiCalls=0;
globalThis.fetch=async (url,opt)=>{
  const body=JSON.parse(opt.body);
  if(String(url).includes('generativelanguage.googleapis.com')) {
    assert.ok(slowAI);
    aiCalls++;
    await patch(a,false);
    await patch(a,true);
    return Response.json({candidates:[{content:{parts:[{text:'Bài luận đang soạn.'}]}}]});
  }
  if(String(url).includes('graph.facebook.com')) {
    traffic.push(body);
    if(body.message?.text && afterText) { const fn=afterText; afterText=null; await fn(); }
    return new Response('{}');
  }
  const q=body.query.replace(/\s+/g,' ').trim(), p=body.params;
  let rows=[];
  if(q.startsWith('UPDATE conversations SET customer_bot_on')) {
    const c=customers.get(key(p.at(-2),p.at(-1)));
    if(c){
      const enabled=p[0]==='true';
      if(c.customer_bot_on!==enabled) {c.bot_revision++;c.changed=Date.now();}
      c.customer_bot_on=enabled;rows=[c];
    }
  } else if(q.startsWith('WITH customer AS')) {
    const c=customer(p[0],p[1]);
    if(!received.has(p[5])) {
      received.add(p[5]);inbound.push([c.psid,p[11]]);
      rows=[{name:'Guest',id:mid,bot_revision:c.bot_revision,permitted:c.customer_bot_on && (!p[2] || p[2]*1000>=c.changed)}];
    }
  } else if(q.startsWith('SELECT 1 FROM conversations c')) {
    const c=customers.get(key(p[0],p[1]));
    if(globalOn && c?.customer_bot_on && String(c.bot_revision)===String(p[2]))rows=[{allowed:1}];
  } else if(q.includes('FROM pages WHERE page_id')) rows=[{token:'stub',bot_on:true}];
  else if(q.startsWith('SELECT face_summary'))rows=slowAI ? [] : [{tuvi_state:JSON.stringify({status:'WAITING_INFO'})}];
  else if(q.startsWith('UPDATE inbox SET handled'))rows=[{id:mid,text:'Xin chào bạn',image_urls:'[]'}];
  else if(/^(SELECT 1 FROM inbox|SELECT role, text FROM messages|SELECT api_key FROM ai_keys)/.test(q))rows=[];
  else if(!/^(CREATE |ALTER |INSERT INTO (messages|logs)|DELETE FROM (logs|inbox)|SELECT key, value FROM settings)/.test(q))throw Error('Unexpected query '+q);
  const names=Object.keys(rows[0]||{});
  return new Response(JSON.stringify({command:'SELECT',rowCount:rows.length,
    fields:names.map(name=>({name,dataTypeID:typeof rows[0]?.[name]==='boolean'?16:25})),
    rows:rows.map(row=>names.map(n=>typeof row[n]==='boolean'?(row[n]?'t':'f'):row[n])),rowAsArray:true}));
};

assert.equal((await patch(a,false,'wrong')).status,401);
assert.equal((await patch(a,'false')).status,400);
assert.equal((await patch({page_id:'missing',psid:'A'},false)).status,404);
await patch(a,false); const revision=a.bot_revision;
await patch(a,false);assert.equal(a.bot_revision,revision);
const pausedEvent=event(a,'Em đã nhắn cho shop.');
await handleEvent(pausedEvent);await handleEvent(pausedEvent);
assert.deepEqual(inbound,[['A','Em đã nhắn cho shop.']]);assert.equal(traffic.length,0);
await handleEvent(event(b));await handleEvent(event(otherPage));
assert.equal(traffic.filter(t=>t.message).length,2);
await patch(a,true);
await handleEvent({...event(a,'Tin cũ'),timestamp:a.changed-1000});assert.equal(traffic.length,2);
await handleEvent(event(a));assert.equal(traffic.length,3);

// A pause/resume between chunks invalidates the original delivery.
afterText=async()=>{ await patch(a,false);await patch(a,true); };
const guard=deliveryGuard(a.page_id,a.psid,a.bot_revision);
await assert.rejects(withBotRun({isActive:guard},()=>sendChatText('stub',a.psid,'Một câu. '.repeat(120))),ConversationPaused);
assert.equal(traffic.filter(t=>t.message).length,4);
globalOn=false;
await handleEvent(event(a)).catch(e=>{assert.ok(e instanceof ConversationPaused);});
assert.equal(traffic.filter(t=>t.message).length,4);globalOn=true;

// Stop the actual webhook while its 30-second collection window is pending.
const originalTimeout=globalThis.setTimeout;
let entered,release;
const waiting=new Promise(r=>{entered=r;});
globalThis.setTimeout=(fn,ms,...rest)=>{
  if(ms===30000){release=fn;entered();return;}
  return originalTimeout(fn,ms,...rest);
};
try {
  const work=handleEvent(event(a,'Thông tin bổ sung'));
  await waiting;await patch(a,false);await patch(a,true);release();
  await assert.rejects(work,ConversationPaused);
  assert.equal(traffic.filter(t=>t.message).length,4);
} finally {globalThis.setTimeout=originalTimeout;}
process.env.GEMINI_API_KEY='fixture-only';
slowAI=true;
await assert.rejects(handleEvent(event(a,'Xin chào bạn')),ConversationPaused);
assert.equal(aiCalls,1);
assert.equal(traffic.filter(t=>t.message).length,4);
console.log('Customer bot switch, isolation, deduplication, cancellation and resume OK');
