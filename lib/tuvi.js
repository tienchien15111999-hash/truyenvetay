import { astro } from 'iztro';
import { enrichVietnamese, vietnamBrightness } from './tuvi-vietnam.js';

const THIEN_CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const DIA_CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

// Phân màu Ngũ Hành theo chuẩn Tử Vi Nam Phái
const STAR_COLORS = {
  // Hành Kim (Xám bạc đậm)
  'Vũ Khúc': '#52525b', 'Thất Sát': '#52525b', 'Văn Xương': '#52525b', 'Hữu Bật': '#52525b',
  'Kình Dương': '#52525b', 'Đà La': '#52525b', 'Bạch Hổ': '#52525b', 'Hoa Cái': '#52525b',
  // Hành Mộc (Xanh lá)
  'Thiên Cơ': '#15803d', 'Tham Lang': '#15803d', 'Thiên Lương': '#15803d', 'Đào Hoa': '#15803d',
  'Hóa Khoa': '#15803d', 'Hóa Lộc': '#15803d', 'Tang Môn': '#15803d', 'Tướng Quân': '#15803d',
  'Đường Phù': '#15803d', 'Ân Quang': '#15803d', 'Giải Thần': '#15803d', 'Phượng Các': '#15803d',
  // Hành Thủy (Đen / Xanh đen)
  'Thái Âm': '#0f172a', 'Cự Môn': '#0f172a', 'Thiên Đồng': '#0f172a', 'Thiên Tướng': '#0f172a',
  'Phá Quân': '#0f172a', 'Văn Khúc': '#0f172a', 'Hóa Kỵ': '#0f172a', 'Hồng Loan': '#0f172a',
  'Thiên Hỷ': '#0f172a', 'Thiên Riêu': '#0f172a', 'Thiên Y': '#0f172a', 'Long Trì': '#0f172a',
  'Thanh Long': '#0f172a', 'Lưu Hà': '#0f172a', 'Bác Sĩ': '#0f172a', 'Thiếu Âm': '#0f172a',
  // Hành Hỏa (Đỏ)
  'Thái Dương': '#dc2626', 'Liêm Trinh': '#dc2626', 'Hỏa Tinh': '#dc2626', 'Linh Tinh': '#dc2626',
  'Địa Không': '#dc2626', 'Địa Kiếp': '#dc2626', 'Thiên Không': '#dc2626', 'Thiên Khôi': '#dc2626',
  'Thiên Việt': '#dc2626', 'Thiên Mã': '#dc2626', 'Thiên Hình': '#dc2626', 'Hóa Quyền': '#dc2626',
  'Đại Hao': '#dc2626', 'Tiểu Hao': '#dc2626', 'Kiếp Sát': '#dc2626', 'Phục Binh': '#dc2626',
  'Thái Tuế': '#dc2626', 'Quan Phù': '#dc2626', 'Tử Phù': '#dc2626', 'Tuế Phá': '#dc2626',
  'Điếu Khách': '#dc2626', 'Phi Liêm': '#dc2626', 'Hỷ Thần': '#dc2626', 'Lực Sĩ': '#dc2626',
  // Hành Thổ (Vàng nâu)
  'Tử Vi': '#b45309', 'Thiên Phủ': '#b45309', 'Lộc Tồn': '#b45309', 'Tả Phù': '#b45309',
  'Thiên Quý': '#b45309', 'Quốc Ấn': '#b45309', 'Cô Thần': '#b45309', 'Quả Tú': '#b45309',
  'Thiên Trù': '#b45309', 'Thiên Phúc': '#b45309', 'Thiên Quan': '#b45309', 'Bệnh Phù': '#b45309'
};

export function getHourIndex(hour) {
  const h = Number(hour);
  if (hour === null || hour === '' || !Number.isInteger(h) || h < 0 || h > 23) throw new Error('Giờ sinh phải từ 0 đến 23');
  if (h === 0) return 0;   // 00:00 - 00:59 (Tý sớm)
  if (h === 23) return 12; // 23:00 - 23:59 (Tý muộn - tính sang ngày hôm sau)
  return Math.floor((h + 1) / 2);
}

