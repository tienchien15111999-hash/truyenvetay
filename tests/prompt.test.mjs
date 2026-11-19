import assert from 'node:assert/strict';
const { buildSystemPrompt, buildTuViReadingPrompt } = await import('../lib/prompt.js');
const { DEFAULT_SETTINGS, SETTING_KEYS } = await import('../lib/defaults.js');

assert.ok(SETTING_KEYS.includes('tuvi_knowledge'));
assert.equal(DEFAULT_SETTINGS.tuvi_knowledge, '');

const laSo = { thienBan: { fullName: 'A', viewYear: 2026, age: 30 }, palaces: {} };

// để trống: không chèn mục kiến thức tử vi
let p = buildTuViReadingPrompt(DEFAULT_SETTINGS, laSo);
assert.ok(!p.includes('KIẾN THỨC LUẬN GIẢI CỦA CHỦ BOT'));
assert.ok(!buildSystemPrompt(DEFAULT_SETTINGS, null).includes('KIẾN THỨC TỬ VI CỦA CHỦ BOT'));

// có nội dung: chèn vào cả hai prompt
const withKnow = { ...DEFAULT_SETTINGS, tuvi_knowledge: 'Cung Mệnh có Tử Vi thì chú trọng quý nhân.' };
p = buildTuViReadingPrompt(withKnow, laSo);
assert.ok(p.includes('KIẾN THỨC LUẬN GIẢI CỦA CHỦ BOT'));
assert.ok(p.includes('Cung Mệnh có Tử Vi thì chú trọng quý nhân.'));
assert.ok(p.indexOf('KIẾN THỨC LUẬN GIẢI') < p.indexOf('CÁCH VIẾT'));
assert.ok(buildSystemPrompt(withKnow, null).includes('Cung Mệnh có Tử Vi thì chú trọng quý nhân.'));

// chỉ toàn khoảng trắng thì coi như trống
assert.ok(!buildTuViReadingPrompt({ ...DEFAULT_SETTINGS, tuvi_knowledge: '   \n ' }, laSo).includes('KIẾN THỨC LUẬN GIẢI CỦA CHỦ BOT'));
console.log('prompt tests OK');

const { TUVI_TEACHING_STYLE } = await import('../lib/tuvi-style.js');
const { buildSectionPrompt, buildPaidConsultPrompt, SECTIONS } = await import('../lib/tuviflow.js');
const { lifetimePrompt } = await import('../lib/lifetime.js');
const styleSettings={persona:'P',disclaimer:'Tham khảo'};
const chart={thienBan:{fullName:'A'},palaces:{}};
for(const prompt of [buildTuViReadingPrompt(styleSettings,chart),buildSectionPrompt(styleSettings,chart,SECTIONS[0]),buildPaidConsultPrompt(styleSettings,chart,{},[]),lifetimePrompt(styleSettings,chart,{title:'Tổng quan'})]) {
 assert.ok(prompt.includes(TUVI_TEACHING_STYLE));
 assert.ok(prompt.includes('yinYangRelation'));
 assert.ok(prompt.includes('không đánh đồng'));
}
console.log('Teaching style prompt coverage OK');

const {maritalAnswer,withMaritalField}=await import('../lib/marital-status.js');
assert.equal(maritalAnswer('Anh chị mình đã kết hôn', {maritalStatus:'đã kết hôn',maritalEvidence:'tôi đã kết hôn'}),null);
assert.equal(maritalAnswer('Chưa kết hôn'), 'chưa kết hôn');
assert.equal(maritalAnswer('Khoảng bao giờ em kết hôn?'),null);
const form='Họ tên, giờ sinh. Bạn đã lập gia đình chưa?';
assert.equal(withMaritalField(form),form);
assert.equal(withMaritalField(withMaritalField('Form cũ')),withMaritalField('Form cũ'));
for(const prompt of [buildTuViReadingPrompt(styleSettings,chart,'đang ly thân'),buildSectionPrompt(styleSettings,chart,SECTIONS[3],'','đang ly thân'),buildPaidConsultPrompt(styleSettings,chart,{},[],'đang ly thân'),lifetimePrompt(styleSettings,chart,{title:'Gia đạo'},false,'đang ly thân')]) {
  assert.match(prompt,/Khách tự khai tình trạng hôn nhân hiện tại: đang ly thân/);
}

// Khách chỉ được gọi là "bạn": lời dặn gửi AI không chứa họ tên, và có luật xưng hô
{
  const { generateLaSo } = await import('../lib/tuvi.js');
  const { lifetimePrompt } = await import('../lib/lifetime.js');
  const { buildSectionPrompt } = await import('../lib/tuviflow.js');
  const chart = generateLaSo({ fullName: 'Trần Quốc Huy', gender: 'nam', birthDate: '1995-08-15', birthHour: 14, isLunar: false, viewYear: 2027 });
  const prompts = [
    lifetimePrompt(DEFAULT_SETTINGS, chart, { title: 'Tổng quan' }, false, 'độc thân'),
    lifetimePrompt(DEFAULT_SETTINGS, chart, null, true, 'độc thân'),
    buildTuViReadingPrompt(DEFAULT_SETTINGS, chart, 'độc thân'),
  ];
  for (const text of prompts) {
    assert.ok(!text.includes('Trần Quốc Huy'), 'không đưa họ tên khách cho AI');
    assert.match(text, /chỉ xưng “mình” và gọi khách là “bạn”/);
  }
  const { hideName } = await import('../lib/text.js');
  assert.equal(hideName('Chào Trần Quốc Huy nhé', 'Trần Quốc Huy'), 'Chào bạn nhé');
  console.log('customer name rule tests OK');
}
