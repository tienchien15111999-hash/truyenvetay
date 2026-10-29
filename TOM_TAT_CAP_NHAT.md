# TÓM TẮT DỰ ÁN + LỊCH SỬ CẬP NHẬT (dành cho AI khác đọc nhanh)

> **Cách đọc tiết kiệm token:** đọc file này trước. `index.html` dài ~1470 dòng, KHÔNG cần đọc hết.
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
- Cài đặt lưu `localStorage['cfg_v3']` theo danh sách `CF` (ô nhập id trùng tên): fmt, nimg, keys, isrc, style, hftok, vsrc, voice, vapp, vtok, vcode, vfall.
- Biến cờ: `abortGen` (nút Dừng tạo), `stopFlag` (dừng xem/xuất), `ctl` (AbortController đang chạy).

## 4. Bản đồ code `index.html` (số dòng xấp xỉ)
| Việc | Hàm / tên | ~Dòng |
|---|---|---|
| Danh sách model Gemini | `TXT_MODELS`, `TTS_MODELS`, `GEM_IMG_MODELS` | 172-190 |
| Khung hình, lưu cài đặt, số tranh | `setFmt`, `saveSet`, `vui`, `imgCount`, `nimgHint` | 207-253 |
| Gọi Gemini (xoay key, thử lại) | `gem`, `gemMulti` | 255-314 |
| Kịch bản + đạo diễn hình ảnh | `makeScript`, `sceneCtx`, `refineImages` | 315-366 |
| **Nhân vật doodle** | `POSES`, `figAttrs`, `figureSvg`, `expandPeople`, `SVGR_SCENE` | 368-466 |
| Các phong cách vẽ | `STYLES`, `curStyle` | 477-503 |
| Prompt SVG vẽ tay (kiểu không dùng nhân vật mẫu) | `SVGR_INK` (`SVGR_COLOR` không còn dùng) | 608-629 |
| Lọc SVG về đen/trắng + rung nét | `sanitizeSvg` | 630 |
| Tạo tranh 1 cảnh | `svgImage`, `makeImage` | 662-710 |
| SVG/ảnh → canvas nét mực + thứ tự vẽ | `inkify` | 711 |
| Giọng đọc Gemini / Vbee | `gemVoice`, `vbeeRaw`, `vbeeBatchOne`, `makeVoice` | 770-1072 |
| Nút kiểm tra key | `testGemini`, `testVbee` | 890-975 |
| Luồng chính | `start`, `makeVideo` | 1073, 1249 |
| Xem trước tranh | `renderGallery`, `updateCard`, `redraw` | 1194-1248 |
| Bàn tay, phát/xuất video | `hand`, `play` | 1330, 1356 |

## 5. Nhân vật doodle (vì sao không để AI tự vẽ người)
AI vẽ người bằng SVG thường méo và mỗi cảnh một kiểu. Nên với các phong cách `stick, doodle, marker, minimal, kids` (`MACRO_STYLES`) AI **chỉ đặt thẻ** `<person role="MAIN|SECOND|CROWD" x y size pose face acc facing/>`; `expandPeople()` đổi thẻ thành SVG người đẹp (đầu oval to, thân quả lê, tay chân mảnh) **trước** `sanitizeSvg`.
- `pose`: stand, wave, cheer, point, walk, run, sit, sad, carry, think, shout, hips. `face`: smile, happy, open, flat, sad, cry, angry, surprised. `acc`: none, tuft, hat, cap, glasses, beard, crown, long. Mặc định theo vai: MAIN=tuft, SECOND=hat, CROWD=none; size mặc định 1.3/1.2/0.8.
- x,y = chỗ bàn chân chạm đất (hệ tọa độ viewBox `0 0 fm.vw 900`), size 1 ≈ cao 330. Đồ vật/nhà cây vẫn do AI vẽ.
- Muốn thêm tư thế: thêm vào `POSES` (tọa độ vai→khuỷu→tay), và thêm tên vào prompt `SVGR_SCENE`. Phong cách `pencil, manga, brush` vẫn để AI tự vẽ bằng `SVGR_INK`.

