# Bot xem tướng - hướng dẫn nhanh

## Cập nhật bản mới lên GitHub
1. Giải nén zip, mở thư mục bên trong (thấy package.json, app, lib).
2. Vào kho GitHub của bạn > Add file > Upload files > kéo TẤT CẢ file và thư mục bên trong vào > Commit changes.
3. Vercel tự cập nhật sau 1 đến 2 phút. Không cần làm gì thêm.

## Cách dùng trang web (mở địa chỉ gốc, ví dụ https://tên-web.vercel.app)
- Nhập ADMIN_PASSWORD để vào. Trang đầu là **Chat với khách**: danh sách khách bên trái, hội thoại bên phải, tự cập nhật mỗi 10 giây.
- **Xem tử vi:** khách nhắn "xem tử vi" kèm họ tên, giới tính, ngày tháng năm sinh (ghi rõ Dương hay Âm lịch) và giờ sinh. Bot gửi ngay ảnh lá số rồi gửi bài luận giải 6 phần (bản mệnh, sự nghiệp, tài chính, tình duyên, sức khoẻ, vận hạn năm). Thiếu thông tin nào bot hỏi đúng phần đó. Khách đổi ý ("thôi", "xem tướng mặt"...) thì bot thoát khỏi luồng tử vi. Lá số đã lập xong thì các câu hỏi tiếp theo được trả lời bình thường, muốn lập lá số mới thì nhắn "lập lá số cho người khác".
- Biểu tượng **🔑**: dán key Gemini (mỗi dòng một key). Bot dùng tất cả key và tự chuyển key/model khi hết lượt.
- Nút **+ Thêm page**: dán mã truy cập Fanpage (Page Access Token). Web tự kiểm tra, lấy tên và ảnh Fanpage, tự đăng ký nhận tin. Thêm nhiều Fanpage được, mỗi Fanpage có công tắc bật/tắt bot riêng. Ô chọn "Tất cả Fanpage" ở trên để lọc khách theo Fanpage.
- **💰 Thu phí xem tử vi** cho phép chọn miễn phí xem năm hoặc thu phí cả hai gói. Nhập giá, tải ảnh gói và QR, rồi khai tên tài khoản nhận tiền. Xem hướng dẫn đầy đủ trong HUONG-DAN-LUONG-MOI.md.
- **⚙️ Câu mở đầu** dùng để đổi lời chào, lời mời điền phiếu, ảnh mở đầu và số lượt hỏi thêm khi xem năm miễn phí.
- Biểu tượng **📚 Tri thức**: bấm vào đó mở cửa sổ gom 4 mục: **Xem tướng mặt**, **Xem chỉ tay**, **Tử vi** (kiến thức luận giải riêng của bạn, không bắt buộc, lá số do web tự an sao) và **Giọng bot**. Dán nội dung vào từng mục rồi bấm **Lưu thay đổi**.
- Tab **Thử bot**: gửi ảnh để thử, không cần qua Messenger.
- Công tắc **Bot bật/tắt** ở đầu trang dừng bot cho tất cả Fanpage.

## Các biến trên Vercel
| Tên | Ghi chú |
|---|---|
| DATABASE_URL | Neon tự thêm |
| ADMIN_PASSWORD | mật khẩu vào trang |
| VERIFY_TOKEN | chuỗi tự đặt, dán lại ở Meta khi nối webhook |
| GEMINI_API_KEYS | không bắt buộc nếu đã nhập key bằng biểu tượng 🔑 |
| PAGE_ACCESS_TOKEN | không bắt buộc nếu đã thêm Fanpage bằng nút + Thêm page |
| SHOP_NAME, CONTACT_EMAIL | in lên trang /privacy, /terms, /data-deletion |
| NEXT_PUBLIC_BASE_URL | địa chỉ web của bạn, ví dụ https://xemtuvi-delta.vercel.app (không có dấu / ở cuối). Facebook cần địa chỉ này để tải ảnh lá số Tử Vi và ảnh câu mở đầu |
| GEMINI_MODELS | không bắt buộc, mặc định gemini-3.5-flash-lite, gemini-3.6-flash, gemini-3.8-flash |
| FB_APP_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | không bắt buộc |

