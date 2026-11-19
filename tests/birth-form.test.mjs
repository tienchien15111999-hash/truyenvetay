process.env.CHAT_PACING_OFF='1';
import assert from 'node:assert/strict';
import { birthFormUrl, readBirthFields, acceptForm, lookupForm } from '../lib/birth-form.js';
import { finishBirthForm } from '../lib/birth-form-delivery.js';
import { sendBirthFormButton } from '../lib/messenger.js';
import { withBotRun, ConversationPaused } from '../lib/bot-run.js';
import { handleEvent } from '../lib/incoming.js';
import { deliveryGuard } from '../lib/db.js';

process.env.DATABASE_URL = 'postgres://fixture:fixture@unit/db';
process.env.GEMINI_API_KEY = 'fixture';
const fields = {fullName:'Trần Hải Nam',gender:'nam',calendar:'solar',birthDate:'1995-08-15',birthTime:'00:00'};
const valid = readBirthFields(fields,2027);
assert.equal(valid.birthHour,0);
assert.equal(valid.maritalStatus,'không muốn chia sẻ');
assert.equal(readBirthFields({...fields,birthDate:'2023-02-01',calendar:'lunar',isLeapMonth:true},2027).isLeapMonth,true);
for (const patch of [{birthDate:'1995-02-29'},{birthTime:'24:00'},{birthTime:['00:00']},{gender:''},{calendar:'unknown'},
  {fullName:''},{birthDate:'1995-07-20',calendar:'lunar',isLeapMonth:true},{birthDate:'2027-01-01'}]) {
  assert.throws(()=>readBirthFields({...fields,...patch},2027,'2026-11-18'),e=>e.status===422);
}

const tickets = new Map(), profiles = new Map(), conversations = new Map(), sent = [];
// A stale disabled flag from the old dashboard must not bypass the selected pricing mode.
const options = {year_sales_on:'0',annual_mode:'paid',bot_on:'1'};
let rejectButton = false;
let aiCalls = 0;
const key = (page,psid) => page+'/'+psid;
const byToken = token=>[...tickets.values()].find(t=>t.token===token);
const active = t => {
  const c = conversations.get(key(t.page_id,t.psid));
  return c?.on && c.revision===t.revision && options.bot_on==='1';
};
const mockRows = rows => {
  const names=Object.keys(rows[0] || {});
  return Response.json({command:'SELECT',rowCount:rows.length,rowAsArray:true,
    fields:names.map(name=>({name,dataTypeID:typeof rows[0][name]==='boolean'?16:25})),
    rows:rows.map(r=>names.map(n=>typeof r[n]==='boolean'?(r[n]?'t':'f'):r[n]))});
};
globalThis.fetch = async (url,init) => {
  const body = JSON.parse(init.body);
  if (String(url).includes('graph.facebook.com')) {
    sent.push(body);
    if (rejectButton && body.message?.attachment?.type==='template') return new Response('Unsupported template',{status:400});
    return Response.json({});
  }
  if (String(url).includes('generativelanguage.googleapis.com')) {
    aiCalls++; return Response.json({candidates:[{content:{parts:[{text:'Bài xem năm của bạn.'}]}}]});
  }
  const q=body.query.replace(/\s+/g,' ').trim(), p=body.params;
  let rows=[];
  if (q.startsWith('WITH customer AS')) {
    if(!conversations.has(key(p[0],p[1]))) conversations.set(key(p[0],p[1]),{on:true,revision:0});
    rows=[{name:'Khách thử',permitted:true,bot_revision:0,id:8}];
  } else if (q.startsWith('SELECT token, bot_on FROM pages')) rows=[{token:'page-fixture',bot_on:true}];
  else if (q.startsWith('UPDATE inbox SET handled=TRUE WHERE id=')) rows=[];
  else if (q.startsWith('UPDATE conversations SET birth_form_claimed=TRUE')) rows=[{psid:p[1]}];
  else if (q.startsWith('INSERT INTO profiles (psid, tuvi_state')) profiles.set(p[0],p[1]);
  else if (q.startsWith('INSERT INTO birth_form_links')) {
    const [page_id,psid,rev,token]=p;
    const k=key(page_id,psid), old=tickets.get(k), revision=Number(rev);
    if(!old || old.expired || old.revision<revision) {
      tickets.set(k,{page_id,psid,revision,token}); rows=[{token}];
    }
  } else if (q.startsWith('SELECT token FROM birth_form_links')) {
    const t=tickets.get(key(p[0],p[1]));
    if(t && !t.expired && !t.used_at && t.revision===Number(p[2])) rows=[{token:t.token}];
  } else if (q.startsWith('SELECT t.page_id,t.psid,t.revision')) {
    const t=byToken(p[0]); if(t && !t.expired) rows=[{...t,used_at:t.used_at || null,tuvi_state:profiles.get(t.psid) || null,active:Boolean(active(t))}];
  } else if (q.startsWith('WITH ticket AS')) {
    const t=byToken(p[0]);
    if(t && !t.used_at && !t.expired && (active(t) || t.psid==='admin-test' && t.page_id==='') && (profiles.get(t.psid) || null)===p[2]) {
      t.used_at='used'; profiles.set(t.psid,p[1]);
      const c=conversations.get(key(t.page_id,t.psid)); if(c) c.revision++;
      rows=[{page_id:t.page_id,psid:t.psid,revision:c?.revision || null}];
    }
  } else if (q.startsWith('SELECT 1 FROM conversations c')) {
    if(active({page_id:p[0],psid:p[1],revision:Number(p[2])})) rows=[{ok:true}];
  } else if (q.startsWith('SELECT page_id, bot_revision, customer_bot_on')) {
    const c=conversations.get(key(p[1],p[0])); if(c)rows=[{page_id:p[1],bot_revision:c.revision,customer_bot_on:c.on}];
  } else if (q.startsWith('SELECT token FROM pages')) rows=[{token:'page-fixture'}];
  else if (q.startsWith('SELECT key, value FROM settings')) rows=Object.entries(options).map(([key,value])=>({key,value}));
  else if (q.startsWith('SELECT face_summary')) rows=[{tuvi_state:profiles.get(p[0]) || null}];
  else if (q.startsWith('UPDATE profiles SET tuvi_state')) {
    if (profiles.get(p[1])===p[2]) {profiles.set(p[1],p[0]); rows=[{psid:p[1]}];}
  } else if(!/^(CREATE |ALTER |SELECT role, text|SELECT api_key|INSERT INTO messages|INSERT INTO logs|DELETE FROM logs|DELETE FROM inbox)/.test(q)) assert.fail(q);
  return mockRows(rows);
};

