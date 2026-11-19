import assert from 'node:assert/strict';
import {collectBirth, formFields, recoverBirth} from '../lib/birth-intake.js';
import {missingBirth} from '../lib/chat-pacing.js';

const form='Họ và tên: Trần Hải Nam\nGiới tính: Nam\nNgày/tháng/năm sinh (âm hay dương lịch): 15/08/1995 dương lịch\nGiờ sinh: 0h00\nTình trạng hôn nhân hiện tại (có thể bỏ qua): Đã kết hôn';
const noModel=()=>assert.fail('A complete form must not need AI extraction');
const base=await collectBirth(form,{}, {extract:noModel});
assert.deepEqual(base,{fullName:'Trần Hải Nam',gender:'nam',birthDate:'1995-08-15',birthHour:0,isLunar:false,maritalStatus:'đã kết hôn',isLeapMonth:false});
const malformed=async()=>'{not valid JSON';
assert.equal((await collectBirth(form.replace('Đã kết hôn','Có gia đình'),{},{extract:noModel})).maritalStatus,'đã kết hôn');
const unclear=await collectBirth(form.replace('Đã kết hôn','Chuyện này khá phức tạp'),{},{extract:malformed});
assert.equal(unclear.maritalProvided,true);assert.equal(unclear.maritalStatus,undefined);
let info={};
for(const msg of ['Họ tên Lê Ngọc Lan','Nữ','21-6-2000 âm lịch','7 giờ tối','độc thân']) {
  info=await collectBirth(msg,info,{extract:malformed});
}
assert.equal(info.fullName,'Lê Ngọc Lan');assert.equal(info.birthDate,'2000-06-21');assert.equal(info.birthHour,19);assert.equal(info.isLunar,true);
assert.deepEqual(missingBirth(info),[]);
assert.equal(formFields('Ngày sinh: 12/3/1990 (âm)').isLunar,true);
assert.equal(formFields('Giờ sinh:\n0').birthHour,0);
assert.equal(formFields('Ngày sinh: 1/1/1995, năm muốn xem: 2030').viewYear,2030);
assert.equal(formFields('Giờ sinh: Tỵ').birthHour,10);
assert.equal(formFields('Giờ sinh: Tý').birthHour,23);
assert.equal(formFields('Trần Hải Nam nữ 15/8/1995 lúc 0h độc thân').fullName,'Trần Hải Nam');
assert.equal(formFields('Ví dụ: Nguyễn Văn A, Nam, 01/01/1990, 14h').birthDate,undefined);
const nonempty={fullName:'Nguyễn Hà',gender:'nu',birthDate:'1995-08-15',isLunar:true};
const dirty=await collectBirth('còn giờ sinh để em hỏi lại',nonempty,{extract:async()=>'{"fullName":"","gender":null,"birthDate":"","birthHour":"","isLunar":false}'});
assert.equal(dirty.birthHour,null);assert.deepEqual(missingBirth(dirty),['giờ sinh']);assert.equal(dirty.isLunar,true);
const normalized=await collectBirth('lúc sáng sớm',nonempty,{extract:async()=>'Kết quả:\n```json\n{"birthHour":"06:15","gender":"Nam","isLunar":false}\n```'});
assert.equal(normalized.birthHour,6);assert.equal(normalized.gender,'nu');assert.equal(normalized.isLunar,true);
assert.equal((await collectBirth('0',nonempty,{extract:noModel})).birthHour,0);
assert.equal((await collectBirth('đổi giờ sinh: 10h',base,{extract:noModel})).birthHour,10);
const previous=[{role:'user',text:'Họ tên: Người Khác'},{role:'bot',text:'Họ tên, giới tính, ngày sinh và giờ sinh'},{role:'user',text:form},{role:'bot',text:'Mình còn thiếu giờ sinh'}];
assert.equal(recoverBirth({},previous).fullName,'Trần Hải Nam');
assert.deepEqual(recoverBirth({},[...previous,{role:'user',text:'lập lá số cho người khác'}]),{});
console.log('Vietnamese birth forms, incremental input and AI extraction failures OK');