## Lưu ý
- Mã Fanpage và key Gemini nhập ở trang web được lưu trong cơ sở dữ liệu Neon của bạn, trang web không bao giờ hiện lại đầy đủ.
- Trang /admin cũ tự chuyển về trang gốc.
- Khách chưa trả phí không nhận được dữ liệu các mục khác: phần chặn nằm trong code, không chỉ là lời dặn cho AI. Khi bạn bấm xác nhận, Messenger chỉ cho nhắn báo khách trong vòng 24 giờ kể từ tin cuối của khách; quá hạn thì bot vẫn mở quyền xem và báo bạn nhắn tay.
- Lời dặn luôn có luật: không doạ khách để thúc trả tiền.
- Ảnh trong kho được thu nhỏ rồi lưu trong cơ sở dữ liệu Neon của bạn (không cần cài thêm gì). Mỗi ảnh tối đa 3 MB. Địa chỉ ảnh dạng /api/media/... là công khai để Facebook tải được, mã ảnh là chuỗi ngẫu nhiên khó đoán.
- Nội dung cài đặt (bảng kiến thức, giọng bot, công tắc) được bot ghi nhớ tối đa 10 giây, nên đổi xong có thể mất vài giây bot mới dùng bản mới.
- Ảnh lá số vẽ bằng phông Be Vietnam Pro nhúng sẵn trong thư mục lib/fonts, đừng xoá thư mục này.

## Cập nhật thứ tự model Gemini

Ưu tiên: Gemini 3.5 Flash-Lite → Gemini 3.6 Flash → Gemini 3.8 Flash. Bot trả kết quả ngay khi một model thành công; lỗi tạm thời hoặc model không khả dụng thì thử model tiếp theo, tối đa 3 lần. Lỗi HTTP 400 dừng để tránh lặp yêu cầu sai.

Nếu Vercel đã có GEMINI_MODELS, sửa giá trị thành:

```env
GEMINI_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.8-flash
```

Sau khi cập nhật mã nguồn và biến môi trường, Redeploy để bản chạy thật nhận cấu hình mới. Xóa biến GEMINI_MODELS cũng sẽ dùng đúng thứ tự mặc định trên. API key vẫn giữ nguyên.

Mã model được đối chiếu tài liệu Google: https://ai.google.dev/gemini-api/docs/models
Kiểm thử thứ tự gọi dùng fetch giả lập; chưa xác thực quyền truy cập/hạn mức bằng API key thật.

## Claude dự phòng khi Google lỗi hoặc chậm

Đã tích hợp trực tiếp vào hàm gọi AI dùng chung. Mọi luồng dùng askGemini (chat, phân loại ảnh, lấy thông tin sinh, luận tử vi) tự được dự phòng; không cần gọi endpoint mới từ trình duyệt.

Trong Vercel → Settings → Environment Variables thêm:

```env
ANTHROPIC_API_KEY=<key Claude của bạn>
CLAUDE_MODEL=claude-haiku-4-5-20251001
GEMINI_TIMEOUT_MS=8000
CLAUDE_TIMEOUT_MS=20000
```

- Key Google vẫn nhập như cũ; key Claude chỉ cấu hình trên server bằng ANTHROPIC_API_KEY, không nhập vào ô key Gemini.
- Giữ thứ tự Google: 3.5 Flash-Lite → 3.6 Flash → 3.8 Flash. Tối đa 3 lượt Google, mỗi lượt xoay key theo cơ chế cũ; không thử toàn bộ tổ hợp model × key vì sẽ đợi quá lâu. Nếu cả 3 lượt lỗi, mất mạng, trả rỗng hoặc hết timeout thì chuyển Claude. HTTP 400 dừng các lượt Google và chuyển Claude ngay. Chưa có key Google nhưng có key Claude thì gọi thẳng Claude.
- Mỗi lượt Google có hạn 8 giây kể cả tải response body, tổng khoảng 24 giây trước Claude nếu cả ba lượt đều treo. Claude có hạn 20 giây, một lượt. Có thể giảm GEMINI_TIMEOUT_MS nếu muốn chuyển sớm hơn. Khoảng hợp lệ 100–60000ms, cấu hình sai dùng mặc định. Đây là hạn cho mỗi lần gọi AI, không phải toàn bộ hội thoại có nhiều bước.
- Timeout hủy request đang chờ; không chờ một câu trả lời đến muộn rồi gửi thêm lần hai. Việc hủy phía client không đảm bảo nhà cung cấp ngừng tính phí xử lý.
- Claude nhận cùng lời dặn, lịch sử, nội dung và ảnh trong yêu cầu dự phòng. Chuyển role model → assistant và ảnh base64 sang định dạng Messages API; không sửa lịch sử gốc. Chỉ lấy text, không gửi các khối thinking cho khách.
- Bộ lọc nội dung Google chặn yêu cầu thì dừng, không chuyển nhà cung cấp để vượt bộ lọc.
- Không có key Claude thì giữ cơ chế chỉ Google. Nếu Claude cũng lỗi, lỗi được trả về bộ xử lý bot đang có; không giả lập câu trả lời.
- Mặc định dùng Haiku 4.5; có thể đổi CLAUDE_MODEL thành model Messages API tài khoản được phép gọi. Không gửi temperature/thinking tùy chỉnh sang Claude, để model dùng mặc định.
- ANTHROPIC_WORKSPACE_ID chỉ cần điền nếu loại key của bạn yêu cầu workspace ID.
- Hai route webhook/admin-test đặt maxDuration=180 để dành thời gian cho các bước gọi nối tiếp. Kiểm tra gói hosting hỗ trợ mức này; maxDuration không tự nâng giới hạn của gói. Các timeout dài tự cấu hình có thể vượt thời gian xử lý toàn route.
- Redeploy sau khi cập nhật code và biến môi trường. Không cần thêm thư viện npm; dùng fetch phía server.

