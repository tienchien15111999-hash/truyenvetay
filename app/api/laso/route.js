import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateLaSo } from '../../../lib/tuvi.js';

export const runtime = 'nodejs';

// Phông Be Vietnam Pro nhúng sẵn trong dự án (phông mặc định thiếu dấu tiếng Việt)
let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'lib', 'fonts');
    fontsPromise = Promise.all([
      readFile(path.join(dir, 'BeVietnamPro-Regular.ttf')),
      readFile(path.join(dir, 'BeVietnamPro-Bold.ttf')),
    ]).then(([regular, bold]) => [
      { name: 'Be Vietnam Pro', data: regular, weight: 400, style: 'normal' },
      { name: 'Be Vietnam Pro', data: bold, weight: 700, style: 'normal' },
    ]).catch((e) => { fontsPromise = null; throw e; });
  }
  return fontsPromise;
}

// tên sao + độ sáng (phụ tinh không có độ sáng thì chỉ hiện tên)
function starLabel(s) {
  return `${s.name}${s.brightness || ''}`;
}

function renderPalaceCell(palace, cellHeight) {
  if (!palace) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '250px',
        height: `${cellHeight}px`,
        border: '1px solid #475569',
        padding: '6px 8px',
        backgroundColor: '#f8fafc',
        fontSize: '11px',
        position: 'relative',
      }}
    >
      {/* Dòng trên cùng: Can Chi cung | Tên Cung Chức <THÂN> | Gốc Đại Vận */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span style={{ color: '#ea580c', fontWeight: 700 }}>{palace.stemBranchShort}</span>
        <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '12px' }}>
          {`${palace.name}${palace.isBodyPalace ? ' <THÂN>' : ''}`}
        </span>
        <span style={{ color: '#1e293b', fontWeight: 700 }}>{palace.decadalStart}</span>
      </div>

      {/* Chính tinh */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '3px 0', minHeight: '34px' }}>
        {palace.majorStars.map((s, idx) => (
          <div key={idx} style={{ color: s.color, fontWeight: 800, fontSize: '14px' }}>
            {starLabel(s)}
          </div>
        ))}
      </div>

      {/* Phụ tinh 2 cột: Cát tinh bên trái, Hung tinh bên phải */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexGrow: 1, width: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '48%' }}>
          {palace.goodStars.map((s, i) => (
            <span key={i} style={{ color: s.color, fontSize: '10px', lineHeight: '1.25' }}>
              {starLabel(s)}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '48%' }}>
          {palace.badStars.map((s, i) => (
            <span key={i} style={{ color: s.color, fontSize: '10px', lineHeight: '1.25' }}>
              {starLabel(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Nhãn TUẦN / TRIỆT */}
      {(palace.hasTuan || palace.hasTriet) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '2px' }}>
          {palace.hasTriet && (
            <span style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '1px 8px', fontSize: '10px', fontWeight: 700 }}>
              Triệt
            </span>
          )}
          {palace.hasTuan && (
            <span style={{ backgroundColor: '#1e293b', color: '#ffffff', padding: '1px 8px', fontSize: '10px', fontWeight: 700 }}>
              Tuần
            </span>
          )}
        </div>
      )}

      {/* Dòng dưới cùng: Địa chi | Vòng Trường Sinh | Tháng xem */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '3px', borderTop: '1px dashed #cbd5e1', paddingTop: '2px' }}>
        <span style={{ fontWeight: 700, color: '#334155' }}>{palace.smallLimitBranch}</span>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{palace.changsheng12}</span>
        <span style={{ fontWeight: 700, color: '#475569' }}>{palace.monthIndex}</span>
      </div>
    </div>
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fullName = searchParams.get('name') || 'Khách hàng';
  const gender = searchParams.get('gender') || 'nu';
  const birthDate = searchParams.get('date') || '1993-11-01';
  const birthHour = Number(searchParams.get('hour') ?? '23');
  const isLunar = searchParams.get('lunar') === '1';
  const viewYear = Number(searchParams.get('viewYear') ?? new Intl.DateTimeFormat('en', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric'}).format(new Date()));

  let laSo;
  try {
    laSo = generateLaSo({ fullName, gender, birthDate, birthHour, isLunar, isLeapMonth: searchParams.get('leap') === '1', viewYear });
  } catch {
    return new Response('Ngày giờ sinh không hợp lệ', { status: 400 });
  }
  const fonts = await loadFonts();
  const p = laSo.palaces;
  const tb = laSo.thienBan;
  const maxRows = Math.max(...Object.values(p).map(cell => Math.max(cell.goodStars.length, cell.badStars.length)));
  const cellHeight = Math.max(280, 110 + maxRows * 14);
  if (searchParams.get('format') === 'json') return Response.json(laSo);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1000px',
          height: `${cellHeight * 4}px`,
          backgroundColor: '#ffffff',
          border: '2px solid #1e293b',
          fontFamily: 'Be Vietnam Pro',
        }}
      >
        {/* Hàng 1: Tỵ - Ngọ - Mùi - Thân */}
        <div style={{ display: 'flex', width: '1000px', height: `${cellHeight}px` }}>
          {renderPalaceCell(p['Tỵ'], cellHeight)}
          {renderPalaceCell(p['Ngọ'], cellHeight)}
          {renderPalaceCell(p['Mùi'], cellHeight)}
          {renderPalaceCell(p['Thân'], cellHeight)}
        </div>

        {/* Hàng 2 & 3 */}
        <div style={{ display: 'flex', width: '1000px', height: `${cellHeight * 2}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: '250px', height: `${cellHeight * 2}px` }}>
            {renderPalaceCell(p['Thìn'], cellHeight)}
            {renderPalaceCell(p['Mão'], cellHeight)}
          </div>

          {/* Ô Trung Tâm: THIÊN BÀN */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              width: '500px',
              height: `${cellHeight * 2}px`,
              border: '1px solid #475569',
              padding: '24px',
              backgroundColor: '#f1f5f9',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#15803d', marginBottom: '16px' }}>
              LÁ SỐ TỬ VI
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px', fontSize: '14px' }}>
              {[
                ['Họ tên', tb.fullName],
                ['Dương lịch', tb.solarDate],
                ['Âm lịch', `${tb.lunar.lunarDay}/${tb.lunar.lunarMonth}/${tb.lunar.lunarYear}${tb.lunar.isLeap ? ' (nhuận)' : ''}`],
                ['Can chi', tb.chineseDate.split(' - ').slice(0, 3).join(' · ')],
                ['Giờ sinh', `${tb.timeRange} · ${tb.chineseDate.split(' - ')[3]}`],
                ['Năm xem', `${tb.viewYear} · ${tb.viewYearCanChi} (${tb.age} tuổi)`],
                ['Âm dương', `${tb.yinYang} · ${tb.yinYangRelation}`],
                ['Bản mệnh', tb.destiny],
                ['Cục', tb.fiveElementsClass],
                ['Mệnh / Cục', tb.elementRelation],
                ['Chủ Mệnh / Thân', `${tb.soulStar} / ${tb.bodyStar}`],
                ['Tuần / Triệt', `${tb.tuan.join('–')} / ${tb.triet.join('–')}`],
              ].map(([label, value]) => (
                <div key={label} style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', width:'100%'}}>
                  <span style={{fontWeight:700, color:'#334155', flexShrink:0, width: '138px'}}>{label}:</span>
                  <span style={{color:'#1d4ed8', textAlign:'right', maxWidth:'300px'}}>{value}</span>
                </div>
              ))}
              <div style={{display:'flex', fontSize:10, color:'#64748b', marginTop:12}}>
                M: Miếu · V: Vượng · Đ: Đắc · B: Bình · H: Hãm
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', width: '250px', height: `${cellHeight * 2}px` }}>
            {renderPalaceCell(p['Dậu'], cellHeight)}
            {renderPalaceCell(p['Tuất'], cellHeight)}
          </div>
        </div>

        {/* Hàng 4: Dần - Sửu - Tý - Hợi */}
        <div style={{ display: 'flex', width: '1000px', height: `${cellHeight}px` }}>
          {renderPalaceCell(p['Dần'], cellHeight)}
          {renderPalaceCell(p['Sửu'], cellHeight)}
          {renderPalaceCell(p['Tý'], cellHeight)}
          {renderPalaceCell(p['Hợi'], cellHeight)}
        </div>
      </div>
    ),
    {
      width: 1000,
      height: cellHeight * 4,
      fonts,
    }
  );
}
