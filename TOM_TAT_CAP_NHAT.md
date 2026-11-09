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

## Cập nhật: vẽ đủ + bỏ khung thừa
- Đạo diễn hình ảnh: quy tắc 11 "VẼ ĐỦ" (mỗi người/vật được nhắc đều phải có mặt, mô tả kết thúc bằng `MUST SHOW: ...`); `SVGR_SCENE` có luật tương ứng.
- `dropFrameRects()` (gọi trong `sanitizeSvg`): tự xóa rect/path chữ nhật phủ ≥ 80% khung tranh, tránh viền mỏng thừa bên trong.

## Cập nhật: chế độ màu còn 3 kiểu
- `#cmode`: Đen trắng (`bw`) / Màu nhấn (`accent`, mặc định) / Ảnh màu (`color`, bảng màu `PAL.color`, tô nhiều hình, nét viền đen vẫn dày). Giá trị cũ đã lưu (retro/warm/cool/comic) tự về `accent`.
- `svgImage`: nhánh `cm === 'color'` có luật tô màu cả tranh (8-25 hình, không hình nào quá 1/5 khung, không nền đen).

## Cập nhật: chép lời từ video
- Khung "Hoặc tải video có sẵn" dưới ô truyện: `#vidFile`, nút `#vidBtn` gọi `videoToText()`.
- `videoToText()`: giải mã âm thanh bằng `OfflineAudioContext` 16kHz mono, cắt đoạn 4 phút, `pcmToWavB64()` mã hóa WAV, gửi từng đoạn cho Gemini (`gemMulti(TXT_MODELS, ...)` với `inlineData` audio/wav), nối kết quả vào `#idea`.
- Ô `#rewriteOn` (mặc định bật): `makeScript` dùng chỉ dẫn `REWRITE` để viết lại thành truyện mới bằng lời văn khác, giữ sự kiện/số liệu, bỏ quảng cáo và lời chào.
- Giới hạn: file ≤ 500MB; trình duyệt phải giải mã được âm thanh (MP4/MP3/WAV/WebM).

## Cập nhật: video dài 10-25 phút
- `#min`: thêm 10/15/20/25 phút; `#nimg` max 200. `imgCount()`: từ trên 5 phút tự động ~1 tranh/15 giây (25 phút = 100 tranh).
- `makeScript()` chia kịch bản thành các phần ~24 cảnh (`makeScriptPart()` gọi từng phần, truyền nhân vật/bối cảnh/đoạn cuối phần trước); nội dung dài ≥ 600 từ được cắt theo đoạn bằng `sliceText()` để kể hết, không bỏ ý.
- `refineImages()` chạy theo nhóm 30 cảnh (`refineBatch()`); nhóm lỗi thì giữ mô tả gốc.
- `videoToText()`: sau khi chép lời tự đặt độ dài video = độ dài audio/video gốc (tối đa 45 phút, option `#minSrc`).

## Cập nhật: lấy âm thanh từ link TikTok
- `api/tiktok.js` (Vercel function): `?url=<link tiktok>` hỏi dịch vụ tikwm.com lấy link âm thanh/video; `?media=<https>` chuyển tiếp file audio/video về trình duyệt dạng luồng (tối đa 80MB, chặn host nội bộ).
- `index.html`: ô `#ttUrl` + nút `#ttBtn` gọi `tiktokToText()`; lõi chép lời tách thành `transcribeBuffer(raw)` dùng chung cho file tải lên và link TikTok. Tải âm thanh trước; nếu không có lời thì tự thử lấy tiếng từ video.
- Phụ thuộc dịch vụ bên thứ ba (tikwm.com), có thể đổi hoặc ngừng bất cứ lúc nào.
- Mở thêm link Douyin (douyin.com, v.douyin.com, iesdouyin.com) trong api/tiktok.js và ô nhập; vẫn dùng tikwm.com nên chưa kiểm chứng được với link thật.
- Giao diện: 3 thẻ chọn nguồn nội dung (Tự nhập / Link TikTok-Douyin / Video-MP3), mỗi lần hiện một khung; `srcTab()`; tùy chọn viết lại chỉ áp dụng khi nguồn không phải 'Tự nhập'.

