# TÓM TẮT DỰ ÁN + LỊCH SỬ CẬP NHẬT (dành cho AI khác đọc nhanh)

> **Cách đọc tiết kiệm token:** đọc file này trước. `index.html` dài ~1760 dòng, KHÔNG cần đọc hết.
> Chỉ tìm đúng tên hàm ở mục 4 (grep `function tên`) rồi đọc quanh hàm đó.
> Người dùng KHÔNG rành kỹ thuật: luôn trả file hoàn chỉnh (cả `index.html` đầy đủ) để họ tải lên GitHub, không bắt sửa tay từng đoạn.

## 1. Dự án là gì
Tool tạo video kể chuyện 1-5 phút kiểu whiteboard: nhập truyện/ý tưởng → AI viết kịch bản chia cảnh → vẽ tranh đen trắng từng cảnh → bàn tay cầm bút vẽ lại từng nét → có giọng đọc + phụ đề → xuất video (webm/mp4) ngay trong trình duyệt.
- Không có build. Một trang tĩnh `index.html` (HTML+CSS+JS trong 1 file), chạy trên Vercel (`vercel.json`: region `sin1`).
- `api/vbee.js`: cầu nối (proxy) gọi Vbee TTS để tránh lỗi CORS. `api/webhook.js`: chỉ trả 200 (Vbee Batch bắt buộc có webhookUrl).
- Gọi trực tiếp từ trình duyệt: Gemini API (key người dùng dán, lưu `localStorage`), Hugging Face/Pollinations (code còn nhưng đã bị ẩn, xem mục 6).

## 2. Luồng chạy (2 giai đoạn)
1. Bấm **Bắt đầu tạo video** → `start()`: `makeScript` (kịch bản JSON) → `refineImages` (đạo diễn viết lại mô tả vẽ từng cảnh) → vẽ tranh từng cảnh (2 worker song song, mỗi cảnh thử tối đa 3 lần) → **chưa** làm giọng đọc.
2. Khung **Xem trước tranh** (`renderGallery`/`updateCard`): mỗi cảnh có thumbnail, nút **🔄 Vẽ lại** (`redraw(i)`), ô "Sửa mô tả tranh". Vẽ lại được bất kỳ lúc nào, kể cả sau khi đã có video.
3. Bấm **✅ Ưng rồi, tạo giọng đọc và video** → `makeVideo()`: thu giọng đọc từng cảnh (`makeVoice`), tính `s.dur`, hiện khung phát. Bấm lại nút này để chạy bù cảnh thiếu giọng.
4. `play(0)` xem thử, `play(1)` xuất video (MediaRecorder ghi canvas + âm thanh, chạy đúng bằng thời lượng video).

## 3. Dữ liệu chính
- Mỗi cảnh `scenes[i] = {text, image, prev, cv, ord, buf, dur, ok, busy, failed}`: `text` lời kể (tiếng Việt); `image` mô tả vẽ (tiếng Anh); `cv` canvas nét mực đã tách (nền trong suốt) kích thước W×H; `ord` thứ tự các ô 16px để tay vẽ theo (greedy gần nhất); `buf` AudioBuffer giọng đọc; `dur` giây.
- `fm` (khung hình, đặt trong `setFmt()` mỗi lần `start()`): `{v, ar, ah, cy, vw, sw, fs, lh, ml, sy}` = dọc?, tỉ lệ, chiều cao vùng tranh, tâm camera, bề ngang viewBox SVG (chiều cao luôn 900), chiều rộng/cỡ chữ/dòng/số dòng/vị trí phụ đề. Ngang: W×H = 1280×720; dọc: 720×1280. `W,H` là `let` toàn cục.
- Cài đặt lưu `localStorage['cfg_v3']` theo danh sách `CF` (ô nhập id trùng tên): fmt, nimg, keys, isrc, style, hftok, vsrc, voice, vapp, vtok, vcode, musicOn, musicVol, musicMood (ô `vfall` đã bỏ, xem mục 14), kèm `_t` (giờ lưu). Ảnh mẫu phong cách lưu riêng ở `localStorage['refimg_v1']` (JPEG data URL ≤896px). `saveSet` chạy mỗi khi gõ (sự kiện `input`) và khi đổi ô (`change`).
- Biến cờ: `abortGen` (nút Dừng tạo), `stopFlag` (dừng xem/xuất), `ctl` (AbortController đang chạy).