export function calcTuanTriet(yearStem, yearBranch) {
  const canIdx = THIEN_CAN.findIndex((c) => yearStem.includes(c));
  const chiIdx = DIA_CHI.findIndex((c) => yearBranch.includes(c));

  const trietPairs = [
    ['Thân', 'Dậu'], // Giáp, Kỷ
    ['Ngọ', 'Mùi'],  // Ất, Canh
    ['Thìn', 'Tỵ'],  // Bính, Tân
    ['Dần', 'Mão'],  // Đinh, Nhâm
    ['Tý', 'Sửu'],   // Mậu, Quý
  ];
  const triet = canIdx >= 0 ? trietPairs[canIdx % 5] : ['Tý', 'Sửu'];

  let tuan = ['Tuất', 'Hợi'];
  if (canIdx >= 0 && chiIdx >= 0) {
    const giapBranchIdx = (chiIdx - canIdx + 12) % 12;
    const tuan1 = DIA_CHI[(giapBranchIdx + 10) % 12];
    const tuan2 = DIA_CHI[(giapBranchIdx + 11) % 12];
    tuan = [tuan1, tuan2];
  }

  return { tuan, triet };
}

function formatBrightness(brightness) {
  if (!brightness) return '';
  const map = {
    'Miếu': 'M', 'Vượng': 'V', 'Đắc': 'Đ', 'Bình': 'B', 'Lợi': 'B', 'Bất': 'H', 'Hãm': 'H',
    '庙': 'M', '旺': 'V', '得': 'Đ', '利': 'B', '平': 'B', '不': 'H', '陷': 'H',
  };
  const code = map[brightness] || brightness.charAt(0).toUpperCase();
  return `(${code})`;
}

export function getStarColor(starName) {
  for (const [key, color] of Object.entries(STAR_COLORS)) {
    if (starName.includes(key)) return color;
  }
  return '#334155';
}

