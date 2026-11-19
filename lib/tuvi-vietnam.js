// Vietnamese display/an-sao profile. Indices: Tý=0 ... Hợi=11.
// Rule references and remaining differences are documented in LASO_CHANGES.md.
export const mod = (n, m = 12) => ((n % m) + m) % m;
export const BRANCHES = ['Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi','Thân','Dậu','Tuất','Hợi'];
export const STEMS = ['Giáp','Ất','Bính','Đinh','Mậu','Kỷ','Canh','Tân','Nhâm','Quý'];
const THAI_TUE = ['Thái Tuế','Thiếu Dương','Tang Môn','Thiếu Âm','Quan Phù','Tử Phù','Tuế Phá','Long Đức','Bạch Hổ','Phúc Đức','Điếu Khách','Trực Phù'];
const NAP_AM = ['Hải Trung Kim','Lư Trung Hỏa','Đại Lâm Mộc','Lộ Bàng Thổ','Kiếm Phong Kim','Sơn Đầu Hỏa','Giản Hạ Thủy','Thành Đầu Thổ','Bạch Lạp Kim','Dương Liễu Mộc','Tuyền Trung Thủy','Ốc Thượng Thổ','Tích Lịch Hỏa','Tùng Bách Mộc','Trường Lưu Thủy','Sa Trung Kim','Sơn Hạ Hỏa','Bình Địa Mộc','Bích Thượng Thổ','Kim Bạch Kim','Phú Đăng Hỏa','Thiên Hà Thủy','Đại Trạch Thổ','Thoa Xuyến Kim','Tang Đố Mộc','Đại Khê Thủy','Sa Trung Thổ','Thiên Thượng Hỏa','Thạch Lựu Mộc','Đại Hải Thủy'];
// Traditional dignity tables, in branch order; never inferred from a single birthday.
const BRIGHTNESS = {
 'Tử Vi':'B Đ M B V M M Đ M B V B', 'Liêm Trinh':'V Đ V H M H V Đ V H M H',
 'Thiên Đồng':'V H M Đ H Đ H H M H H Đ', 'Vũ Khúc':'V M V Đ M H V M V Đ M H',
 'Thái Dương':'H Đ V V V M M Đ H H H H', 'Thiên Cơ':'Đ Đ H M M V Đ Đ V M M H',
 'Thái Âm':'V Đ H H H H H Đ V M M M', 'Tham Lang':'H M Đ H V H H M Đ H V H',
 'Cự Môn':'V H V M H H V H Đ M H Đ', 'Thiên Tướng':'V Đ M H V Đ V Đ M H V Đ',
 'Thiên Lương':'V Đ V V M H M Đ V H M H', 'Thất Sát':'M Đ M H H V M Đ M H H V',
 'Phá Quân':'M V H H Đ H M V H H Đ H',
 'Kình Dương':'H Đ H H Đ H H Đ H H Đ H', 'Đà La':'H Đ H H Đ H H Đ H H Đ H',
 'Hỏa Tinh':'H H Đ Đ Đ Đ Đ H H H H H', 'Linh Tinh':'H H Đ Đ Đ Đ Đ H H H H H',
 'Văn Xương':'H Đ H Đ H Đ H Đ H H Đ Đ', 'Văn Khúc':'H Đ H Đ H Đ H Đ H H Đ Đ',
 'Địa Không':'H H Đ H H Đ H H Đ H H Đ', 'Địa Kiếp':'H H Đ H H Đ H H Đ H H Đ',
};
export function vietnamBrightness(name, branch, fallback = '') {
 const code = BRIGHTNESS[name]?.split(' ')[BRANCHES.indexOf(branch)];
 // Thiên Phủ uses the engine's table until a complete agreed Vietnamese table is available.
 return code ? `(${code})` : fallback;
}
export function normalizeStarName(name) {
 return ({'Lực Sỹ':'Lực Sĩ','Bác Sỹ':'Bác Sĩ','Phụng Các':'Phượng Các','Thiên Diêu':'Thiên Riêu','Đài Phụ':'Thai Phụ'})[name] || name;
}
export function enrichVietnamese(a, {timeIndex, male, viewYear}) {
 const [yearCanChi] = a.chineseDate.split(' - ');
 const [stem, branch] = yearCanChi.split(' ');
 const y = BRANCHES.indexOf(branch), c = STEMS.indexOf(stem);
 const lunar = a.rawDates.lunarDate;
 // Match iztro's fixLeap=true convention: after day 15 use the following month.
 const m = lunar.isLeap && lunar.lunarDay > 15 ? mod(lunar.lunarMonth,12)+1 : lunar.lunarMonth;
 const h = timeIndex % 12;
 const direction = (c % 2 === 0) === male ? 1 : -1;
 const byBranch = Object.fromEntries(a.palaces.map(p => [p.earthlyBranch, p]));
 const excluded = new Set(['Triệt Lộ','Không Vong','Tuần Không','Thiên Vu','Âm Sát','Thiên Nguyệt','Niên Giải','Phi Liêm','Hàm Trì','Giải Thần']);
 for (const p of a.palaces) {
   p.adjectiveStars = p.adjectiveStars.filter(s => !excluded.has(s.name));
   for (const s of [...p.minorStars,...p.adjectiveStars]) s.name = normalizeStarName(s.name);
   if (p.name === 'Tử Nữ') p.name = 'Tử Tức';
   const b = BRANCHES.indexOf(p.earthlyBranch);
   p.suiqian12 = THAI_TUE[mod(b-y)];
 }
 const add = (b, name) => {
   const p = byBranch[BRANCHES[mod(b)]];
   if (![...p.minorStars,...p.adjectiveStars].some(s => s.name === name)) p.adjectiveStars.push({name,type:'adjective'});
 };
 const move = (name,b) => {
   for (const p of a.palaces) {
     p.minorStars = p.minorStars.filter(s=>s.name!==name);
     p.adjectiveStars = p.adjectiveStars.filter(s=>s.name!==name);
   }
   add(b,name);
 };
 const loc = [2,3,5,6,5,6,8,9,11,0][c];
 add(loc+3,'Văn Tinh'); add(loc+5,'Đường Phù'); add(loc+8,'Quốc Ấn');
 add(m,'Thiên Y'); add(8+2*(m-1),'Thiên Giải'); add(m+6,'Địa Giải');
 add(4,'Thiên La'); add(10,'Địa Võng'); add(10-y,'Giải Thần');
 add([9,10,7,4,5,6,8,3,11,2][c],'Lưu Hà');
 add(y-m+1+h,'Đẩu Quân');
 const ma = [2,11,8,5][y%4];
 add(ma+3,'Kiếp Sát'); add(ma+7,'Đào Hoa');
 // Hỏa thuận/Linh nghịch for Dương Nam Âm Nữ; reverse for Âm Nam Dương Nữ.
 const hoaStart = [2,10,1,9][y%4], linhStart = [10,3,3,10][y%4];
 move('Hỏa Tinh',hoaStart+direction*h); move('Linh Tinh',linhStart-direction*h);
 for (const p of a.palaces) {
   add(BRANCHES.indexOf(p.earthlyBranch),normalizeStarName(p.boshi12));
   add(BRANCHES.indexOf(p.earthlyBranch),p.suiqian12);
 }
 const sexagenary = Array.from({length:60},(_,i)=>i).find(i=>i%10===c&&i%12===y);
 const destiny = NAP_AM[Math.floor(sexagenary/2)];
 const element = destiny.split(' ').at(-1), cuc = a.fiveElementsClass.split(' ')[0];
 const elements = ['Mộc','Hỏa','Thổ','Kim','Thủy'];
 const e = elements.indexOf(element), k = elements.indexOf(cuc);
 const relation = e===k ? 'Cục hòa Bản Mệnh' : mod(k-e,5)===1 ? 'Mệnh sinh Cục' : mod(e-k,5)===1 ? 'Cục sinh Mệnh' : mod(k-e,5)===2 ? 'Mệnh khắc Cục' : 'Cục khắc Mệnh';
 const soulBranch = BRANCHES.indexOf(a.earthlyBranchOfSoulPalace);
 const age = viewYear-lunar.lunarYear+1;
 const start = mod(10-3*y);
 const annualBranch = mod(start+(male?1:-1)*(age-1));
 const firstMonth = mod(annualBranch-(m-1)+h);
 for (const p of a.palaces) {
   const b = BRANCHES.indexOf(p.earthlyBranch);
   p.smallLimitBranch = BRANCHES[mod(y+(male?1:-1)*(b-start))];
   p.monthNumber = mod(b-firstMonth)+1;
   p.isAnnualPalace = b===annualBranch;
 }
 return { destiny, relation, age, lunar, yearCanChi,
   yinYang: `${c%2?'Âm':'Dương'} ${male?'Nam':'Nữ'}`,
   yinYangRelation: (c%2===soulBranch%2)?'Âm dương thuận lý':'Âm dương nghịch lý',
   viewYearCanChi: `${STEMS[mod(viewYear-4,10)]} ${BRANCHES[mod(viewYear-4)]}`,
 };
}
