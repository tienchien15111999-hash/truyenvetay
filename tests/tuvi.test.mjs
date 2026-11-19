import assert from 'node:assert/strict';
const { getHourIndex, calcTuanTriet, generateLaSo } = await import('../lib/tuvi.js');

// giờ sinh -> chỉ số giờ của iztro
assert.equal(getHourIndex(0), 0);
assert.equal(getHourIndex(1), 1);
assert.equal(getHourIndex(14), 7);
assert.equal(getHourIndex(22), 11);
assert.equal(getHourIndex(23), 12);

// Tuần / Triệt theo Can Chi của năm sinh
let r = calcTuanTriet('Quý', 'Dậu'); // Quý Dậu thuộc giáp Giáp Tý: Tuần Tuất-Hợi, Triệt Tý-Sửu
assert.deepEqual(r.tuan, ['Tuất', 'Hợi']);
assert.deepEqual(r.triet, ['Tý', 'Sửu']);
r = calcTuanTriet('Ất', 'Hợi'); // Ất Hợi thuộc giáp Giáp Tuất: Tuần Thân-Dậu, Triệt Ngọ-Mùi
assert.deepEqual(r.tuan, ['Thân', 'Dậu']);
assert.deepEqual(r.triet, ['Ngọ', 'Mùi']);
r = calcTuanTriet('Canh', 'Thìn'); // Canh Thìn thuộc giáp Giáp Tuất: Tuần Thân-Dậu, Triệt Ngọ-Mùi
assert.deepEqual(r.tuan, ['Thân', 'Dậu']);
assert.deepEqual(r.triet, ['Ngọ', 'Mùi']);
r = calcTuanTriet('Bính', 'Thân'); // Bính Thân thuộc giáp Giáp Ngọ: Tuần Thìn-Tỵ, Triệt Thìn-Tỵ
assert.deepEqual(r.tuan, ['Thìn', 'Tỵ']);
assert.deepEqual(r.triet, ['Thìn', 'Tỵ']);

// Lập lá số thật: Quý Dậu 1993 -> Tuần Tuất-Hợi; Ất Hợi 1995 -> Tuần Thân-Dậu (không còn cố định Tuất-Hợi)
let ls = generateLaSo({ fullName: 'A', gender: 'nu', birthDate: '1993-11-01', birthHour: 23, viewYear: 2026 });
assert.equal(Object.keys(ls.palaces).length, 12);
assert.deepEqual(ls.thienBan.tuan, ['Tuất', 'Hợi']);
assert.deepEqual(ls.thienBan.triet, ['Tý', 'Sửu']);
assert.equal(ls.thienBan.age, 34);
ls = generateLaSo({ fullName: 'B', gender: 'Nam', birthDate: '1995-08-15', birthHour: 14, viewYear: 2026 });
assert.equal(ls.thienBan.gender, 'Nam');
assert.deepEqual(ls.thienBan.tuan, ['Thân', 'Dậu']);
assert.ok(Object.values(ls.palaces).some((p) => p.hasTuan));

// ngày không tồn tại thì báo lỗi (bot sẽ hỏi lại khách)
assert.throws(() => generateLaSo({ birthDate: '1995-02-31', birthHour: 5 }));
console.log('tuvi tests OK');