## 4. Bản đồ code `index.html` (số dòng xấp xỉ, bản hiện tại)
| Việc | Hàm / tên | ~Dòng |
|---|---|---|
| Danh sách model Gemini | `TXT_MODELS`, `TTS_MODELS`, `GEM_IMG_MODELS` | 198+ |
| Khung hình, **lưu cài đặt/key**, sao lưu | `setFmt`, `saveSet`, `updStat`, `saveNow`, `exportSet`, `importSet`, `clearKeys`, `vui` | 225-315 |
| Gọi Gemini (xoay key, thử lại) | `gem`, `gemMulti` | 346-405 |
| Kịch bản + đạo diễn hình ảnh | `makeScript`, `sceneCtx`, `refineImages` | 406-460 |
| **Nhân vật doodle** (5 vai + họa tiết áo) | `ROLE_DEF`, `markSvg`, `POSES`, `figAttrs`, `figureSvg`, `expandPeople` | 470-565 |
| **Thư viện đồ vật vẽ sẵn** | `PROPS`, `propAliases`, `propSvg`, `groundSvg`, `expandProps` | 566-645 |
| Prompt SVG cảnh (dùng thẻ person/prop/ground) | `MACRO_STYLES`, `SVGR_SCENE` | 645-670 |
| **Phong cách theo ảnh mẫu người dùng** | `REF_DEFAULT`, `refUpload`, `refReset`, `refStyleText`, `refUI` | 690-735 |
| Các phong cách vẽ | `STYLES`, `curStyle` | 735+ |
| Prompt SVG vẽ tay (kiểu không dùng nhân vật mẫu: pencil, manga, brush) | `SVGR_INK` | ~880 |
| Lọc SVG về đen/trắng + rung nét | `sanitizeSvg` | 890 |
| Tạo tranh 1 cảnh | `svgImage`, `makeImage` | 922-975 |
| SVG/ảnh → canvas nét mực + thứ tự vẽ | `inkify` | 977 |
| Giọng đọc Gemini / Vbee | `gemVoice`, `vbeeRaw`, `vbeeBatchOne`, `makeVoice` | ~1000-1340 |
| Chuẩn hóa giọng Gemini (cổng nhiễu, fade, cùng mức to), khóa model giọng | `normVoice`, `gemVoiceRaw`, `ttsPinned` | ~1095-1170 |
| Hỏi người dùng khi giọng lỗi, tạo lại toàn bộ giọng | `askRetry` trong `makeVideo`, `remakeVoices` | ~1480-1560 |
| Chốt chặn mảng đen quá lớn trong SVG | `whitenBigBlack` (gọi cuối `sanitizeSvg`) | ~940 |
| Nhạc nền tự tạo | `MUSIC_MOODS`, `normMood`, `musicPlan`, `startMusic` (ngay trước `play`) | ~1700+ |
| Nút kiểm tra key | `testGemini`, `testVbee` | 1156+ |
| Luồng chính | `start`, `makeVideo` | 1339, 1515 |
| Xem trước tranh | `renderGallery`, `updateCard`, `redraw` | 1460-1514 |
| **Bàn tay cầm bút (Path2D)**, phát/xuất video | `hand`, `play` | 1596, 1644 |
| **Vẽ 1 khung hình theo thời gian t** (dùng chung xem thử + xuất) | `makeRenderer` (trả về hàm `draw(t)`) | trước `play` |
| **Mốc thời gian → lịch trên tranh** | `parseDates`, `dateLabelSvg`, `addDateLabels` | trước `svgImage` |
| **Xuất video nhanh** (WebCodecs + mp4-muxer) | `fastExportOK`, `pickCodec`, `exportFast`, `FAST_CODECS` | trước `play` |

## 5. Nhân vật doodle và đồ vật vẽ sẵn (vì sao không để AI tự vẽ)
AI vẽ người/nhà/cây bằng SVG thường méo và mỗi cảnh một kiểu. Nên với `ref, stick, doodle, marker, minimal, kids` (`MACRO_STYLES`) AI **chỉ đặt thẻ**, tool vẽ thật **trước** `sanitizeSvg`: `expandProps()` rồi `expandPeople()`.
- **Người**: `<person role x y size pose face acc mark facing/>` → `figureSvg()` (đầu oval to, thân quả lê, tay chân mảnh). `role`: MAIN, SECOND, THIRD, FOURTH, CROWD; mỗi vai có `ROLE_DEF` mặc định (MAIN=tuft; SECOND=hat+stripe; THIRD=glasses+dots; FOURTH=long+vest; CROWD=trơn) để nhận ra nhân vật ở mọi cảnh. `pose`: stand, wave, cheer, point, walk, run, sit, sad, carry, think, shout, hips. `face`: smile, happy, open, flat, sad, cry, angry, surprised. `acc`: none, tuft, hat, cap, glasses, beard, crown, long. `mark`: none, stripe, dots, vest, tie. x,y = chỗ bàn chân chạm đất (viewBox `0 0 fm.vw 900`), size 1 ≈ cao 330.
- **Đồ vật**: `<prop type x y size facing/>` và `<ground y kind="grass|plain|road|sea"/>` → `propSvg()`/`groundSvg()`. ~45 loại, xem `PROPS`; đồ lơ lửng (`f:1`: sun, moon, star, cloud, rain, bird, fish, heart) có x,y là tâm, còn lại x,y là chân. `k` = hệ số tỉ lệ để size 1 vừa cỡ bên cạnh người MAIN 1.3.
- Muốn thêm tư thế: thêm vào `POSES`. Muốn thêm đồ vật: thêm vào `PROPS` (gốc ở chân, hướng lên là y âm) + ghi tên vào prompt `SVGR_SCENE`. Phong cách `pencil, manga, brush` vẫn để AI tự vẽ bằng `SVGR_INK`.