Đã kiểm thử bằng API giả lập: ưu tiên Google, các lỗi HTTP, mất mạng, kết quả rỗng, timeout kết nối/response body và hủy request, Claude lỗi, không có key, lịch sử/ảnh, quyền truy cập key tách biệt. Chưa gọi bằng key Claude thật của bạn.

Tài liệu giao thức/model: https://platform.claude.com/docs/en/claude_api_primer và https://platform.claude.com/docs/en/api/http/messages

## Tử vi trọn đời
Khách nhắn “xem tử vi trọn đời”, bot hỏi đủ thông tin sinh rồi gửi phần tổng quan. Bài gồm 6 phần chủ đề (bản mệnh, sự nghiệp, tài chính, gia đạo, sức khỏe/phúc phần, tiền–trung–hậu vận), từng đại vận 10 năm theo dữ liệu lá số, và tổng kết.

- “xem tiếp”: gửi một phần tiếp theo, lưu tiến độ trong tuvi_state của khách.
- “mục lục”: liệt kê các phần và đánh dấu phần đã nhận.
- “xem lại phần N”: trả lại nội dung đã lưu, không gọi AI lại, không mở phần chưa nhận.
- “tạm dừng”: lưu trạng thái dừng; “xem tiếp” tiếp tục từ chỗ cũ.
- Câu hỏi thêm không tăng tiến độ. Không gửi tự động hàng loạt khi khách im lặng.
- Chủ shop xác nhận đã nhận tiền trong hội thoại để mở các phần luận trọn đời.
- Giữ Gemini → Claude dự phòng. Không cần thêm bảng database; nội dung và tiến độ dùng tuvi_state hiện có.
- Đại vận chỉ diễn giải cung hạn và sao gốc; chưa có sao lưu riêng, không cam kết sự kiện từng năm hoặc tuổi thọ. Đây là nội dung tham khảo.
- Triển khai bằng npm ci, npm test, npm run build rồi redeploy. Kiểm thử API dùng giả lập, không dùng key thật.

## Giao diện chọn Fanpage
Bộ chọn Fanpage nằm đầu cột hội thoại bên trái, hiển thị avatar và tên page; bấm để đổi page hoặc xem tất cả. Góc trên có hai công tắc: toàn bộ bot và riêng Fanpage đang chọn. Tắt toàn bộ có ưu tiên cao hơn công tắc từng page. Khi chọn tất cả, công tắc riêng page bị vô hiệu hóa. Chuyển page sẽ đóng hội thoại cũ để tránh thao tác nhầm. Trạng thái chỉ cập nhật sau khi server lưu thành công; lỗi hiển thị ngay trên giao diện. Fanpage dùng token môi trường cần được thêm vào danh sách quản lý trước để có công tắc riêng.

## Cài đặt gói xem và nhận tiền

Chi tiết có trong HUONG-DAN-LUONG-MOI.md.