## 6. Cập nhật đã làm trong đợt này (theo thứ tự)
1. **Bàn tay + bút vẽ lại**: tay đi từ góc dưới bên phải lên, xoay theo vị trí ngòi (`hand`).
2. **Camera + chuyển cảnh** trong `play`: mỗi cảnh một kiểu zoom vào / lia trái / zoom ra / lia phải (`i%4`), cuối cảnh mờ dần 0,5s, phụ đề hiện/mờ dần và có nền trắng che.
3. **Khung hình ngang/dọc** (ô `fmt`): xem `setFmt`, `fm`, viewBox động trong `sanitizeSvg`/prompt, canvas dọc có class `.v`.
4. **Nhân vật doodle kiểu ảnh mẫu** (mục 5).
5. **Xem trước tranh + nút Vẽ lại + chốt tranh rồi mới tạo giọng đọc/video** (mục 2). `start()` giờ chỉ vẽ tranh.
6. **Bỏ 2 lựa chọn "Cách vẽ tranh"**: `free_img` (Gemini Image/Flux/Pollinations) và `img` (Gemini Image trả phí). Còn `svg_ink` và `svg`. Cài đặt cũ đã lưu giá trị bị bỏ sẽ tự về `svg_ink`. Các hàm `genGeminiImg`, `genHfImg`, `genFreeFluxImg`, ô `hftok` vẫn nằm trong code nhưng không còn đường nào gọi tới (`makeImage` luôn vào `svgImage`). Có thể xóa cho gọn.
7. **Ô "Số tranh"** (`nimg`): trống = tự động ≈ 1 tranh/9 giây; gõ số thì kịch bản chia đúng số cảnh đó. Giới hạn 3-20 giây/tranh và tối đa 80 tranh (`imgCount`). Đã bỏ chữ "(~N cảnh)" trong ô Độ dài.

8. **Khung "💾 Lưu cài đặt & key"** cuối phần ⚙ Cài đặt: tự lưu mỗi khi gõ/dán (`saveSet`, nghe sự kiện `input`), hiện tình trạng đã lưu (`updStat`), nút Lưu (`saveNow`), Tải/Nạp file sao lưu `.json` (`exportSet`/`importSet`), Xóa key (`clearKeys`). Vẫn dùng `localStorage['cfg_v3']`, thêm trường `_t` là giờ lưu.

Đã có từ các bản trước (người dùng hoặc AI khác làm): nhiều phong cách vẽ, giọng Vbee qua `/api/vbee` (Realtime + Batch, tự chuyển giọng Gemini nếu lỗi), xoay nhiều key Gemini, nút kiểm tra key.

## 7. Lưu ý khi sửa (bẫy đã gặp)
- CSS `display:flex` đè thuộc tính `hidden`: phần tử có display riêng cần thêm `[hidden]{display:none}` (đã xử lý cho `.ph`).
- `sanitizeSvg` ép mọi màu thành `#111111`/`#ffffff`, xóa `<text>`, `<image>`, gradient; nếu cần màu phải sửa hàm `toBW`.
- `setFmt()` chỉ chạy trong `start()` (và lúc tải trang): đổi ô khung hình sau khi đã tạo tranh không có tác dụng với tranh cũ; `start(true)` (chạy bù) tự giữ khung hình cũ.
- Thứ tự vẽ trong `figureSvg`: chân → thân → đầu → mặt → tay → phụ kiện (tay phải vẽ sau thân để cầm đồ/chống cằm được).
- `makeVoice` có hàng đợi riêng cho Vbee (`vq`) vì Vbee giới hạn số yêu cầu đồng thời.

## 8. Kiểm thử (đã làm) và chưa làm
- Đã thử bằng Playwright + dữ liệu giả (ghi đè `gemMulti`, `makeVoice`): luồng tạo tranh → xem trước → vẽ lại → tạo video, cả khung ngang và dọc, bảng 12 tư thế nhân vật. **Chưa thử với key Gemini/Vbee thật** nên chưa biết AI đặt nhân vật có đẹp bố cục không (cần xem thực tế rồi chỉnh prompt `SVGR_SCENE`).
- Ý tưởng chưa làm: thêm Cloudflare Workers AI (FLUX schnell, miễn phí có hạn mức, cần file cầu nối kiểu `api/vbee.js`); chi tiết cảnh vật/bối cảnh đẹp hơn; ô chỉnh số tranh vẽ cùng lúc và thời gian nghỉ giữa các tranh (nếu gặp lỗi 429 của Gemini); màu theo vai nhân vật (bản trước từng có, bản hiện tại đen trắng hoàn toàn).