const base='https://bot.example';
const binding = {pageId:'page-A',psid:'A',base};
conversations.set(key('page-A','A'),{on:true,revision:0});
const url=await birthFormUrl(binding), token=new URL(url).hash.slice(1);
assert.match(token,/^[a-f0-9]{64}$/);
assert.equal(await birthFormUrl(binding),null);
assert.equal(await birthFormUrl({...binding,resend:true}),url);
await assert.rejects(lookupForm('x'),e=>e.status===410);
await assert.rejects(lookupForm('a'.repeat(64)),e=>e.status===410);
const logs=[];
await withBotRun({isActive:async()=>true,onDelivered:m=>logs.push(m)}, async () => {
  await sendBirthFormButton('page-fixture','A',url);
  assert.equal(sent.at(-1).message.attachment.payload.buttons[0].url,url);
  rejectButton=true;await sendBirthFormButton('page-fixture','A',url);rejectButton=false;
  assert.match(sent.at(-1).message.text,/họ tên.*giới tính.*ngày sinh.*giờ sinh/);
  assert.doesNotMatch(sent.at(-1).message.text,/https?:|phieu-lap-la-so/i);
  assert.equal(logs.at(-1).text,sent.at(-1).message.text);
});
assert.ok(logs.every(m=>!JSON.stringify(m).includes(token)));
options.bot_on='0';await assert.rejects(acceptForm(token,fields),e=>e.status===410);options.bot_on='1';
await assert.rejects(acceptForm(token,{...fields,birthTime:'35:00'}),e=>e.status===422);
const jobs=await Promise.all([acceptForm(token,{...fields,psid:'C',pageId:'page-C'}),acceptForm(token,fields)]);
assert.equal(jobs.filter(j=>j.already).length,1);
const job=jobs.find(j=>!j.already);
assert.equal(job.pageId,'page-A');assert.equal(job.psid,'A');
assert.equal(await deliveryGuard('page-A','A',0)(),false);
assert.equal(JSON.parse(profiles.get('A')).info.birthHour,0);
await finishBirthForm(job,base);
assert.equal(JSON.parse(profiles.get('A')).stage,'CHOOSE_PACKAGE');
assert.equal(aiCalls,0);
assert.ok(sent.some(s=>s.message?.attachment?.type==='image' && s.message.attachment.payload.url.includes('/api/laso?')));
assert.match(sent.at(-1).message.text,/Xem trọn đời/);
assert.ok(sent.every(s=>s.recipient.id==='A')); assert.equal(profiles.has('C'),false);
assert.deepEqual(await acceptForm(token,fields),{already:true});