## Timeout mới theo tác vụ
Các biến GEMINI_TIMEOUT_MS và CLAUDE_TIMEOUT_MS cũ không còn được dùng. Code mặc định: trích xuất/phân loại tối đa 12 giây mỗi lượt Gemini, tổng ngân sách Gemini 20 giây, Claude 15 giây. Bài luận/chat tối đa 45 giây mỗi lượt Gemini, tổng Gemini 60 giây, Claude 45 giây. Khi ngân sách Gemini gần hết, lượt sau chỉ dùng thời gian còn lại, không chờ thêm 45 giây đầy đủ. Lỗi HTTP trả sớm sẽ chuyển ngay theo thứ tự model đã cấu hình. Timeout hủy request kể cả khi đang đọc response body.

Có thể đặt 6 biến mới trong .env.example trên Vercel rồi Redeploy; không đặt thì dùng mặc định mới. Ngân sách áp dụng cho một lần gọi AI; một lượt hội thoại có thể có bước trích xuất rồi bước luận, tối đa mặc định khoảng 140 giây cho hai bước AI, chưa tính database/gửi tin. maxDuration của route là 180 giây, hosting phải hỗ trợ; chưa triển khai hàng đợi bền vững. Giữ nguyên các luồng bán hàng và Gemini → Claude.

## Giọng luận giảng giải gần gũi
Quy tắc chung trong lib/tuvi-style.js: nêu căn cứ → giải nghĩa → ví dụ đời sống → gợi ý. Được dùng trong prompt tổng quan, xem thử, trả phí, trọn đời và năm tới. Không sao chép lá số Quý Mùi của bài mẫu vào khách khác; phân biệt âm dương thuận lý với Mệnh–Cục. Không phán chắc số phận, tuổi thọ hoặc tâng bốc vô căn cứ. Đây là hướng dẫn cho AI, không đảm bảo từng câu đầu ra; chủ shop nên thử vài hội thoại thực tế sau triển khai. Thay đổi không đụng tới giá, QR, số lượt miễn phí hoặc xác nhận tiền.

## API key theo nhà cung cấp
Mục 🔑 có hai khu riêng: Gemini (dùng chính, nhiều key) và Claude/Anthropic (dự phòng, một key). Claude key nhập bằng ô mật khẩu, lưu server trong bảng claude_keys, GET chỉ trả key đã che. Không có mã hóa ứng dụng bổ sung, cần bảo vệ quyền truy cập database như với key Gemini. ANTHROPIC_API_KEY trên Vercel ưu tiên hơn key Claude lưu trong trang quản trị; giao diện hiển thị rõ trạng thái này. Xóa key trong quản trị không xóa biến môi trường. Không dùng ô Gemini để nhập key Claude. Kiểm thử dùng key giả, chưa xác minh quyền model bằng key thật.

## Chỉ còn chế độ Tử Vi
Đã bỏ tab kiến thức mặt/tay, hồ sơ mặt/tay khỏi giao diện, bảng kiến thức mặc định và phần ghép hồ sơ vào lời luận. Bot không gọi AI xem tướng theo ảnh; yêu cầu xem mặt/tay được chuyển về tử vi. Giữ ảnh gói, QR, biên lai và ảnh lá số. Dữ liệu mặt/tay cũ trong database không bị xóa nhưng không dùng để luận nữa. Nếu trước đây bạn tự viết câu mở đầu hoặc tên bot có lời mời xem mặt/tay, hãy sửa phần nội dung tự cấu hình trong quản trị; hệ thống không ghi đè câu mở đầu riêng của shop.

## Gom thông tin và nhịp chat
Khách mới nhận lời chào/form đã cấu hình trước khi bot chờ. Webhook gom tin trong 30 giây; mỗi tin mới đẩy thời điểm xử lý sang 30 giây sau tin đó. Tin đầu vẫn được giữ để không mất thông tin sinh đã gửi sẵn. Sau khoảng yên lặng, bot trích xuất và chỉ hỏi mục còn thiếu. Giờ 0 vẫn hợp lệ. Bản thử trong admin không giả lập thời gian chờ webhook.

Bài trả lời Messenger tách theo đoạn thành các tin tối đa khoảng 650 ký tự, cách nhau 0,9 giây và hiện đang gõ. Đây là nhịp gửi dễ đọc, không giả nhận bot là người thật. Tin xác nhận/thanh toán ngắn giữ nguyên. Webhook cần hosting hỗ trợ maxDuration=240 giây. Cách chờ dùng tác vụ nền hiện có, chưa phải hàng đợi bền vững: nếu tiến trình bị dừng thì không đảm bảo nhắc đúng 30 giây. Chưa kiểm thử nhận/gửi thực tế trên Meta; hãy thử bằng Fanpage sau redeploy.