## 6. Cập nhật đã làm trong đợt này (theo thứ tự)
1. **Bàn tay + bút vẽ lại**: tay đi từ góc dưới bên phải lên, xoay theo vị trí ngòi (`hand`).
2. **Camera + chuyển cảnh** trong `play`: mỗi cảnh một kiểu zoom vào / lia trái / zoom ra / lia phải (`i%4`), cuối cảnh mờ dần 0,5s, phụ đề hiện/mờ dần và có nền trắng che.
3. **Khung hình ngang/dọc** (ô `fmt`): xem `setFmt`, `fm`, viewBox động trong `sanitizeSvg`/prompt, canvas dọc có class `.v`.
4. **Nhân vật doodle kiểu ảnh mẫu** (mục 5).
5. **Xem trước tranh + nút Vẽ lại + chốt tranh rồi mới tạo giọng đọc/video** (mục 2). `start()` giờ chỉ vẽ tranh.
6. **Bỏ 2 lựa chọn "Cách vẽ tranh"**: `free_img` (Gemini Image/Flux/Pollinations) và `img` (Gemini Image trả phí). Còn `svg_ink` và `svg`. Cài đặt cũ đã lưu giá trị bị bỏ sẽ tự về `svg_ink`. Các hàm `genGeminiImg`, `genHfImg`, `genFreeFluxImg`, ô `hftok` vẫn nằm trong code nhưng không còn đường nào gọi tới (`makeImage` luôn vào `svgImage`). Có thể xóa cho gọn.
7. **Ô "Số tranh"** (`nimg`): trống = tự động ≈ 1 tranh/9 giây; gõ số thì kịch bản chia đúng số cảnh đó. Giới hạn 3-20 giây/tranh và tối đa 80 tranh (`imgCount`). Đã bỏ chữ "(~N cảnh)" trong ô Độ dài.

8. **Khung "💾 Lưu cài đặt & key"** cuối phần ⚙ Cài đặt: tự lưu mỗi khi gõ/dán (`saveSet`, nghe sự kiện `input`), hiện tình trạng đã lưu (`updStat`), nút Lưu (`saveNow`), Tải/Nạp file sao lưu `.json` (`exportSet`/`importSet`), Xóa key (`clearKeys`). Vẫn dùng `localStorage['cfg_v3']`, thêm trường `_t` là giờ lưu.
9. **Phong cách "🖼 Theo ảnh mẫu"** (`style=ref`, nằm trong `MACRO_STYLES`, mặc định cho người mới): người dùng tải ảnh mẫu (`refUpload`, lưu `localStorage['refimg_v1']`; chưa tải thì dùng `REF_DEFAULT`). Nhân vật vẫn do `figureSvg` vẽ (đồng nhất, miễn phí); ảnh mẫu + mô tả phong cách (`refStyleText`) được gửi kèm để AI vẽ đồ vật/nền cùng cảm giác nét. Nhận diện nhân vật: `ROLE_DEF` có 5 vai MAIN/SECOND/THIRD/FOURTH/CROWD, mỗi vai có phụ kiện (`acc`) và họa tiết áo (`mark`: stripe/dots/vest/tie) riêng, vẽ bởi `markSvg`. Prompt kịch bản/đạo diễn/cảnh đã cập nhật theo 5 vai.
10. **Thư viện đồ vật vẽ sẵn** (`PROPS`, `propSvg`, `groundSvg`, `expandProps`, trước `MACRO_STYLES`): ~45 loại (nhà, cây, núi, mặt trời, bàn ghế, xe, thuyền, chó mèo...) AI chỉ đặt thẻ `<prop type x y size facing/>` và `<ground y kind/>`, tool vẽ sạch cùng nét với người que. `k` là hệ số tỉ lệ từng loại, `f:1` là đồ lơ lửng (x,y là tâm). Thêm đồ vật mới: thêm vào `PROPS` (gốc tọa độ ở chân, hướng lên là âm) + tên vào danh sách trong `SVGR_SCENE`. Prompt cấm tô đen mảng lớn.
11. **Bàn tay cầm bút mới** (`hand`, ~dòng 1596+): vẽ bằng `Path2D` (đường cong) thay cho các nét `cap` hình xúc xích: tay áo + cổ tay, mu bàn tay, ngón trỏ có móng, ngón cái, 3 ngón co lại. Gốc tọa độ = ngòi bút, trục +x dọc thân bút; góc xoay `a` và chữ ký hàm giữ nguyên nên `play()` không phải sửa. Đổi màu da/viền ở `SK`, `SKD`, `OL`; màu thân bút là `#2563eb`. Hàm `cap` không còn được `hand` dùng.

12. **Xuất video nhanh, không cần phát hết video** (sửa lỗi "phải xem hết video mới tải được"): trước đây `play(1)` ghi canvas bằng MediaRecorder theo thời gian thật. Giờ `play(1)` gọi `exportFast()` nếu `fastExportOK()`: (a) trộn giọng đọc + nhạc nền thành 1 đoạn âm thanh bằng `OfflineAudioContext` (dùng lại `startMusic(off, off.destination, ...)` với `t0=0`), (b) vẽ từng khung 30fps bằng `makeRenderer(...)` rồi mã hóa bằng `VideoEncoder`/`AudioEncoder`, (c) ghép thành mp4 bằng thư viện **mp4-muxer 5.1.5 (MIT) nhúng thẳng trong `index.html`** (thẻ `<script>` ngay trước script chính, không cần file/CDN ngoài). Chọn codec ở `pickCodec`: ưu tiên H.264+AAC (mp4 phổ biến, đăng được mọi nền tảng), nếu máy không có thì VP9+Opus trong mp4. Không có WebCodecs hoặc lỗi giữa chừng thì hiện nút "Xuất theo thời gian thật" = `play(1, true)` (đường MediaRecorder cũ vẫn còn). `play` (xem thử) và xuất nhanh dùng chung `makeRenderer`, nên đổi cách vẽ khung (camera, mờ cảnh, phụ đề, tay) chỉ sửa 1 chỗ. Độ mượt của tay giờ tính theo thời gian (`dt`) chứ không theo số khung.