options.annual_mode='free';
const count=sent.length;
const previewToken=new URL(await birthFormUrl({psid:'admin-test',base})).hash.slice(1);
const preview=await acceptForm(previewToken,{...fields,maritalStatus:'đã kết hôn'});
assert.equal(preview.preview,true);
const result=await finishBirthForm(preview,base);
assert.match(result.reply,/Bài xem năm/);assert.equal(aiCalls,1);
assert.equal(JSON.parse(profiles.get('admin-test')).stage,'ASK_LIFETIME');
assert.equal(sent.length,count);

const c=conversations.get(key('page-A','A'));
const followup=new URL(await birthFormUrl({...binding,revision:c.revision})).hash.slice(1);
await assert.rejects(acceptForm(followup,fields),e=>e.status===409);
c.on=false;await assert.rejects(finishBirthForm(job,base),ConversationPaused);
byToken(followup).expired=true;await assert.rejects(lookupForm(followup),e=>e.status===410);
console.log('Clickable birth sheet: validation, recipient binding, one-time submission, delayed reminder cancellation, paid/free flows, admin preview and Messenger fallback OK');

// Submit while the actual webhook is waiting for a customer's next text.
options.annual_mode='paid';
const oldTimer=globalThis.setTimeout;
let resume, waiting;
const asleep=new Promise(resolve=>{waiting=resolve;});
globalThis.setTimeout=(fn,ms,...args) => {
  if (ms===30000) {resume=fn;waiting();return;}
  return oldTimer(fn,ms,...args);
};
try {
  const worker=handleEvent({sender:{id:'opening'},recipient:{id:'page-B'},message:{mid:'opening-01',text:'Chào shop'}},'page-B',base);
  await Promise.race([asleep,worker.then(()=>assert.fail('Missing 30 second collection window'))]);
  const button=sent.find(s=>s.recipient.id==='opening' && s.message?.attachment?.type==='template');
  assert.ok(button);
  const formToken=new URL(button.message.attachment.payload.buttons[0].url).hash.slice(1);
  const submitted=await acceptForm(formToken,fields);
  await finishBirthForm(submitted,base);
  const beforeRelease=sent.length;
  resume();
  await assert.rejects(worker,ConversationPaused);
  assert.equal(sent.length,beforeRelease);
  assert.equal(JSON.parse(profiles.get('opening')).stage,'CHOOSE_PACKAGE');
} finally {globalThis.setTimeout=oldTimer;}
console.log('Opening Messenger webhook, web submission and outstanding reminder verified together');

// In chat-only mode the first Messenger greeting and a repeated request never issue a web ticket.
options.birth_form_web='0'; options.annual_mode='paid';
const recipient={id:'chat-form'}, page={id:'sales-page'};
const scope=key(page.id,recipient.id);
let finishWait, started;
const collecting=new Promise(resolve=>{started=resolve;});
globalThis.setTimeout=(fn,ms,...args)=>{
  if (ms===30000) {finishWait=fn;started();return;}
  return oldTimer(fn,ms,...args);
};
try {
  const worker=handleEvent({sender:recipient,recipient:page,message:{mid:'chat-1',text:'Xin chào'}},page.id,base);
  await Promise.race([collecting,worker.then(()=>assert.fail('Expected birth intake'))]);
  await handleEvent({sender:recipient,recipient:page,message:{mid:'chat-2',text:'xin phiếu'}},page.id,base);
  const replies=sent.filter(x=>x.recipient.id===recipient.id && x.message).map(x=>x.message);
  assert.ok(replies.length>=2);
  assert.ok(replies.every(m=>m.text && !m.text.includes('https://')));
  assert.match(replies.at(-1).text,/Họ tên/);
  assert.equal(tickets.has(scope),false);
  conversations.get(scope).on=false;finishWait();
  await assert.rejects(worker,ConversationPaused);
} finally {globalThis.setTimeout=oldTimer;}
console.log('Chat-only birth intake and button failure keep website URLs out of Messenger text');
