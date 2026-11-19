import assert from 'node:assert/strict';
import { askGemini } from '../lib/gemini.js';
import { askClaude } from '../lib/claude.js';
process.env.GEMINI_API_KEYS = 'google-key';
process.env.GEMINI_MODELS = 'gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.8-flash';
process.env.ANTHROPIC_API_KEY = 'claude-key';
const googleOK = {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'google answer'}]}}]})};
const claudeOK = {ok:true,json:async()=>({content:[{type:'thinking',thinking:'private'},{type:'text',text:'claude answer'}]})};
const bad = status => ({ok:false,status,text:async()=> 'error'});
const options = {system:'rules',history:[{role:'user',parts:[{text:'old'}]}],userText:'new',images:[{mime:'image/jpeg',data:'AAA'}],maxOutputTokens:777};
const original = JSON.stringify(options);
let calls=[];
function stub(fn) {
 calls=[];
 globalThis.fetch=async(url,init)=>{const c={url,init,body:JSON.parse(init.body)};calls.push(c);return fn(c);};
}
stub(()=>googleOK);
assert.equal(await askGemini(options),'google answer');
assert.equal(calls.length,1);
assert.equal(JSON.stringify(options),original);
for(const status of [401,403,404,429,500,503]) {
 stub(c=>c.url.includes('googleapis')?bad(status):claudeOK);
 assert.equal(await askGemini(options),'claude answer');
 assert.equal(calls.length,4);
 const c=calls[3];
 assert.equal(c.url,'https://api.anthropic.com/v1/messages');
 assert.equal(c.init.headers['x-api-key'],'claude-key');
 assert.equal(c.init.headers['x-goog-api-key'],undefined);
 assert.equal(c.body.system,'rules');
 assert.equal(c.body.max_tokens,777);
 assert.deepEqual(c.body.messages[0].content,[{type:'text',text:'old'},{type:'image',source:{type:'base64',media_type:'image/jpeg',data:'AAA'}},{type:'text',text:'new'}]);
 assert.equal(JSON.stringify(options),original);
}
// Invalid Google request stops Google retries, but allows a valid provider adapter.
stub(c=>c.url.includes('googleapis')?bad(400):claudeOK);
assert.equal(await askGemini(options),'claude answer');assert.equal(calls.length,2);
// No Google key: Claude only.
delete process.env.GEMINI_API_KEYS;
stub(()=>claudeOK);assert.equal(await askGemini(options),'claude answer');assert.equal(calls.length,1);
process.env.GEMINI_API_KEYS='google-key';
// Slow/never-settling fetch is aborted before Claude starts, including body reading.
process.env.GEMINI_READING_TIMEOUT_MS='100';
for(const slowBody of [false,true]) {
 stub(c=>c.url.includes('googleapis') ? (slowBody ? {ok:true,json:()=>new Promise(()=>{})} : new Promise(()=>{})) : claudeOK);
 assert.equal(await askGemini(options),'claude answer');
 assert.equal(calls.length,4);
 assert.ok(calls.slice(0,3).every(c=>c.init.signal.aborted));
}
// Empty and network failures fall back too.
for(const fail of ['empty','network']) {
 stub(c=>{if(!c.url.includes('googleapis'))return claudeOK;if(fail==='network')throw new TypeError('fetch failed');return {ok:true,json:async()=>({candidates:[]})};});
 assert.equal(await askGemini(options),'claude answer');
}
// A content policy block is not a transient provider failure.
stub(()=>({ok:true,json:async()=>({promptFeedback:{blockReason:'SAFETY'}})}));
await assert.rejects(()=>askGemini(options),/bộ lọc/);assert.equal(calls.length,1);
// Claude authentication, empty result and deadline failures surface clearly.
stub(c=>c.url.includes('googleapis')?bad(503):bad(401));
await assert.rejects(()=>askGemini(options),/Claude HTTP 401/);
stub(()=>({ok:true,json:async()=>({content:[]})}));
await assert.rejects(()=>askClaude(options),/Claude trả rỗng/);
process.env.CLAUDE_READING_TIMEOUT_MS='100';
stub(()=>new Promise(()=>{}));
await assert.rejects(()=>askClaude(options),/thời gian chờ/);
assert.ok(calls[0].init.signal.aborted);
// Preserve role mapping and drop only a leading assistant greeting.
process.env.CLAUDE_MODEL='custom-claude';
stub(()=>claudeOK);
await askClaude({...options,history:[{role:'model',parts:[{text:'greeting'}]},{role:'user',parts:[{text:'question'}]},{role:'model',parts:[{text:'answer'}]}]});
assert.deepEqual(calls[0].body.messages.map(m=>m.role),['user','assistant','user']);
assert.equal(calls[0].body.model,'custom-claude');
// No Claude key preserves existing Google-only errors.
delete process.env.ANTHROPIC_API_KEY;
stub(()=>bad(503));await assert.rejects(()=>askGemini(options),/Gemini HTTP 503/);assert.equal(calls.length,3);
console.log('Claude fallback tests OK');
// Total Gemini budget prevents three full slow attempts before fallback.
process.env.ANTHROPIC_API_KEY='claude-key';
process.env.GEMINI_READING_TIMEOUT_MS='200';
process.env.GEMINI_READING_BUDGET_MS='100';
stub(c=>c.url.includes('googleapis')?new Promise(()=>{}):claudeOK);
assert.equal(await askGemini(options),'claude answer');
assert.equal(calls.filter(c=>c.url.includes('googleapis')).length,1);
assert.ok(calls[0].init.signal.aborted);
// Fast tasks select independent settings, not the long reading deadline.
process.env.GEMINI_FAST_TIMEOUT_MS='100';
process.env.GEMINI_FAST_BUDGET_MS='100';
stub(c=>c.url.includes('googleapis')?new Promise(()=>{}):claudeOK);
assert.equal(await askGemini({...options,task:'fast'}),'claude answer');
assert.equal(calls.length,2);
console.log('AI deadline budget tests OK');