13. **Vẽ mốc thời gian lên tranh**: nếu lời kể của cảnh có ngày/tháng/năm viết bằng chữ số thì tool tự vẽ lịch hoặc bảng ngày ở **góc trên bên trái** tranh. `parseDates(text)` (đặt ngay trước `svgImage`) nhận ra: `15 tháng 3 năm 2020`, `15/3/2020`, `ngày 5/1`, `5 tháng 4`, `tháng 7 năm 1998`, `tháng 12`, `năm 1945`, `những năm 1990`; bỏ qua `1/2 cốc`, `năm 2000 đồng`, `năm người`. Có ngày thì vẽ **tờ lịch** (`dateLabelSvg`: tháng, số ngày to, năm), chỉ có tháng/năm thì vẽ **bảng chữ nhật**; tối đa 2 nhãn/cảnh, xếp ngang. Nhãn được ghép vào SVG **sau** `sanitizeSvg` bằng `addDateLabels` (vì `sanitizeSvg` xóa `<text>`), dùng chữ viết tay hệ thống và bộ lọc rung `wob`. Prompt vẽ tranh được dặn chừa trống góc trên trái (`DATE LABEL`), và prompt kịch bản (`makeScript`) dặn viết ngày tháng năm bằng chữ số. Chưa nhận giờ trong ngày ("lúc 8 giờ") và ngày viết bằng chữ ("mười lăm tháng ba").

Đã có từ các bản trước (người dùng hoặc AI khác làm): nhiều phong cách vẽ, giọng Vbee qua `/api/vbee` (Realtime + Batch, trước đây tự chuyển Gemini nếu lỗi, NAY ĐÃ BỎ: lỗi thì hỏi người dùng, xem mục 14), xoay nhiều key Gemini, nút kiểm tra key.

## 7. Lưu ý khi sửa (bẫy đã gặp)
- CSS `display:flex` đè thuộc tính `hidden`: phần tử có display riêng cần thêm `[hidden]{display:none}` (đã xử lý cho `.ph`).
- `sanitizeSvg` ép mọi màu thành `#111111`/`#ffffff`, xóa `<text>`, `<image>`, gradient; nếu cần màu phải sửa hàm `toBW`.
- `setFmt()` chỉ chạy trong `start()` (và lúc tải trang): đổi ô khung hình sau khi đã tạo tranh không có tác dụng với tranh cũ; `start(true)` (chạy bù) tự giữ khung hình cũ.
- Thứ tự vẽ trong `figureSvg`: chân → thân → đầu → mặt → tay → phụ kiện (tay phải vẽ sau thân để cầm đồ/chống cằm được).
- Thẻ `<person>`/`<prop>` phải được bung ra TRƯỚC `sanitizeSvg` (nó xóa thẻ lạ). `sanitizeSvg` chỉ giữ `#111111`/`#ffffff`: đừng dùng màu khác trong `PROPS`.
- `hand` vẽ bằng `Path2D`; nhớ cặp `x.save()/x.restore()` (đã từng thừa một `save` gây lệch). Ngón tay bỏ `Z` ở cuối đường để không có nét viền ở gốc ngón.
- Chữ có dấu tiếng Việt: khi dùng `cut -c` trên terminal sẽ cắt giữa ký tự gây lỗi UTF-8; dùng Python để đọc.
- Xuất nhanh cần trình duyệt Chromium (Chrome/Edge) trên máy tính; Safari/Firefox tự rơi về xuất thời gian thật. Đã thử bằng Playwright (VP9+Opus, 2 khung hình, file ra đúng độ dài, có tiếng); **chưa thử đường H.264+AAC** vì trình duyệt thử nghiệm không có bộ mã hóa này, nên nếu máy người dùng báo lỗi xuất nhanh thì đọc thông báo lỗi và sửa `FAST_CODECS`/`pickCodec`.
- `makeVoice` có hàng đợi riêng cho Vbee (`vq`) vì Vbee giới hạn số yêu cầu đồng thời.

## 8. Kiểm thử (đã làm) và chưa làm
- Đã thử bằng Playwright + dữ liệu giả (ghi đè `gemMulti`, `makeVoice`): luồng tạo tranh → xem trước → vẽ lại → tạo video, cả khung ngang và dọc, bảng 12 tư thế nhân vật; lưu/nạp/xóa key và tải ảnh mẫu; bảng ~45 đồ vật; 4 nhân vật 4 vai; một cảnh ghép nhà+núi+người+chó; bàn tay mới ở 2 góc xoay.
- **Chưa thử với key Gemini/Vbee thật**: chưa biết AI đặt thẻ `<prop>`/`<person>` có bố cục đẹp không (có thể chồng nhau, cần chỉnh prompt `SVGR_SCENE`), chưa biết chất lượng đoạn mô tả phong cách do `refStyleText` trả về.
- Ý tưởng chưa làm: thêm đồ vật Việt Nam (trâu, ruộng lúa, nhà sàn, thuyền thúng); tự tránh chồng chéo khi đặt đồ vật/người; cho chỉnh màu da/áo/bút của bàn tay; Cloudflare Workers AI (FLUX schnell, cần file cầu nối kiểu `api/vbee.js`); ô chỉnh số tranh vẽ cùng lúc và thời gian nghỉ giữa các tranh (nếu gặp lỗi 429 của Gemini); màu theo vai nhân vật (hiện đen trắng hoàn toàn); xóa code chết `genGeminiImg`, `genHfImg`, `genFreeFluxImg`, ô `hftok`.

