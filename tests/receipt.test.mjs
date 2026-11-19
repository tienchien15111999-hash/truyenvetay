import assert from 'node:assert/strict';
import { compareReceipt, amountVnd } from '../lib/receipt.js';
const expected={amount:'199.000đ',recipient:'NGUYỄN VĂN AN',account:'123456',content:'TV 1234'};
const good={amount:199000,recipient:'NGUYEN VAN AN',account:'123456',content:'TV 1234',status:'success',currency:'VND'};
assert.equal(compareReceipt(good,expected).matched,true);
for(const field of Object.keys(good))assert.equal(compareReceipt({...good,[field]:null},expected).matched,false,field);
assert.equal(compareReceipt({...good,amount:19900},expected).matched,false);
assert.equal(compareReceipt(good,null).matched,false);
assert.equal(amountVnd('199k'),null);
assert.equal(amountVnd('199,000 VND'),199000);
console.log('receipt tests OK');

const simple={...expected,receiptMatch:'name_amount'};
const visible={recipient:'Nguyen Van An',amount:'199.000'};
assert.equal(compareReceipt(visible,simple).matched,true);
for (const patch of [{recipient:'NGUYEN VAN AI'},{amount:'99.000'},{status:'failed'},{status:'pending'},{currency:'USD'}]) {
  assert.equal(compareReceipt({...visible,...patch},simple).matched,false);
}