export function generateLaSo({
  fullName = 'Khách hàng',
  gender = 'nu',
  birthDate = '1993-11-01',
  birthHour = 23,
  isLunar = false,
  isLeapMonth = false,
  viewYear = 2026,
}) {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(birthDate)) throw new Error('Ngày sinh không hợp lệ');
  const [year, month, day] = birthDate.split('-').map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > (isLunar ? 30 : new Date(Date.UTC(year,month,0)).getUTCDate())) throw new Error('Ngày sinh không tồn tại');
  if (!Number.isInteger(viewYear) || viewYear < year || viewYear > 2200) throw new Error('Năm xem không hợp lệ');
  const genderKey = String(gender).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (!['nam','nu','male','female'].includes(genderKey)) throw new Error('Giới tính không hợp lệ');
  const timeIndex = getHourIndex(birthHour);
  const iztroGender = ['nam','male'].includes(genderKey) ? 'male' : 'female';

  if (isLunar) {
    // byLunar silently accepts a nonexistent leap month: validate by roundtrip.
    const check = astro.byLunar(birthDate, 0, iztroGender, isLeapMonth, true, 'vi-VN').rawDates.lunarDate;
    if (check.lunarYear !== year || check.lunarMonth !== month || check.lunarDay !== day || check.isLeap !== Boolean(isLeapMonth)) throw new Error('Ngày âm lịch hoặc tháng nhuận không tồn tại');
  }
  const astrolabe = isLunar
    ? astro.byLunar(birthDate, timeIndex, iztroGender, isLeapMonth, true, 'vi-VN')
    : astro.bySolar(birthDate, timeIndex, iztroGender, true, 'vi-VN');

  const vietnam = enrichVietnamese(astrolabe, {timeIndex, male: iztroGender === 'male', viewYear});

  // chineseDate có dạng "Quý Dậu - Nhâm Tuất - Đinh Hợi - Canh Tý": phần đầu là Can Chi của NĂM sinh
  const yearParts = (astrolabe.chineseDate || '').split(' - ')[0].trim().split(/\s+/);
  const { tuan, triet } = calcTuanTriet(yearParts[0] || '', yearParts[1] || '');

  const palacesByBranch = {};
  astrolabe.palaces.forEach((p, idx) => {
    const branch = p.earthlyBranch;
    const majorStars = (p.majorStars || []).map((s) => ({
      name: s.name,
      brightness: vietnamBrightness(s.name, branch, formatBrightness(s.brightness)),
      mutagen: s.mutagen ? `Hóa ${s.mutagen}` : null,
      color: getStarColor(s.name),
    }));

    const minorStars = (p.minorStars || []).map((s) => ({
      name: s.name,
      brightness: vietnamBrightness(s.name, branch, formatBrightness(s.brightness)),
      type: s.type,
      color: getStarColor(s.name),
    }));

    const adjStars = (p.adjectiveStars || []).map((s) => ({
      name: s.name,
      brightness: vietnamBrightness(s.name, branch, formatBrightness(s.brightness)),
      type: s.type,
      color: getStarColor(s.name),
    }));

    const hungKeywords = [
      'Kình', 'Đà', 'Không', 'Kiếp', 'Hỏa', 'Linh', 'Kỵ', 'Hình', 'Riêu',
      'Hao', 'Tang', 'Hổ', 'Khốc', 'Hư', 'Cô', 'Quả', 'Phá', 'Phục', 'Bệnh',
      'Tử', 'Quan Phù', 'Quan Phủ', 'Thiên La', 'Địa Võng', 'Điếu', 'Phi', 'Kiếp Sát', 'Lưu Hà', 'Thiên Thương', 'Thiên Sứ',
    ];
    // Tứ Hóa may belong to a major OR minor star (e.g. Văn Xương/Hữu Bật).
    const transformations = [...p.majorStars, ...p.minorStars].filter(s => s.mutagen).map(s => ({
      name: `Hóa ${s.mutagen}`, brightness: '', type: 'mutagen', sourceStar: s.name, color: getStarColor(`Hóa ${s.mutagen}`),
    }));
    const allSubStars = [...new Map([...minorStars, ...adjStars, ...transformations].map(s => [s.name, s])).values()];
    const goodStars = [];
    const badStars = [];

    allSubStars.forEach((st) => {
      const isBad = hungKeywords.some((k) => st.name.includes(k));
      if (isBad) badStars.push(st);
      else goodStars.push(st);
    });

    palacesByBranch[branch] = {
      index: idx,
      name: p.name.toUpperCase(),
      isBodyPalace: p.isBodyPalace,
      heavenlyStem: p.heavenlyStem,
      earthlyBranch: branch,
      stemBranchShort: `${p.heavenlyStem.charAt(0)}.${branch}`,
      decadalStart: p.decadal?.range?.[0] || '',
      decadalEnd: p.decadal?.range?.[1] || '',
      changsheng12: p.changsheng12 || '',
      boshi12: p.boshi12 || '',
      jiangqian12: p.jiangqian12 || '',
      suiqian12: p.suiqian12 || '',
      majorStars,
      goodStars,
      badStars,
      monthIndex: `T.${p.monthNumber}`,
      smallLimitBranch: p.smallLimitBranch,
      isAnnualPalace: p.isAnnualPalace,
      hasTuan: tuan.includes(branch),
      hasTriet: triet.includes(branch),
    };
  });

  const age = vietnam.age;

  return {
    thienBan: {
      fullName: String(fullName).slice(0, 80),
      destiny: vietnam.destiny,
      elementRelation: vietnam.relation,
      yinYang: vietnam.yinYang,
      yinYangRelation: vietnam.yinYangRelation,
      viewYearCanChi: vietnam.viewYearCanChi,
      yearCanChi: vietnam.yearCanChi,
      lunar: vietnam.lunar,
      calculationProfile: 'Vietnamese rules over iztro 2.6.5',
      gender: iztroGender === 'male' ? 'Nam' : 'Nữ',
      solarDate: astrolabe.solarDate,
      lunarDate: astrolabe.lunarDate,
      chineseDate: astrolabe.chineseDate,
      time: `${birthHour} giờ (${astrolabe.time})`,
      timeRange: astrolabe.timeRange,
      fiveElementsClass: astrolabe.fiveElementsClass,
      soulStar: astrolabe.soul,
      bodyStar: astrolabe.body,
      earthlyBranchOfSoulPalace: astrolabe.earthlyBranchOfSoulPalace,
      earthlyBranchOfBodyPalace: astrolabe.earthlyBranchOfBodyPalace,
      viewYear,
      age,
      tuan,
      triet,
    },
    palaces: palacesByBranch,
  };
}