## 10. Sửa lỗi tranh bị bôi đen (đợt gần nhất)
Nguyên nhân: `sanitizeSvg` ép mọi màu tô "không phải gần trắng" thành ĐEN (xanh trời, xám, be -> đen), hình AI quên ghi `fill` thì SVG mặc định tô đen, và `style="fill:..."` không được xử lý.
Đã sửa: (1) `toBW(v, isFill)`: màu tô sáng/trung bình -> trắng, chỉ màu thật tối mới đen; (2) bỏ thuộc tính `style`; (3) nhóm bọc có `fill="none"` mặc định; (4) `whitenBigBlack()`: hình tô đen có vùng bao > 10% khung thì đổi sang trắng; (5) `inkify`: nếu >30% điểm ảnh đen thì ném lỗi để tự vẽ lại (vòng thử 3 lần); (6) prompt `SVGR_SCENE` dặn rõ không vẽ nền, luôn ghi fill.

## 11. Nhạc nền tự tạo (hướng C, WebAudio, không cần file nhạc)
- Kịch bản AI trả thêm `mood` mỗi cảnh (calm, sad, tense, mystery, happy, epic, hopeful) -> `scenes[i].mood`.
- Code nằm ngay trước `play()`: `MUSIC_MOODS` (bảng thông số từng tâm trạng), `normMood`, `musicPlan` (gộp cảnh cùng tâm trạng, đoạn <14s nhập vào đoạn bên cạnh), `startMusic` (pad + bass + giai điệu thưa + trống/tim đập tùy mood, chuyển đoạn crossfade 1,5s, nhạc tự hạ còn 50% khi có giọng đọc, tắt dần cuối video).
- Nhạc đi qua cùng `dest` của MediaRecorder nên vào được file video xuất. Hạt giống ngẫu nhiên cố định nên xem thử và xuất cho nhạc giống nhau.
- UI trong khung phát video: ô `musicOn`, thanh `musicVol`, chọn `musicMood` (auto hoặc khóa một tâm trạng); cả 3 lưu trong `CF`.
- Muốn thêm tâm trạng: thêm vào `MUSIC_MOODS` + `normMood` + prompt `makeScript` + ô chọn `musicMood`.

## 12. Giọng Gemini không đồng nhất giữa các cảnh (đã sửa)
Nguyên nhân: mỗi cảnh gọi TTS riêng; khi một model lỗi thì code tự đổi sang model khác (giọng khác hẳn), model 3.8 không có câu chỉ dẫn phong cách còn 2.5 thì có, nhiệt độ mặc định cao nên nhịp/âm sắc dao động, và mức to nhỏ + khoảng lặng đầu/cuối mỗi cảnh khác nhau.
Đã sửa trong `gemVoiceRaw`: (1) `ttsPinned` khóa một model cho cả video, thử lại cùng model 1 lần trước khi đổi, đổi thì có log cảnh báo; (2) `temperature: 0.3` (tự bỏ nếu model báo 400, lưu ở `ttsNoTemp`); (3) `normVoice()` cắt lặng thừa và đưa mọi cảnh về cùng mức RMS (~0.12, giới hạn mềm bằng tanh). Thêm nút `remakeVoices()` "🔁 Tạo lại toàn bộ giọng" (xóa `s.buf` rồi chạy lại `makeVideo`).

## 13. Tiếng "sẹt" lúc chuyển cảnh
Code không có hiệu ứng âm thanh chuyển cảnh, nên "sẹt" là tạp âm: (a) đuôi/đầu clip giọng TTS bị xì hoặc "bụp" vì cắt gắt, (b) nhạc đổi đoạn. Đã sửa: `normVoice` thêm cổng giảm nhiễu (hạ còn 25% đoạn rất nhỏ), fade vào 30ms / ra 120ms, trần khuếch đại 3 lần (trước 6), chừa lặng 40ms; nhạc đổi đoạn crossfade 2,5s.

## 14. Vbee lỗi thì HỎI người dùng, không tự đổi sang Gemini
Yêu cầu của người dùng: không được tự ý đổi giọng vì video sẽ lẫn 2 giọng. Đã bỏ ô `vfall` và đoạn tự chuyển trong `makeVoice` (nay Vbee lỗi thì ném lỗi lên). Trong `makeVideo`, mỗi lần một cảnh lỗi giọng sẽ hiện hộp thoại (`askRetry`, xếp hàng, không chồng nhau): OK = thử lại cảnh đó, Hủy = dừng tạo giọng (`voiceHalt`), cảnh chưa có giọng để trống, sửa lỗi xong bấm lại nút xanh để chạy bù. KHÔNG thêm lại cơ chế tự đổi giọng. Nếu trước đó đã có cảnh thu bằng Gemini rồi đổi sang Vbee, dùng nút "Tạo lại toàn bộ giọng" để cả video cùng một giọng.

## 15. Quy tắc người dùng đã nêu (đừng phá khi sửa tiếp)
- Một video chỉ được có MỘT giọng: không tự đổi Vbee sang Gemini (mục 14); Gemini cũng khóa một model (mục 12).
- Người dùng không rành kỹ thuật: luôn trả `index.html` đầy đủ (hoặc cả zip) và cập nhật file này sau mỗi lần sửa.

