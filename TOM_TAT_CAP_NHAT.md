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
- Cài đặt lưu `localStorage['cfg_v3']` theo danh sách `CF` (ô nhập id trùng tên): fmt, nimg, keys, isrc, style, hftok, vsrc, voice, vapp, vtok, vcode, vfall, kèm `_t` (giờ lưu). Ảnh mẫu phong cách lưu riêng ở `localStorage['refimg_v1']` (JPEG data URL ≤896px). `saveSet` chạy mỗi khi gõ (sự kiện `input`) và khi đổi ô (`change`).
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
| Nút kiểm tra key | `testGemini`, `testVbee` | 1156+ |
| Luồng chính | `start`, `makeVideo` | 1339, 1515 |
| Xem trước tranh | `renderGallery`, `updateCard`, `redraw` | 1460-1514 |
| **Bàn tay cầm bút (Path2D)**, phát/xuất video | `hand`, `play` | 1596, 1644 |

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

Đã có từ các bản trước (người dùng hoặc AI khác làm): nhiều phong cách vẽ, giọng Vbee qua `/api/vbee` (Realtime + Batch, tự chuyển giọng Gemini nếu lỗi), xoay nhiều key Gemini, nút kiểm tra key.

## 7. Lưu ý khi sửa (bẫy đã gặp)
- CSS `display:flex` đè thuộc tính `hidden`: phần tử có display riêng cần thêm `[hidden]{display:none}` (đã xử lý cho `.ph`).
- `sanitizeSvg` ép mọi màu thành `#111111`/`#ffffff`, xóa `<text>`, `<image>`, gradient; nếu cần màu phải sửa hàm `toBW`.
- `setFmt()` chỉ chạy trong `start()` (và lúc tải trang): đổi ô khung hình sau khi đã tạo tranh không có tác dụng với tranh cũ; `start(true)` (chạy bù) tự giữ khung hình cũ.
- Thứ tự vẽ trong `figureSvg`: chân → thân → đầu → mặt → tay → phụ kiện (tay phải vẽ sau thân để cầm đồ/chống cằm được).
- Thẻ `<person>`/`<prop>` phải được bung ra TRƯỚC `sanitizeSvg` (nó xóa thẻ lạ). `sanitizeSvg` chỉ giữ `#111111`/`#ffffff`: đừng dùng màu khác trong `PROPS`.
- `hand` vẽ bằng `Path2D`; nhớ cặp `x.save()/x.restore()` (đã từng thừa một `save` gây lệch). Ngón tay bỏ `Z` ở cuối đường để không có nét viền ở gốc ngón.
- Chữ có dấu tiếng Việt: khi dùng `cut -c` trên terminal sẽ cắt giữa ký tự gây lỗi UTF-8; dùng Python để đọc.
- `makeVoice` có hàng đợi riêng cho Vbee (`vq`) vì Vbee giới hạn số yêu cầu đồng thời.

## 8. Kiểm thử (đã làm) và chưa làm
- Đã thử bằng Playwright + dữ liệu giả (ghi đè `gemMulti`, `makeVoice`): luồng tạo tranh → xem trước → vẽ lại → tạo video, cả khung ngang và dọc, bảng 12 tư thế nhân vật; lưu/nạp/xóa key và tải ảnh mẫu; bảng ~45 đồ vật; 4 nhân vật 4 vai; một cảnh ghép nhà+núi+người+chó; bàn tay mới ở 2 góc xoay.
- **Chưa thử với key Gemini/Vbee thật**: chưa biết AI đặt thẻ `<prop>`/`<person>` có bố cục đẹp không (có thể chồng nhau, cần chỉnh prompt `SVGR_SCENE`), chưa biết chất lượng đoạn mô tả phong cách do `refStyleText` trả về.
- Ý tưởng chưa làm: thêm đồ vật Việt Nam (trâu, ruộng lúa, nhà sàn, thuyền thúng); tự tránh chồng chéo khi đặt đồ vật/người; cho chỉnh màu da/áo/bút của bàn tay; Cloudflare Workers AI (FLUX schnell, cần file cầu nối kiểu `api/vbee.js`); ô chỉnh số tranh vẽ cùng lúc và thời gian nghỉ giữa các tranh (nếu gặp lỗi 429 của Gemini); màu theo vai nhân vật (hiện đen trắng hoàn toàn); xóa code chết `genGeminiImg`, `genHfImg`, `genFreeFluxImg`, ô `hftok`.
