import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgres://u:p@fake-host/db';process.env.ADMIN_PASSWORD='test';
let stored=null;
globalThis.fetch=async(url,opt)=>{
 const b=JSON.parse(opt.body),q=b.query;let rows=[],fields=[];
 if(q.includes('INSERT INTO claude_keys'))stored=b.params[0];
 if(q.includes('SELECT api_key FROM claude_keys')){fields=[{name:'api_key',dataTypeID:25}];rows=stored?[[stored]]:[];}
 if(q.includes('DELETE FROM claude_keys'))stored=null;
 return {ok:true,json:async()=>({command:'SELECT',rowCount:rows.length,rows,fields,rowAsArray:true}),headers:new Headers()};
};
const {GET,POST,DELETE}=await import('../app/api/admin/keys/route.js');
const req=(body,query='')=>new Request('https://example.com/api/admin/keys'+query,{method:'POST',headers:{'x-admin-password':'test','Content-Type':'application/json'},body:JSON.stringify(body)});
const key='sk-ant-'+ 'x'.repeat(30);
assert.equal((await POST(req({provider:'gemini',text:key}))).status,400);
assert.equal((await POST(req({provider:'claude',text:'AIzaWrongProvider'}))).status,400);
assert.equal((await POST(req({provider:'claude',text:key}))).status,200);
assert.equal(stored,key);
const data=await (await GET(req({}))).json();assert.ok(data.claudeMasked);assert.ok(!JSON.stringify(data).includes(key));
const {getClaudeKey}=await import('../lib/db.js');delete process.env.ANTHROPIC_API_KEY;assert.equal(await getClaudeKey(),key);
process.env.ANTHROPIC_API_KEY='env-key';assert.equal(await getClaudeKey(),'env-key');
await DELETE(req({},'?provider=claude'));assert.equal(stored,null);
assert.equal((await GET(new Request('https://example.com'))).status,401);
console.log('Provider key separation tests OK');