## 16. Tranh phải ăn khớp lời kể: bỏ cảnh vật thừa, không phải cảnh nào cũng vẽ người (đợt gần nhất)
Phản hồi người dùng: cảnh vật nền không liên quan truyện; cảnh kể về vật thì không cần vẽ người; tranh phải có đúng vật được nhắc (người đàn ông cầm tiền thì phải có cục tiền).
Nguyên nhân: `SVGR_SCENE` ép "2-4 người", "5-9 thẻ", "thêm 2-5 đồ vật nền", "mỗi cảnh ngoài trời có <ground>"; `PROPS` không có tiền mặt (alias `money` đang trỏ về `bag`); thẻ không có trong thư viện bị bỏ im lặng.
Đã sửa:
1. **Nhãn loại cảnh** `[OBJECT]` (cận cảnh đồ vật, KHÔNG người) / `[PERSON]` / `[PLACE]` đặt đầu mô tả vẽ: do `makeScript` (trường `image`) và `refineImages` (quy tắc 0-5) sinh ra; `SVGR_SCENE` có STEP 1 bắt AI chọn loại cảnh, chỉ vẽ cái lời kể cần, cấm đồ trang trí không được nhắc, nền trắng trống là tốt, `<ground>` chỉ dùng khi cần.
2. **Người cầm đồ**: thuộc tính mới `hold="cash"` (và `holdsize`) trên `<person>`, xử lý trong `figureSvg` ngay sau khi vẽ tay; nếu có `hold` mà pose là stand thì tự đổi sang `carry`. Đồ cầm lấy từ `PROPS` (có alias).
3. **~30 đồ vật mới trong `PROPS`**: cash (xấp tiền), banknote, key, letter, paper, gift, flower, apple, bread, cake, pot, clock, bucket, umbrella, crown, trophy, magnifier, diamond, ring, flag, computer, bicycle, bus, plane, bridge, hospital, school, well, buffalo. Bảng alias mở rộng (money/cash_stack/bundle -> cash, gold/coins -> coin, tv/laptop -> computer...).
4. `propSvg` tra cứu mềm (bỏ chữ s cuối, tách tên ghép như `old_house`), cho `size` tới 4 để đồ vật làm chủ thể được phóng to.
5. Danh sách đồ vật trong prompt tự lấy từ `Object.keys(PROPS)` (thay `__GROUNDPROPS__`/`__FLOATPROPS__` trong `svgImage`): thêm đồ vật mới chỉ cần thêm vào `PROPS`, không phải sửa prompt. Thứ cần mà thư viện chưa có thì AI tự vẽ tối đa 6 hình đơn giản (trước đây chỉ 3).
6. Khung dọc không còn ép "phần trên vẽ trời/mây"; phong cách ảnh mẫu (`ref`) chỉ lấy cảm giác nét, không thêm trang trí.
Kiểm thử đã làm: Playwright vẽ bảng toàn bộ đồ vật mới; cảnh người cầm tiền, cảnh chỉ có giấy nợ + tiền (không người), alias `old_house`/`money_stack`, đi qua `expandProps` + `expandPeople` + `sanitizeSvg`. **Chưa thử với key Gemini thật**: cần xem AI có chọn đúng nhãn [OBJECT]/[PERSON]/[PLACE] không; nếu vẫn thêm người/cảnh thừa thì chỉnh STEP 1 trong `SVGR_SCENE`. Truyện cũ đã tạo kịch bản chưa có nhãn: bấm "Bắt đầu tạo video" lại để đạo diễn viết lại mô tả, hoặc tự gõ nhãn vào ô "Sửa mô tả tranh" rồi Vẽ lại.

## 17. Màu nhấn (đỏ máu/lửa, vàng ánh sáng, xanh tiền, xanh nước)
Trước đây `sanitizeSvg` ép mọi thứ về đen/trắng. Nay giữ lại đúng 5 màu nhấn, bảng `COL` (đặt ngay trước `PROPS`): red `#e63946`, orange `#ff8c1a`, yellow `#ffd60a`, green `#2fa84f`, blue `#3a86ff`. Nét viền luôn đen, màu chỉ dùng để TÔ vài thứ mang ý nghĩa truyện.
- **Công tắc** `accentOn` (checkbox "🎨 Màu nhấn" dưới "Hiện phụ đề", có trong `CF` nên được lưu). Tắt thì mọi màu nhấn thành trắng (tô)/đen (nét), tranh đen trắng như cũ.
- `accentOf(v)` (trước `sanitizeSvg`): đổi màu AI ghi (tên màu hoặc hex/rgb sặc sỡ, bão hòa >= 0.5, đủ đậm) về màu gần nhất trong 5 màu; màu nhạt/xám/be vẫn bị ép trắng/đen như cũ để không bị bôi màu cả bầu trời.
- `whitenBigBlack`: mảng màu nhấn do AI tự vẽ mà bao > 18% khung thì đổi trắng. Đồ vật thư viện có thuộc tính `data-keep="1"` (do `_Pc/_Cc/_Rc/_flame/_spiky` gắn) được miễn, vì tia sáng, lửa, vụ nổ vốn to.
- **Đồ vật có màu mới trong `PROPS`**: blood (vũng + giọt máu), flames (hàng lửa rộng), fire_big, beam (tia sáng dưới đèn/cửa sổ, vẽ TRƯỚC vật được chiếu), bulb (ý tưởng), spark (lấp lánh), lightning, explosion, smoke (nét đen), drop (giọt nước/nước mắt). Đồ cũ được tô: cash/banknote xanh lá, coin/crown/trophy/key/sun/moon/star/đèn vàng, fire cam+vàng, heart/apple/flag/nơ quà đỏ, diamond xanh, waves/rain nét xanh.
- Prompt `SVGR_SCENE`: mục COLOR ACCENTS (thay `__ACCENTRULE__` theo công tắc), mục STORY EFFECTS (máu, nhà cháy = ruins/house + flames + smoke vẽ SAU nhà, ánh sáng = beam, tiền = cash) và ví dụ nhà cháy. `refineImages` quy tắc 6 bắt đạo diễn ghi các từ khóa blood/flames/beam/cash... vào mô tả.
- Thêm màu mới: thêm vào `COL`, thêm nhánh hue trong `accentOf`, ghi vào mục COLOR ACCENTS. Phong cách pencil/manga/brush (`SVGR_INK`) vẫn đen trắng.
- Kiểm thử Playwright: nhà cháy, máu, đèn + tia sáng, người cầm tiền + đồng xu, nổ/sét/mưa/mặt trời, công tắc tắt màu. Chưa thử key Gemini thật: cần xem AI có chọn đúng `flames`/`blood`/`beam` khi lời kể có lửa/máu/ánh sáng không.