// Regression fixture from the supplied chart (15/08/1995, male, Mùi).
const input = {fullName:'Nguyễn Văn An', gender:'nam', birthDate:'1995-08-15', birthHour:13, viewYear:2026};
const chart = generateLaSo(input);
const sub = (chart, branch) => [...chart.palaces[branch].goodStars,...chart.palaces[branch].badStars].map(s=>s.name);
assert.equal(chart.thienBan.destiny,'Sơn Đầu Hỏa');
assert.equal(chart.thienBan.elementRelation,'Cục hòa Bản Mệnh');
assert.equal(chart.thienBan.yinYang,'Âm Nam');
assert.equal(chart.thienBan.yinYangRelation,'Âm dương thuận lý');
assert.equal(chart.palaces.Sửu.name,'MỆNH');
assert.equal(chart.palaces.Mão.isBodyPalace,true);
assert.equal(chart.palaces.Thìn.changsheng12,'Thai');
assert.equal(chart.palaces.Mão.changsheng12,'Dưỡng');
assert.equal(chart.palaces.Dậu.monthIndex,'T.1');
assert.equal(chart.palaces.Tỵ.monthIndex,'T.9');
assert.equal(chart.palaces.Tỵ.smallLimitBranch,'Mão');
assert.ok(sub(chart,'Dần').includes('Hỏa Tinh'));
assert.ok(!sub(chart,'Thìn').includes('Hỏa Tinh'));
assert.ok(sub(chart,'Thân').includes('Hóa Lộc'));
assert.ok(sub(chart,'Thân').includes('Hóa Kỵ'));
assert.ok(sub(chart,'Dậu').includes('Hóa Khoa'));
assert.ok(sub(chart,'Tý').includes('Hóa Quyền'));
assert.ok(sub(chart,'Mão').includes('Bác Sĩ'));
assert.ok(sub(chart,'Hợi').includes('Thái Tuế'));
assert.ok(sub(chart,'Hợi').includes('Quốc Ấn'));
assert.ok(sub(chart,'Thân').includes('Đường Phù'));
assert.ok(sub(chart,'Tuất').includes('Địa Võng'));
assert.equal(chart.palaces.Tỵ.majorStars[0].brightness,'(H)');
assert.deepEqual(generateLaSo({...input,birthDate:'1995-07-20',isLunar:true}).palaces,chart.palaces);
assert.notEqual(generateLaSo({...input,viewYear:2027}).palaces.Dậu.monthIndex,chart.palaces.Dậu.monthIndex);
for (const hour of [-1,24,NaN,Infinity,1.5,'13abc',null,'']) assert.throws(()=>generateLaSo({...input,birthHour:hour}));
for (const birthDate of ['1995-02-29','1995-13-01','1995-00-01','1995-08-00']) assert.throws(()=>generateLaSo({...input,birthDate}));
assert.throws(()=>generateLaSo({...input,gender:'other'}));
assert.throws(()=>generateLaSo({...input,viewYear:NaN}));
// Every stem, both directions and all hours: no duplicate/lost transformations.
for (let year=1990;year<2000;year++) for(const gender of ['nam','nu']) for(const birthHour of [0,1,13,22,23]) {
 const c = generateLaSo({...input,birthDate:`${year}-08-15`,gender,birthHour});
 const cells = Object.values(c.palaces);
 assert.equal(cells.reduce((n,p)=>n+p.majorStars.length,0),14);
 assert.equal(cells.filter(p=>p.isBodyPalace).length,1);
 assert.equal(cells.filter(p=>p.hasTuan).length,2);
 assert.equal(cells.filter(p=>p.hasTriet).length,2);
 assert.equal(new Set(cells.map(p=>p.monthIndex)).size,12);
 const stars = cells.flatMap(p=>[...p.goodStars,...p.badStars]);
 for(const name of ['Hóa Lộc','Hóa Quyền','Hóa Khoa','Hóa Kỵ','Thiên Giải','Địa Giải','Văn Tinh','Thiên La','Địa Võng']) assert.equal(stars.filter(s=>s.name===name).length,1,`${year} ${gender} ${birthHour} ${name}`);
 for(const p of cells) assert.equal(new Set([...p.goodStars,...p.badStars].map(s=>s.name)).size,p.goodStars.length+p.badStars.length);
}
console.log('Vietnamese chart regressions OK (100 charts)');
assert.throws(()=>generateLaSo({...input,birthDate:'1995-07-20',isLunar:true,isLeapMonth:true}));
const leap = generateLaSo({...input,birthDate:'2023-02-01',isLunar:true,isLeapMonth:true});
assert.equal(leap.thienBan.lunar.isLeap,true);