## Cập nhật: kiểu video "Hoạt hình nhân vật"
- Ô `#vmode` (Vẽ tay / Hoạt hình nhân vật), lưu trong `CF`.
- `figureSvg` ghi vị trí từng người vào `_ppl`; `expandPeople` bọc mỗi người trong `<g data-pid="n">`.
- `svgImage`: nếu chọn hoạt hình, `animLayers()` tách nền (bỏ các `[data-pid]`) và từng nhân vật (cắt gọn theo vùng có nét), trả về `bg`, `people`, `anim:true`. Chế độ vẽ tay trả `anim:false` để xóa dữ liệu cũ khi vẽ lại cảnh.
- `makeRenderer`: nhánh `drawAnim()` thay cho bàn tay vẽ: nền hiện dần, người trượt vào, nhún, lắc nhẹ; nhân vật chính (MAIN, hoặc người đầu tiên) mở miệng theo độ lớn giọng đọc (`ampAt()` tính từ `s.buf`, giọng bắt đầu sau 0,3 giây). Cảnh không người chỉ zoom/lia.
- Giới hạn: chuyển động nhẹ (nhún, lắc, miệng), chưa có tay vẫy, chớp mắt hay đi bộ.
- Hiện lại ô 'Cách vẽ tranh' và 'Phong cách vẽ' (#drawPick), không còn ép về svg_ink/ref mỗi lần mở.
- Ô 'Độ dài video' bị làm xám (disabled) khi nguồn là link TikTok/Douyin hoặc video/MP3 (tự theo nội dung, `setMinutes()`); sửa chữ trong ô truyện thì tự tính lại theo số từ.

## Cập nhật: bảng nhân vật cố định
- Kịch bản: trường `characters` là BẢNG NHÂN VẬT CỐ ĐỊNH ("MAIN = tên (who=trump): đặc điểm; SECOND = ..."), tối đa 4 người lặp lại, mỗi người một vai mãi mãi; phần sau của video dài nhận lại bảng và trả về bảng đầy đủ.
- `sceneCtx` và `refineBatch`: nhắc AI dùng đúng vai ở mọi cảnh; quy tắc 12 ghi vai + tên trong mô tả ("MAIN (Trump)").
- Code khóa ngoại hình: `parseCast()` đọc `who=` từ bảng, `lockCast()` (gọi trong `expandPeople`) khóa `who/hair/hat/acc/mark` của MAIN/SECOND/THIRD/FOURTH ở cảnh đầu tiên xuất hiện và áp lại cho mọi cảnh sau. CROWD không bị khóa.

## Cập nhật: trang phục theo nghề / chức vụ
- Thuộc tính mới `job` cho thẻ `<person>`: doctor, nurse, police, soldier, chef, worker, farmer, teacher, judge, king, firefighter, pilot, businessman, president, artist, student, monk, scientist (cùng các alias trong `JOB_ALIAS`, ví dụ cop → police, lawyer → businessman, queen → king).
- `jobSvg(job)`: trả về phần áo (`body`, vẽ sau `markSvg`) và mũ/phụ kiện đầu (`head`, vẽ sau cùng); `figureSvg` dùng khi người đó không phải `who` (người nổi tiếng).
- `CAST_LOCK` có thêm `job`; `parseCast()` đọc `job=` trong bảng nhân vật, nên mỗi vai luôn mặc đúng một bộ đồ ở mọi cảnh.
- Prompt: `<person job=...>` được mô tả cho AI vẽ cảnh; schema `characters` và quy tắc 12 của đạo diễn nhắc ghi nghề.

## Cập nhật: sửa nét nhạt
- `sanitizeSvg(raw, wob, sw)`: nhóm gốc có `stroke-width = sw` (trước đây thiếu nên hình AI tự vẽ mà không ghi độ dày bị nét mặc định 1 rất mỏng).
- `fixStrokes(svg, sw)`: nét nào mỏng hơn 60% độ dày chuẩn (tính cả scale của nhóm cha) thì nâng lên 80% chuẩn; prop/nhân vật đã bù scale nên không bị đổi.

## Cập nhật: hoạt hình nhân vật theo bộ phận
- `figureSvg` chia mỗi người thành 6 nhóm `<g data-part>`: `legL, legR, body, head, armL, armR` (tay vẽ sau cùng; đồ đang cầm đi theo tay phải). `_ppl` ghi thêm `pose, face, rot, hold`.
- `animLayers` vẽ từng bộ phận ra ảnh riêng (cắt theo vùng người, sau đó cắt gọn theo nét), tính sẵn các điểm xoay (hông, cổ, vai, miệng, mắt).
- `drawPerson`: chân bước luân phiên khi đi/vào cảnh, thân thở và nghiêng nhẹ quanh hông, đầu gật theo nhịp nói, chớp mắt mỗi ~3,6 giây, miệng mở theo giọng đọc, tay đung đưa; người đang nói (tư thế đứng) đưa tay theo nhịp câu.
- Cảnh vẽ bằng bản cũ (không có `parts`) bị bỏ qua phần người, cần "Vẽ lại".

## Cập nhật: kiểu "Ảnh AI 3D hoạt hình, nhiều màu" (miễn phí)
- `#isrc` có thêm `ai3d`. `makeImage` gọi `aiColorImage()`: tạo prompt `ai3dPrompt()` (phong cách Pixar 3D + mô tả cảnh + bảng nhân vật), gọi Hugging Face FLUX.1-schnell nếu có token (`#hftok`), không thì Pollinations (`model=flux`), thử lại tối đa 3 lần, các cảnh xếp hàng một (`aiImgQueue`) cách nhau ~0,7 giây, cùng một seed cho cả truyện (`aiSeed`).
- Ảnh được cắt phủ kín khung rồi trả về `{ cv, ord: [], anim: true, photo: true }`: dựng video bằng nhánh `drawAnim` (hiện dần + zoom/lia), không có bàn tay vẽ, không có miệng/tay cử động.
- Lỗi cả ba lần thì cảnh đó tạm vẽ bằng nét mực SVG và ghi log.
- `refineBatch`: khi chọn `ai3d`, quy tắc 13 yêu cầu mô tả như cảnh phim hoạt hình 3D bằng tiếng Anh, nhắc lại ngoại hình nhân vật mỗi lần.

## Cập nhật: ảnh mẫu nhân vật cho kiểu Ảnh AI 3D
- Khung `#aiRefBox` (chỉ hiện khi chọn `ai3d`): `#charRef` (tối đa 3 ảnh) gọi `analyzeCharRef()`; Gemini nhìn ảnh và viết mô tả STYLE + CHARACTERS (không gọi tên người thật/nhân vật phim) vào `#charStyle` (sửa được, được lưu cùng cài đặt).
- `ai3dPrompt`: nét vẽ và ngoại hình nhân vật thường lấy từ `#charStyle`; nhân vật nổi tiếng (`who=` trong bảng nhân vật hoặc `castLock`) dùng `FAMOUS_LOOK` để giữ giống người thật, vẽ cùng nét vẽ.

## Cập nhật: chỉ còn phong cách "Theo ảnh mẫu"
- `#style` chỉ còn lựa chọn `ref` (ẩn, bị ép về `ref` mỗi lần mở trang); các kiểu stick/doodle/marker/pencil/manga/brush/minimal/kids bị gỡ khỏi giao diện.
- Khi chọn `ai3d`, ô ảnh mẫu SVG (`#refBox`) và gợi ý phong cách (`#styleHint`) được ẩn; chỉ hiện khung ảnh mẫu của ảnh AI (`#aiRefBox`).

## Cập nhật: nét doodle vẽ tay cho đồ vật (theo ảnh mẫu truyện tranh)
- Khối code mới nằm ngay SAU `const PROPS = {...}` và TRƯỚC `const propAliases` (grep `NÉT DOODLE VẼ TAY`): `_sketch(svgStr)` biến mọi `<path>/<rect>/<circle>` của đồ vật thành nét rung mượt + viền đôi (nét bút vẽ lại), `_hat(poly, gap, ang)` vẽ gạch bóng song song cắt gọn trong đa giác, `_bump` (đường viền mây/tán cây), `_burst` (hình nổ gai), `_tuft` (cụm cỏ).
- `propSvg` và đồ vật cầm tay (`hold=`) đều bọc `d.g()` bằng `_sketch(...)`; `_dS` (hạt giống rung) tính theo vị trí x,y nên cùng một đồ vật ở hai chỗ có nét hơi khác nhau; `_cw` = độ dày nét hiện tại (dùng cho gạch bóng).
- Vẽ lại bằng `Object.assign(PROPS, {...})`: house, hut, building, tree, rock, fence, sign, crown, heart, bulb, speech, thought. Thêm mới: burst, exclaim, question, speed, emph, anger, twinkle, scribble, tornado, hourglass, bomb, grass, arrow, board, torn_paper (đồ vật nổi có `f:1` tự xuất hiện trong danh sách gửi AI qua `__GROUNDPROPS__`/`__FLOATPROPS__`). Alias mới (bubble, shout, shock, time, ...) nằm ngay sau dòng `const propAliases`. Câu mô tả nghĩa các hiệu ứng nằm trong `SVGR_SCENE`, ngay sau "chest = treasure."
- Lưu ý: `_strokes` chỉ đọc path tuyệt đối (M L H V Q C Z); đồ vật nào dùng lệnh khác (chữ thường, A, S, T) thì giữ nguyên, không rung. Muốn nét bớt rung: giảm hệ số `0.014` và `Math.min(2.0, ...)` trong `_sketch`.

## Cập nhật: người vẽ dày nét (không còn người que)
- Chỉ sửa `figureSvg` (grep `Tay chân dạng ống dày`). Đầu, mặt, mũ, nghề, họa tiết áo và điểm gắn vai (±37,-192) / hông (±22,-108) / miệng / mắt GIỮ NGUYÊN để hoạt ảnh (`animLayers`, `ANIM_PARTS`) không lệch.
- Tay và chân giờ là đa giác bao quanh đường cong (`qp` lấy mẫu đường cong, `tube` tạo ống dày, thon dần về cổ tay/cổ chân), có bàn tay (`arm`: vòng tròn + ngón cái) và giày (`shoe`). Chân ngồi gồm đùi + cẳng chân nối thành một ống. Thêm tai hai bên đầu và gạch bóng `_hat` ở nửa phải thân áo.
- Cuối `figureSvg`, toàn bộ hình người (trừ đồ cầm tay vốn đã qua `_sketch`) được bọc `_sketch(...)` để có nét rung + viền đôi giống đồ vật. Hạt giống rung `_dS` lấy theo vị trí x,y.
- Đã kiểm tra: `animLayers` vẫn tách đủ 6 bộ phận (legL, legR, body, head, armL, armR) cho mọi tư thế mẫu (stand, point, carry, wave, cheer, walk, sit, run, think).
- Muốn tay chân mảnh/dày hơn: đổi cặp số độ rộng trong `tube(..., 26, 19)` (tay) và `tube(..., 30, 22)` (chân).

## Cập nhật: độ dài video tự theo văn bản (chế độ "Câu chuyện hoặc ý tưởng")
- Listener `input` của `#idea` (grep `minManual`): ở chế độ văn bản, nếu dán từ 200 từ trở lên thì `setMinutes(round(từ/192))` (tối đa 45 phút) và nhãn đổi thành "tự theo văn bản của bạn"; dưới 200 từ coi là ý tưởng ngắn, trả ô phút về 4 và cho tự chọn. Người dùng tự bấm đổi ô phút (`change` thật, `e.isTrusted`) thì `minManual = true` và tool không tự đổi nữa cho tới khi xóa trống ô văn bản.
- Chế độ link/file giữ nguyên: ô phút bị khóa và tự theo nội dung.

## Cập nhật: thư viện tự học (đồ vật + trang phục mới)
- Khối code `THƯ VIỆN TỰ HỌC` nằm ngay trước `MACRO_STYLES` (grep `libLearn`). Khi AI vẽ cảnh đặt `<prop type="tên_mới"/>` mà `propResolve()` không tìm thấy, hoặc `<person job="từ_lạ"/>` mà `jobName()` không nhận, `svgImage` gọi `await libLearn(t, s)` TRƯỚC khi bung thẻ: nhờ Gemini (`gemMulti(TXT_MODELS...)`, JSON) vẽ đồ vật (`libLearnProp`) hoặc bộ đồ/mũ (`libLearnJob`), kiểm tra, lưu vào `LIB` (`localStorage['userlib_v1']`), đăng ký vào `PROPS` / `JOB_LIST`. Từ lần sau dùng lại miễn phí, kể cả truyện khác.
- An toàn: `libClean()` chỉ giữ path (M L H V Q C Z tuyệt đối), rect, circle, ellipse; fill trắng/none hoặc `@red|@orange|@yellow|@green|@blue` (đổi sang `COL` lúc vẽ nên theo chế độ màu). `libBox()` đo khung bao: đồ vật được tự căn giữa/chân về (0,0) và chuẩn hóa cỡ 150; mũ/áo phải nằm đúng vùng đầu/thân, sai thì bỏ (người đó mặc đồ thường, đồ vật vẽ hình tạm như cũ). Tên lỗi lưu `_libFail` để không thử lại trong phiên.
- Học song song an toàn: `_libBusy` chặn học trùng khi 2 cảnh vẽ cùng lúc; không có `await` nào giữa lúc học xong và lúc bung thẻ (vì `_tags/_ppl` là biến toàn cục).
- `JOB_ALIAS`: đã bỏ `general -> soldier` để "general" (tướng) được học bộ đồ riêng. `parseCast` nhận cả nghề lạ. Prompt `SVGR_SCENE` (MISSING OBJECTS, job) và schema `characters` đã cho phép tên mới.
- Giao diện: công tắc `#libOn` (có trong `CF`), khung "📚 Thư viện tự học" cuối phần Cài đặt: xem hình thu nhỏ, ✕ xóa từng cái chưa đẹp (`libDel`), tải/nạp file thư viện (`libExport`/`libImport`, nạp lại qua `libClean`), xóa hết (`libClear`).
- Kiểm thử Chromium + Gemini giả: học đồ vật và trang phục "general", loại 3 kết quả xấu (script, path lạ, mũ lệch khung), không gọi lại lần hai, giữ sau khi tải lại trang, xóa được. CHƯA thử với key Gemini thật: chưa biết hình Gemini vẽ ra đẹp cỡ nào; nếu xấu, chỉnh prompt trong `libLearnProp`/`libLearnJob` hoặc xóa từng cái trong khung thư viện.

## Cập nhật: bộ nhận diện bối cảnh (cờ, địa danh, đồng phục theo nước)
Lý do: tranh quá chung chung, truyện về Trung Quốc mà không có cờ/Vạn Lý Trường Thành nên người xem không nhận ra.
- `makeScriptPart` trả thêm trường `identity` (quốc gia/tổ chức/thời đại + 3-6 dấu hiệu bằng tên đồ vật, vd `China: flag_china, greatwall, tiananmen, redstar`). Lưu `sc.identity`, nạp vào biến `identityCtx` (cạnh `storyCtx`), đưa vào `sceneCtx` (dòng IDENTITY CUES), `refineBatch` (quy tắc 12b: MỌI cảnh phải có ít nhất 1 dấu hiệu, ghi vào MUST SHOW; cảnh [OBJECT] thêm cờ nhỏ/con dấu) và `SVGR_SCENE` (mục IDENTITY).
- Đồ vật mới trong `PROPS` (khối `BỘ NHẬN DIỆN BỐI CẢNH`, trước thư viện tự học): `flag_china, flag_vietnam, flag_usa, flag_russia, flag_japan` (cột cờ, k=1.1), `redstar` (nổi), `tiananmen` (có nhãn, tự giữ trọn khung), cộng alias (china_flag, great_wall, beijing, forbidden_city...). `greatwall` đã có từ trước.
- Nước khác: AI ghi `flag_<tên nước>` (vd flag_france) thì thư viện tự học vẽ lá cờ đúng màu (prompt `libLearnProp` có dòng riêng cho `flag_`). `propResolve` KHÔNG ép `flag_xxx` về lá cờ chung nữa.
- Đồng phục theo nước: AI đặt `job` cụ thể (vd `plaofficer`), thư viện tự học vẽ mũ/phù hiệu (prompt `libLearnJob` nhắc gắn biểu tượng nước đó, vd sao đỏ trên mũ).
- Kiểm thử Chrome với Gemini giả: 5 cờ có sẵn, Thiên An Môn, sao đỏ, Vạn Lý Trường Thành và cờ Pháp (học tự động) đều vẽ được. CHƯA thử key Gemini thật: cần xem AI có chịu ghi `identity` và đặt cờ ở mọi cảnh không; truyện cũ phải bấm "Bắt đầu tạo video" lại để có trường `identity`.

## Cập nhật: tự tạo nhân vật nổi tiếng mới (ngoài 6 người có sẵn trong WHO)
- AI ghi `<person who="xijinping"/>` (hoặc bảng nhân vật `who=putin`...) với tên chưa có trong `WHO` thì `libLearn` gọi `libLearnPerson(name, ctx)`: Gemini thiết kế tóc, kính, râu, mũ, cổ áo/cà vạt (JSON `label/head/body`), lưu vào `LIB.jobs[name]` với cờ `who:1` và `label`; đăng ký `WHO[name] = {n: label, learned: 1, key: name}` + `JOB_LIST`. Vẽ đi qua đường trang phục nghề (`figureSvg`: `JB = jobSvg(who.key)`), nhãn tên hiện dưới chân như người có sẵn.
- `parseCast` nhận `who` lạ (≥3 chữ) nên khóa ngoại hình xuyên mọi cảnh. `libClean` cho phép tô đen `#111111` (tóc/mũ). Khung thư viện đếm riêng "nhân vật nổi tiếng"; xóa/nạp/xuất dùng chung `LIB.jobs`.
- Prompt: schema `characters` và `SVGR_SCENE` cho phép `who` là tên Latin viết liền bất kỳ. Kiểm thử Chrome (Gemini giả): học "xijinping", vẽ có tóc đen + cà vạt đỏ + nhãn "Xi Jinping", Trump có sẵn vẫn đúng. CHƯA thử key Gemini thật (độ giống phụ thuộc kiến thức Gemini).

## Cập nhật: bật lại "Ảnh AI màu" + kiểu hoạt hình 2D người que đầu tròn (theo video mẫu LearnYTA)
- Yêu cầu người dùng: tranh màu rực, sinh động, nền nhiều chi tiết, nhân vật người que đầu tròn trắng như các video hoạt hình giải thích lịch sử.
- Ô `#isrc` có lại lựa chọn `ai3d` ("Ảnh AI màu rực rỡ, sinh động"). Hai chỗ ép `isrc` về `svg_ink` (nạp file sao lưu và lúc mở trang) đã cho phép `ai3d`.
- Ô mới `#aiLook` (trong `#aiRefBox`, có trong `CF`): `comic2d` (mặc định, hằng `COMIC_LOOK` trong `ai3dPrompt`: nét mực dày, màu bão hòa, nền nhiều chi tiết, người que đầu tròn trắng mắt chấm) hoặc `pixar3d` (kiểu cũ). Có ảnh mẫu (`#charStyle` không rỗng) thì nét vẽ lấy theo ảnh mẫu.
- Quy tắc 13 của đạo diễn (`refineBatch`) đổi theo `aiLook`; `ai3dPrompt` bỏ thêm các nhãn góc máy [WIDE]/[CLOSE]... khỏi mô tả; giới hạn prompt 1500 ký tự.
- Đường tạo ảnh không đổi: Gemini Image (nếu key dùng được) -> Hugging Face FLUX (nếu có token) -> Pollinations (1 ảnh/45 giây). Ảnh dựng bằng `drawAnim` (hiện dần + zoom/lia), không có bàn tay vẽ.
- CHƯA thử với key thật: chỉ kiểm tra cú pháp và chạy thử hàm `ai3dPrompt` bằng Node. Nếu nhân vật lệch giữa các cảnh, tải ảnh mẫu nhân vật vào `#charRef`.

## Cập nhật: chế độ màu "🌈 Màu rực rỡ" (MIỄN PHÍ, vẫn vẽ bằng SVG, không dùng ảnh AI)
Yêu cầu người dùng: dùng cách vẽ miễn phí mà tranh vẫn màu rực, sinh động, nền chi tiết như video hoạt hình giải thích (người que đầu tròn trắng, nền minh họa nhiều màu). Phần "Ảnh AI màu" (`ai3d`, `aiLook`) ở đợt trước vẫn còn nhưng người dùng KHÔNG muốn dùng; đường chính là `cmode=vivid`.
- Ô `#cmode` có thêm `vivid` (mặc định cho người mới; người đã lưu `accent` phải tự chọn lại). `PAL.vivid` đặt 5 màu `COL`. Giá trị lạ tự về `vivid`.
- **Nền tự vẽ** (khối ngay trước `svgImage`, grep `MÀU RỰC RỠ`): `vividTheme(text)` chọn bối cảnh theo lời kể + mô tả (field, city, war, night, sea, desert, snow, room, studio cho cảnh [OBJECT]); `vividBackdropSvg()` vẽ trời gradient, mặt trời/trăng/sao, mây, đồi 2 lớp, đất, cây/nhà/người nhỏ, chim, hoa, lửa/khói, sóng, nhà cao tầng... với viền mực mảnh; hạt giống ngẫu nhiên lấy từ chữ của cảnh (`_hs`, `_rng`) nên cùng cảnh luôn ra cùng nền. `bdCanvas(text)` dựng nền ra canvas cùng tỉ lệ với tranh chính (mặt đất ở y≈650-700 của viewBox 900) rồi `svgImage` truyền qua `inkify({..., bdc})`; `inkify` vẽ nền trước, tranh chính sau, và bỏ kiểm tra "đen quá nhiều" khi có nền. Chế độ hoạt hình nhân vật: nền được ghép dưới `layers.bg`.
- **Đồ vật tự tô màu**: `_R/_P/_C` (hình trắng của đồ vật) lấy màu lần lượt từ `_vpal` khi `propSvg`/đồ cầm tay gọi `d.g()`; bảng màu từng loại là `VPAL`, loại chưa có dùng `_VFALL` chọn theo tên (`vpalFor`). Thêm màu cho đồ vật mới: thêm một dòng vào `VPAL` (thứ tự màu = thứ tự hình trong `g()`).
- **Nhân vật**: đầu vẫn trắng; áo theo vai (`shirtFill`, CROWD lấy màu từ `_CROWD_COL` theo `_dS`), quần theo vai, tay áo cùng màu áo, giày nâu (`PANTS/SLV/SHOE` trong `figureSvg`, `tube(...,f)`).
- **`sanitizeSvg`**: ở `vivid`, màu TÔ do AI viết được giữ nguyên qua `vividFill()` (tên màu mở rộng `_VNAMES`); trắng giữ trắng, gần đen thành `#111111`. Nét viền vẫn đen. `whitenBigBlack` vẫn chặn mảng đen to.
- Prompt `svgImage` có luật "VIVID FULL COLOR": AI không vẽ trời/đất/nền (tool tự vẽ), tô màu bão hòa cho hình tự vẽ, nhiều đồ vật/người nhỏ.
- Kiểm thử bằng Playwright + Gemini giả: 6 bối cảnh (field, city, war, night, sea, room), khung dọc, chế độ màu nhấn cũ vẫn đen trắng. CHƯA thử với key Gemini thật (chưa biết AI đặt thẻ có bố cục đẹp không).
- Giới hạn: vẫn là nét doodle vẽ bằng thư viện đồ vật, không chi tiết như ảnh AI. Muốn đẹp hơn: thêm đồ vật vào `PROPS`+`VPAL`, thêm bối cảnh vào `vividTheme`/`vividBackdropSvg`.

## Cập nhật: vẽ lại đồ vật và nhân vật cho chế độ vivid
- `VPROPS` (ngay sau `_Cc`): bản vẽ lại, tô màu cố định cho table, chair, bed, car, bus, train, dog, cat, bridge, streetlight, flag, sign, shop, computer, phone, cup, bowl, bicycle. `propSvg` và đồ cầm tay dùng `VPROPS[t]` thay `PROPS[t].g` khi `cmode=vivid`; chế độ khác vẫn dùng bản cũ. Thêm/sửa đồ vật: viết hàm trả chuỗi SVG bằng `_Rc/_Pc/_Cc/_Lc` (có màu), gốc ở giữa-đáy, y âm là hướng lên, cùng kích thước với bản gốc trong `PROPS`.
- Nhân vật ở vivid (`VV` trong `figureSvg`): đầu tròn, bỏ tai, tay chân mảnh hơn (tay 18/13, chân 22/16), bàn tay một vòng tròn. Chế độ khác không đổi.

## Cập nhật: BỎ "Ảnh AI màu rực rỡ" và "Hoạt hình nhân vật" (người dùng thử thấy không ổn)
- `#isrc` chỉ còn `svg_ink` và `svg`; đã xóa lựa chọn `ai3d`, ô `#aiLook`, `COMIC_LOOK`; `ai3dPrompt` và luật 13 đạo diễn trả về như bản gốc (mã cũ của `ai3d` vẫn nằm đó nhưng không còn đường vào; `#aiRefBox`, `#hfBox` luôn ẩn, giữ lại vì `charRef/charStyle/hftok` còn được mã khác tham chiếu). Cài đặt đã lưu có `ai3d` tự về `svg_ink`.
- Ô chọn kiểu video đã gỡ khỏi giao diện; `#vmode` còn lại là ô ẩn chỉ có `hand`, và `wantAnim = false` trong `svgImage`. Mã `animLayers`/`drawAnim` còn nhưng không chạy. Video luôn là vẽ tay.
- Hướng chính: `cmode=vivid` (màu rực rỡ miễn phí, vẽ SVG) + vẽ tay từng nét.

## Cập nhật: gọn giao diện cài đặt
- Ô `#isrc` (Cách vẽ tranh) chuyển xuống ngay trên ô `#cmode` (Chế độ màu) ở khung "Nguồn nội dung". `#drawPick` chỉ còn ô ẩn `#style`.
- Đã xóa 2 ô tích `#accentOn` (màu nhấn: giờ chọn trong `#cmode`) và `#libOn` (tự học đồ vật: luôn bật). Bỏ cả hai khỏi mảng `CF`; `accentEnabled()` giờ chỉ phụ thuộc `cmode !== 'bw'`, và `libLearn` không còn kiểm tra `libOn` (mã vẫn có `$('libOn') &&` nên không lỗi khi thiếu ô).

## Cập nhật: nhân vật thật vẽ theo ảnh trên mạng + tối đa 8 vai có tên
- **8 vai có tên**: `NAMED_ROLES` = MAIN, SECOND, THIRD, FOURTH, FIFTH, SIXTH, SEVENTH, EIGHTH (+ CROWD). Đã thêm vào `ROLE_DEF`, màu áo `shirtFill`, màu quần `PANTS`, `parseCast`, `lockCast` và mọi prompt (kịch bản, đạo diễn hình ảnh, luật vẽ người). Prompt kịch bản bắt buộc: MỌI người được nhắc tên đều có một mục + một vai, tên đầy đủ chữ Latin ngay sau dấu `=`, người nổi tiếng thật phải có `who=`.
- **Tìm ảnh trên mạng**: `fetchPortrait(name)` gọi API Wikipedia (en/vi, có CORS nên chạy thẳng từ trình duyệt, không cần máy chủ) lấy ảnh đại diện của bài viết, kiểm tra tiêu đề bài khớp tên, tải ảnh thành base64. `libLearnPerson(name, ctx, disp)` gửi ảnh kèm prompt cho Gemini: nhìn ảnh rút kiểu tóc, lông mày, râu, kính, màu da (`skin` hex), trang phục, rồi thiết kế `head`/`body` như trước. Không tìm được ảnh (hoặc ảnh không phải mặt người: `photo_ok=false`) thì dùng hiểu biết của AI như cũ. `LIB.jobs[name]` lưu thêm `skin`, `pv` (1 = đã xem ảnh), `src` (tên bài Wikipedia).
- **Học sẵn toàn bộ**: `learnCastPeople()` chạy ngay sau `parseCast(chars)` trong `start()` (trước khi ghép hình/vẽ), học tối đa 3 người song song, để cảnh đầu tiên cũng đã đúng mặt. `personDisplay(n)` lấy tên đầy đủ từ `castLock[...].nm`.
- **Màu da**: `_SK` trong `figureSvg` (chỉ ở `cmode=vivid`) tô đầu và bàn tay theo `skin`.
- Nhân vật bịa (có tên nhưng không phải người thật) không có ảnh: vẫn có vai riêng, tóc/mũ/kính/áo theo bảng nhân vật. Nhân vật đã học từ bản cũ (không có `pv`) giữ nguyên; bấm ✕ trong "Thư viện tự học" để học lại theo ảnh.
- Kiểm thử bằng Playwright với Wikipedia và Gemini giả (ảnh gửi đi đúng, 5 vai vẽ đúng màu da/tóc/nhãn tên). CHƯA thử với Wikipedia và Gemini thật.

## Cập nhật: vẽ lại râu (cmode=vivid)
- Râu `acc==='beard'` ở vivid không còn là mảng trắng: có màu (đen xám, nâu, xám bạc, nâu nhạt, cố định theo vai: `NAMED_ROLES.indexOf(role) % 4`; CROWD theo `_dS`), ôm quanh hàm, kèm ria mép, nét viền mảnh bằng nửa nét thường, miệng vẫn lộ ra. Chế độ khác vẫn dùng râu trắng cũ. Râu của nhân vật thật do Gemini thiết kế (shape trong `LIB.jobs[..].head`) không đổi.

## Cập nhật: cờ chỉ khi nhắc tên nước + nhãn tên nhân vật chỉ ở lần đầu xuất hiện
- **Cờ**: `flagAllowed(text, generic)` (danh sách `_CTRY_ANY` tên nước tiếng Việt/Anh + `_CTRY_CTX` cho từ ngắn dễ nhầm như Anh, Ý, Bỉ, Áo, Lào, Séc) kiểm tra LỜI KỂ của cảnh (`s.text`). `stripFlags(t, s.text)` chạy ngay sau khi Gemini trả SVG (trước `libLearn`, nên không tốn lượt học cờ lạ) và xóa mọi thẻ `<prop type="…flag…">` và `hold="…flag…"` khi cảnh không nhắc tên nước (cờ chung `flag` còn được giữ nếu lời kể nói "lá cờ / ngọn cờ / quốc kỳ"). Nhật ký ghi "🚩 Bỏ n lá cờ…". Chỉ kiểm tra "có nước nào được nhắc" chứ không kiểm tra đúng nước nào; việc chọn đúng cờ do prompt lo.
- Prompt đã đổi: luật IDENTITY của `svgImage` (≈dòng 1548), dòng IDENTITY CUES trong `sceneCtx` (≈554) và luật 12b của đạo diễn (≈573): không còn ép "mọi cảnh phải có dấu hiệu quốc gia"; cờ chỉ khi cảnh nhắc tên nước, mỗi cảnh một lá; dấu hiệu khác tối đa một, tùy cảnh.
- **Nhãn tên**: `nameFirstHere(role, name)` chỉ cho `figureSvg` đẩy nhãn tên (dưới chân) ở cảnh ĐẦU TIÊN người đó xuất hiện: cảnh đầu tiên có mô tả `s.image` nhắc vai (MAIN, SECOND...), nếu không thì cảnh đầu có tên trong lời kể/mô tả. Vì cảnh vẽ song song nên quyết định theo thứ tự cảnh trong kịch bản (`_curScene = scenes.indexOf(s)`), không theo thứ tự vẽ xong. Nhiều nhân vật chính: mỗi người một nhãn ở lần đầu của riêng mình. Nhãn dùng tên người nổi tiếng (`who.n`) hoặc tên trong bảng nhân vật (`castLock[role].nm`) cho mọi vai có tên.
- Kiểm thử Playwright (Gemini giả luôn trả cờ + 2 nhân vật) trên 4 cảnh: nhãn "Minh" chỉ ở cảnh 1, "Lan" chỉ ở cảnh 2, cờ chỉ ở cảnh nhắc "Mỹ", cảnh còn lại không cờ không nhãn. CHƯA thử với Gemini thật.


## Sửa lỗi ngắt câu cuối mỗi ảnh

- Prompt viết kịch bản có thêm quy tắc "ngắt cảnh": lời kể mỗi cảnh phải gồm câu trọn vẹn, không cắt một câu làm đôi giữa hai cảnh.
- Thêm `fixSceneBreaks()`: sau khi AI trả kịch bản, tool tự kiểm tra từng cảnh có kết thúc bằng dấu câu không. Nếu cảnh bị cụt câu thì đẩy mẩu câu dở xuống đầu cảnh sau (hoặc kéo phần kết từ cảnh sau lên). Cảnh cuối thiếu dấu thì thêm dấu chấm. Có ghi log số chỗ đã chỉnh.
- Phụ đề không còn bị cắt cứng ở số dòng tối đa (3 dòng ngang, 6 dòng dọc). Lời kể dài hơn sẽ được chia thành nhiều trang, tự chuyển trang theo tiến độ lời đọc của cảnh.

## 15. Thumbnail YouTube + câu hook (mới)
- Nút **🖼 Tạo thumbnail YouTube** nằm cạnh nút **⬇ Tải video về máy** (cả đường xuất nhanh `exportFast` lẫn xuất thời gian thật trong `play`). Bấm → `openThumb()` mở khung `#thumbBox` (nằm ngay dưới `#out`).
- Code nằm cuối `index.html`, ngay trước `try { libUI(); }`: `TH`, `TH_THEMES`, `THUMB_HTML`, `thDraw` (vẽ canvas `#thCv` 1280x720), `thGenCopy` (gọi Gemini qua `gemMulti(TXT_MODELS...)` trả JSON `{titles[5], texts[5], scene, desc, tags[]}`), `thPick`, `thCount`, `thCopy`, `thDownload` (JPG 0.92), `openThumb`.
- Ảnh thumbnail = nét mực `scenes[i].cv` của cảnh AI chọn (người dùng đổi được bằng ô chọn cảnh), đặt trong khung trắng nghiêng bên phải; chữ hook to bên trái (tự co cỡ chữ, tối đa 3 dòng, dòng cuối tô màu nhấn). 3 màu nền (vàng/đỏ/xanh), có tùy chọn phóng to cắt hai bên.
- Quy tắc hook trong prompt: tiêu đề <= 65 ký tự, tò mò nằm trong 40 ký tự đầu, không lộ kết/không nói sai truyện; chữ thumbnail 2-5 từ, HOA; mô tả có dòng 1 là hook <= 120 ký tự + 3 hashtag; 10 tag.
- Nếu AI lỗi/thiếu key: vẫn tự gõ chữ và tải thumbnail được. `start()` tạo kịch bản mới sẽ xóa `#thumbBox` và đặt `TH = null`.
- Lưu ý: `canvas{width:100%}` trong CSS áp cho `#thCv`; font chữ dùng stack hệ thống weight 900 (có đủ dấu tiếng Việt), không cần tải font ngoài.


## 26. Chuyển cảnh 5 kiểu (mới)
- Ô chọn `#trans` (cạnh phần nhạc nền, có trong `CF` nên được lưu): `mix` (xoay vòng cả 5 theo số thứ tự cảnh, mặc định), `flip`, `dark`, `eraser`, `iris`, `tiles`, `fade` (mờ trắng như bản cũ). Đổi lúc đang xem thử có hiệu lực ngay.
- Code nằm ngay trước `makeRenderer`: `TRANS_LIST`, `TRANS_DUR`, `transKind(i)`, các hàm `trFlip`, `trEraser`, `trIris`, `trTiles`, và `drawTrans(kind, x, sn, q, W, AH)`.
  1. **Lật giấy** (`trFlip`, 1,0s): mép giấy gập từ phải sang trái theo đường gập hơi nghiêng, mặt sau giấy xám nhạt có nét mực mờ xuyên qua, đổ bóng, lộ trang trắng.
  2. **Tối dần** (làm trong `makeRenderer`, 0,8s): cả khung kể cả phụ đề tối đen, sang cảnh sau sáng dần lên trong 0,5s.
  3. **Lau bảng** (`trEraser`, 1,1s): cục lau chạy ziczac 3-6 dải từ trên xuống, quét sạch nét phía sau.
  4. **Thu vòng tròn** (`trIris`, 0,85s): tranh co dần vào giữa trong vòng tròn có viền mực.
  5. **Mảnh ghép rơi** (`trTiles`, 0,95s): tranh vỡ thành ô vuông (10 cột ngang, 6 cột dọc), từng ô xoay và nhỏ dần theo đường chéo (độ trễ từng ô dùng `_hash`, không dùng random nên xem thử và xuất video giống hệt nhau).
- Cách chạy trong `makeRenderer`: trong `tdur` giây cuối của cảnh (tối đa 40% thời lượng cảnh), chụp vùng tranh (0..`fm.ah+10`) vào canvas `sn` rồi `drawTrans` vẽ lại vùng đó từ ảnh chụp; phụ đề vẽ sau nên vẫn tự mờ như cũ. Cảnh sau luôn bắt đầu bằng trang trắng nên tay vẽ vẫn vẽ từ đầu. Cảnh ngắn dưới 1,8s dùng mờ trắng cũ; cảnh cuối cũng mờ trắng cũ, riêng `dark` thì tối hẳn ở cuối video.
- Dùng chung cho xem thử, xuất nhanh (WebCodecs) và xuất thời gian thật vì cùng đi qua `makeRenderer`. Chưa có tiếng giấy lật hay tiếng lau bảng.
- Lưu ý: mục 23 ở trên mô tả chuyển cảnh lật giấy bằng 80 dải và công tắc `flipOn`, nhưng bản `index.html` này không còn đoạn code đó. Hệ thống mục 26 thay thế hoàn toàn.


## 27. Nâng cấp chất lượng hình: nét mượt + bối cảnh nhiều lớp (đợt gần nhất)
**Nét vẽ (nguyên nhân + cách sửa)**
- Lỗi cũ: `_strokes` biến đường cong thành đa giác (đoạn 14 đơn vị), `_wob` rung ngẫu nhiên từng đỉnh rồi `_sketch` vẽ thêm "nét đôi"; bộ lọc `wob` trong `sanitizeSvg` dùng nhiễu tần số cao -> viền gãy khúc, thô, méo.
- Nay: `_spl(p, closed)` nối điểm bằng đường cong Bézier (Catmull-Rom), chỉ giữ góc nhọn khi góc quay > 40 độ; `_wob` dịch điểm theo trường sóng chậm theo VỊ TRÍ (hai hình sát nhau vẫn khít); bỏ hẳn nét đôi. Hình tròn/elip lấy mẫu 16-40 điểm rồi làm mượt.
- Bộ lọc `wob`: `baseFrequency=0.006`, 1 octave, `scale = min(2.4, wob*0.55)`.
- `inkify` (SVG) vẽ ở độ phân giải gấp đôi rồi thu nhỏ (siêu lấy mẫu `SS=2`) nên viền mịn, không răng cưa. Kiểm tra "đen quá nhiều" chỉ tính trên tranh chính (không tính nền).
- Tư thế `think` sửa lại (tay không còn gập gắt tạo cục ở cằm).

**Bối cảnh nền (ưu tiên)** - khối code `BỐI CẢNH (BACKGROUND)` ngay trước `svgImage` (grep `SET_KEYS`, `bgSvg`, `bdCanvas`):
- 23 loại: office, home, kitchen, classroom, shop, market, hospital, bank, court, factory, street, village, farm, forest, mountain, beach, desert, war, snow, park, palace, studio (cận cảnh vật), plain (chung). Mỗi loại vẽ 3 lớp xa/giữa/gần, nét mảnh nhạt (`bgPal`: xám nhạt ở bw/accent, pastel ở vivid), mép mờ dần về giấy trắng (mask blur), có bóng dưới chân từng người, bộ lọc rung tần số thấp. Ban đêm (`bgNight`) thêm trăng sao + trời tím nhạt cho cảnh ngoài trời.
- Chọn bối cảnh `inferSetting(s, aiType)`: `SET: xxx` do đạo diễn ghi trong `s.image` > thẻ `<backdrop type="xxx"/>` do AI vẽ cảnh ghi > đoán theo từ khóa tiếng Việt/Anh (`SET_RULES`, thứ tự quan trọng) trong mô tả rồi lời kể > nơi của 4 cảnh liền trước > `settingCtx` > `studio` (nếu [OBJECT]) hoặc `plain`. Luôn có nền, kể cả khi AI không tuân prompt.
- `svgImage` bỏ thẻ `<backdrop>` khỏi SVG, đặt `_bgOn` để `expandProps` bỏ `<ground>` (nền đã có mặt đất), dựng nền cho MỌI chế độ màu (trước chỉ vivid), lưu `s.bgKind`. Hàm nền cũ `vividBackdropSvg` còn trong code nhưng không còn được gọi.
- `inkify` ghép nền phía sau tranh chính; thứ tự tay vẽ: chủ thể (người, đồ vật) trước, rồi tới nền (`inkOrder`).
- Công tắc `#bgOn` (có trong `CF`): "🏞 Vẽ bối cảnh nền", tắt thì vẽ như cũ.
- Prompt: `SVGR_SCENE` có khối BACKDROP (liệt kê 23 loại + cách chọn), bỏ câu "Backgrounds stay EMPTY WHITE" và "EMPTY WHITE SPACE IS GOOD"; đạo diễn (`refineBatch`) quy tắc 3 đổi thành BỐI CẢNH bắt buộc `SET: <loại>` ở cuối mô tả.
- Thêm bối cảnh mới: viết hàm trong object `S` của `bgSvg`, thêm tên vào `SET_KEYS`/`SET_NAME`, từ khóa vào `SET_RULES`, cập nhật danh sách trong `SVGR_SCENE` (khối BACKDROP) và quy tắc 3 của đạo diễn.
- Kiểm thử (Chromium + Gemini giả): render cả 23 bối cảnh ở vivid, 6 loại ở bw, khung dọc 9:16, chế độ accent/color, công tắc bgOn, bảng 24 tư thế + 14 nét mặt, `makeRenderer`. ~0,3 giây/cảnh. CHƯA thử với key Gemini thật: cần xem AI có chép đúng `SET:` / `<backdrop>` không (nếu không thì từ khóa vẫn đảm bảo có nền).

## 28. Giới hạn kích thước đồ vật + cảnh đêm tối hơn
- `propSvg`: sau khi dựng hình, `_bboxOf(gs)` đo khung bao thật (getBBox trong DOM ẩn); đồ đặt trên mặt đất (không phải đồ nổi `f`, địa danh `n`, đồ có `data-keep` như lửa/tia sáng, và các loại trong `_BIG_OK`: mountain, hill, waves, cloud, fuji, pyramid, greatwall) bị thu nhỏ nếu cao hơn 76% khung hoặc rộng hơn 62% khung. Cảnh [OBJECT] cận cảnh đồ nhỏ (cash, giấy...) không bị ảnh hưởng. Muốn nới/siết: sửa `0.76` và `0.62` trong `propSvg`.
- `bgPal(night)`: khi cảnh đêm, vivid đổi bầu trời, cỏ, đồi, cây, nước, nhà xa sang tông tối hơn; bw/accent tô xám nhạt bầu trời và mặt đất (`skyFill` có tô nhẹ khi đêm). Chỉ áp cho cảnh ngoài trời (cảnh trong nhà không bị đêm hóa, xem `bdCanvas`).

## 29. Nâng cấp hình vẽ con vật, phương tiện, cây cối + AI tự tạo hình tốt hơn
- **Thư viện có sẵn (`PROPS`, khối "THÚ VẬT, PHƯƠNG TIỆN VÀ CÂY CỐI VẼ LẠI (v4)", nằm ngay sau khối doodle, trước `const propAliases`)**: vẽ lại `dog, cat, buffalo, fish, bird, car, bicycle, motorbike, plane, pine`; thêm mới `horse, elephant, pig, chicken, rabbit, sparrow` (chim đứng), `palm` (dừa), `bamboo`. Quy ước: gốc (0,0) = điểm chạm đất, quay mặt sang phải, khối vẽ từ sau ra trước (chân xa → đuôi → thân → chân gần → đầu → chi tiết), mắt/mũi là `_D`. Cùng khối đó có hai hàm trợ giúp `_paw` (chân có bàn) và `_hl` (chân có móng guốc).
- **Màu ở chế độ rực rỡ (mặc định)**: `_vf/_R/_P/_C` nhận thêm tham số cuối `i` = chọn thẳng màu thứ i của `VPAL` (không còn phụ thuộc thứ tự gọi). Bảng màu hình mới nằm trong `Object.assign(VPAL, {...})` ngay dưới khối hình. Đã xóa `VPROPS.dog/cat/car/bicycle` cũ (nếu để lại, bản tô màu cũ sẽ đè lên hình mới) và xóa các bản cũ trong `PROPS`. Khi thêm hình mới: thêm mục `VPAL` cùng tên, mỗi khối truyền chỉ số màu.
- **Tên gọi**: thêm alias (pony, hen, rooster, bunny, pigeon, taxi, coconut_tree, pine_tree...) trong `Object.assign(propAliases, ...)` sau dòng `leaning_tower`. `bird` = chim đang bay (đồ nổi trên trời), `sparrow` = chim đậu/đứng trên đất.
- **AI tự học đồ vật mới** (`libLearnProp`): prompt mới `LIB_DRAW_GUIDE` (phương pháp vẽ + danh sách kiểm theo loại: thú, chim, cá, côn trùng, xe, nhà, cây, đồ dùng) kèm 2 hình mẫu `LIB_EX_ANIMAL` (mèo) và `LIB_EX_VEHICLE` (ô tô) lấy từ chính thư viện; 8-26 khối thay vì 4-12. Sau khi vẽ, `libReview` chụp hình thành PNG (`libSnap`) gửi lại cho Gemini hỏi "nhìn có nhận ra ngay không?", nếu chưa thì AI vẽ lại; lỗi gì cũng giữ bản đầu (tốn thêm 1 lượt gọi cho mỗi đồ vật mới, hình được lưu nên chỉ học một lần).
- **`libClean` linh hoạt hơn**: `libNormPath` đổi path chữ thường/hoa, H V S T A (cung tròn → Bézier) về M L Q C Z tuyệt đối; nhận thêm polygon/polyline/line; tối đa 40 khối; phần tử lạ hoặc hỏng thì bỏ qua (hỏng quá nhiều mới bỏ cả hình). Vẫn dựng lại từ đầu nên không chèn được mã.
- **`SVGR_SCENE`** có mục "ANIMALS, VEHICLES AND PLANTS" (luôn dùng thẻ `<prop>`, tên loài cụ thể, vị trí/kích cỡ/hướng nhìn, bầy đàn) và quy tắc 2b của đạo diễn (`refineBatch`) bắt ghi đúng tên loài. Danh sách đồ vật gửi cho AI tự sinh từ `Object.keys(PROPS)` nên hình mới tự có mặt.
- Hình học được từ bản cũ (`localStorage userlib_v1`) vẫn còn: nếu thấy hình cũ xấu thì bấm ✕ trong mục thư viện để tool tự học lại bằng prompt mới.
- Kiểm thử (Chromium + Gemini giả): vẽ thử 20 hình ở bw và vivid; 3 cảnh đầy đủ qua `svgImage` (nền, người, thú, xe) không lỗi; `libNormPath` (tương đối, cung tròn, S/T, sai cú pháp), `libClean` (loại script, onclick, stroke), `libLearnProp` + `libReview` (có gửi ảnh PNG, thay hình khi AI vẽ lại tốt hơn). CHƯA thử với key Gemini thật.