## 18. Địa danh nổi tiếng + nhân vật nổi tiếng nhận ra ngay
- `PROPS` có thêm 11 địa danh (eiffel, liberty, bigben, pyramid, colosseum, pisa, fuji, whitehouse, khue, motcot, greatwall) kèm alias (paris, london, egypt...). Mỗi cái có `n` = tên hiện trên nhãn. Thêm địa danh mới: thêm vào `PROPS` (có `n`) + ghi vào đoạn FAMOUS PLACES AND PEOPLE của `SVGR_SCENE`.
- `<person who="trump|einstein|jobs|bacho|napoleon|lincoln"/>`: bảng `WHO` đặt sẵn phụ kiện/áo (tóc vàng vuốt + cà vạt đỏ, tóc bù + ria, kính tròn + áo cổ lọ, râu dê, mũ Napoleon, mũ cao + râu). Thêm người mới: thêm vào `WHO` + một nhánh `acc` trong `figureSvg` (trước nhánh `hat`) + ghi vào prompt.
- Nhãn tên: `_tags` được `propSvg`/`figureSvg` ghi, `addTags` vẽ nhãn ở dưới chân sau `sanitizeSvg` (như `addDateLabels`). Chưa thử key Gemini thật: cần xem AI có chọn đúng prop/`who` khi lời kể nhắc tên.

## 19. Nhận diện tự do (không cần thêm vào thư viện)
Người/địa danh KHÔNG có trong `WHO`/`PROPS`: AI tự ghép. `featSvg(a)` (trước `figureSvg`) vẽ tóc (`hair`, `haircolor`), ria (`stache`), mũ (`hat`), cà vạt (`tie`) từ thuộc tính `<person>`; thẻ `<label text x y/>` (xử lý trong `expandProps`) đẩy tên vào `_tags` để `addTags` vẽ nhãn. Prompt `SVGR_SCENE` mục FAMOUS dặn AI mô tả 2-3 nét đặc trưng rồi mã hóa; địa danh lạ thì AI tự vẽ bóng dáng đặc trưng (tối đa 6 hình). Chất lượng phụ thuộc AI: chưa thử key thật.

## 20. Màu chỉ để nhấn mạnh
Theo yêu cầu người dùng: tóc/mũ/cà vạt/đuốc của địa danh và nhân vật nổi tiếng (mục 18-19) KHÔNG tô màu, chỉ đen/trắng. Màu nhấn (mục 17) chỉ dành cho thứ truyện cần nhấn mạnh (máu, lửa, tiền...). Đừng thêm màu cố định cho nhân vật/đồ vật.

## 21. Bàn tay thật (tuỳ chọn)
Ô `handFile` (cạnh ô Màu nhấn): tải PNG nền trong suốt của bàn tay cầm bút, bấm 2 điểm (ngòi, đuôi bút) trên ảnh xem trước. `hand()` thấy `handImg`+`handPts` thì vẽ ảnh thật (ngòi tại điểm vẽ, xoay theo góc cũ), không thì dùng bàn tay Path2D cũ. Lưu `localStorage['handimg_v1','handpts_v1']`. Ảnh có sẵn checkerboard in cứng/watermark (vd pngtree) không dùng được.

## 22. Nâng cấp đạo diễn/tư thế/màu/đồ vật (đợt lớn)
- `refineImages` quy tắc 7: thêm nhãn góc máy [WIDE/MEDIUM/CLOSE/XCLOSE/TOP/LOW/SIDE/OTS] + vị trí + chi tiết bắt buộc; `SVGR_SCENE` có khối CAMERA/DEPTH (3 lớp tiền/trung/hậu). JSON không đổi (chỉ thêm nhãn vào chuỗi mô tả).
- `POSES` thêm: pray, shake, hug, push, pull, guard, flee, fall, fight, armed, kneel, plead, getup (kneel/plead/getup dùng dáng ngồi, gần đúng). Nét mặt thêm: worried, scared, doubt, determined, tired, proud.
- Chế độ màu `cmode` (accent, bw, retro, warm, cool, comic): bảng `PAL`, `applyPalette()` gán vào `COL`; `accentEnabled()` thay cho kiểm tra checkbox; áo nhân vật theo vai (`shirtFill`: MAIN xanh dương, SECOND đỏ, THIRD xanh lá, FOURTH cam) ở 4 chế độ màu mới, giữ nguyên mọi cảnh.
- `PROPS` thêm: map, sword, rifle, cannon, tank, train, motorbike, drum, gate, dinh, boots, nonla (+ alias). Đồ lạ không có trong thư viện: `propSvg` vẽ hình dự phòng + nhãn tên.
- Kiểm tra chất lượng trong `svgImage`: SVG phải hợp lệ và có >= 2 hình, sai thì ném lỗi để vòng thử lại 3 lần vẽ lại.
- CHƯA làm: thống nhất bộ dựng cho pencil/manga/brush (vẫn `SVGR_INK`), kiểm thử trực quan, kiểm tra vật ngoài khung/chồng lấn, tối ưu thứ tự nét.

## 23. Chuyển cảnh lật giấy
`makeRenderer`: 0,9s cuối mỗi cảnh (trừ cảnh cuối, và cảnh ngắn <= 2s) chụp khung hiện tại vào canvas `sn`, vẽ lại thành 80 dải cắt ngang quanh gáy bên trái (xoay 0-180°, hơi phối cảnh, đổ bóng), lộ trang trắng cảnh sau; mặt sau tờ giấy xám nhạt. Dùng chung cho xem thử, xuất nhanh, xuất thời gian thật. Công tắc `flipOn` (có trong `CF`). Chưa có tiếng giấy lật.

## 24. Sửa địa danh sau lần thử thật
Tháp Eiffel vẽ lại (thân cong lõm, vòm chân, 3 tầng, ăng-ten). `PROPS[k].h/.w` + clamp trong `propSvg`: địa danh luôn nằm trọn khung, nhãn tên chỉ gắn sau khi đã clamp, `addTags` bỏ nhãn trùng tên. Prompt dặn cỡ 0.9-1.4, không để người che địa danh.

## 25. Mỗi người một nét + biểu tượng thay cho minh họa chữ nghĩa (theo góp ý đánh giá video, điều 4)
- **Mỗi người trong một tranh khác nhau ít nhất một nét**: `uniquePeople(list)` (ngay trước `expandPeople`) chạy trên tất cả thẻ `<person>` của một tranh. Hai người có cùng (acc + mark sau khi áp `ROLE_DEF`) thì người trùng được gán cặp acc/mark khác (`_CR_ACC` x `_CR_MARK`, tránh trùng 4 vai chính trong `ROLE_DEF`); CROWD không được đứng cùng một dáng (`_CR_POSE`). Bỏ qua người có `who`/`hair`/`hat`/`stache` (nhân vật nổi tiếng, nét AI tự mô tả) và người có `hold`. Lỗi gì thì vẽ như cũ (try/catch).
- **8 biểu tượng mới trong `PROPS`** (+ alias): `chart_down` (biểu đồ cột đi xuống, mũi tên đỏ), `chart_up` (đi lên, mũi tên xanh lá), `arrow_down` (đỏ), `arrow_up` (xanh lá), `percent`, `warning` (tam giác vàng), `wallet` (ví + tiền xanh), `newspaper`. Alias: crash/decline/loss/recession -> chart_down; growth/profit/rise/chart -> chart_up; down/decrease, up/increase, discount/sale, alert/danger/risk, purse, news/headline/press. Danh sách đồ vật trong prompt tự lấy từ `PROPS` nên không phải sửa danh sách.
- **Prompt**: `SVGR_SCENE` thêm mục "EVERY PERSON IS DIFFERENT" và "NEWS / NUMBERS / ECONOMY / ABSTRACT IDEAS: use SYMBOLS" (đặt ngay trước dòng "Do NOT put a person..."); `refineImages` quy tắc 1 và 4 đã mở rộng (ý trừu tượng/tin tức -> biểu tượng; mọi người trong cảnh phải khác nhau); `makeScript` trường `characters` dặn mỗi nhân vật khác mọi nhân vật còn lại ít nhất một nét.
- Màu: chart_down/arrow_down đỏ (giảm, nguy hiểm), chart_up/arrow_up xanh lá (tăng), warning vàng, wallet có tiền xanh. Nằm trong `COL` nên đổi theo chế độ màu `cmode`, và tắt màu nhấn thì thành trắng như các đồ vật khác.
- Kiểm thử: Chrome headless vẽ 8 biểu tượng + 5 người CROWD + 2 người MAIN trùng nhau (người trùng tự đổi nét). Chưa thử key Gemini thật: cần xem AI có chọn chart_down/arrow_down... cho cảnh tin tức không.
- CHƯA làm (các điều khác trong góp ý): điều 1 (giới hạn tối đa 3 đối tượng/cảnh, một chủ thể to), điều 2 (dùng cả khung dọc, không để trống đáy), điều 3 (chèn chữ khóa viết tay/con số như "-40%").

## Cập nhật: cảnh trừu tượng + chế độ tự động
- Đạo diễn hình ảnh (`refineImages`): `[OBJECT]` chỉ dùng cho vật/số liệu cụ thể; ước mơ/suy nghĩ/lời nói dùng [PERSON] kèm bong bóng; cảnh tương phản chia đôi khung; nhân vật chính có mặt ≥ 2/3 số cảnh, không để khung trống (quy tắc 8-10).
- Thêm prop: `thought`, `speech` (bong bóng, f:1, x,y là tâm), `podium, camera, mic, megaphone, gavel, golf, rocket, briefcase, scales, ballot, throne` và nhiều alias (`Object.assign(propAliases, ...)` ngay sau `propAliases`).
- `SVGR_SCENE`: thêm luật MISSING OBJECTS (đồ không có trong thư viện thì AI tự vẽ, không thay bằng đồ khác), luật bong bóng và chia khung.
- Giao diện: ẩn ô "Cách vẽ tranh" và "Phong cách vẽ" (`#drawPick`), mỗi lần mở ép `isrc=svg_ink`, `style=ref` (chế độ tự động). Ô ảnh mẫu vẫn dùng được.
