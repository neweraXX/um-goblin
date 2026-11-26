Đã đọc đúng 5 file, không sửa. Có mô phỏng trong bộ nhớ; chưa chạy LIVE. Tham chiếu: [app.js](./public/app.js), [server.mjs](./server.mjs), [clean.mjs](./lib/clean.mjs), [index.html](./public/index.html). Số bug dẫn tới cơ chế/file:dòng bên dưới.

| Mục | Kết luận, bằng chứng |
|---|---|
| A1 | LỖI — 01. |
| A2 | LỖI — 01. |
| A3 | ĐẠT — `app.js:282–289`: hai nút dùng chung Audio. |
| A4 | KHÔNG CHẮC — `app.js:1144`: cú pháp qua; chưa quan sát console LIVE. |
| B1 | LỖI — 13–15. |
| B2 | LỖI — 09–10. |
| B3 | LỖI — 08. |
| B4 | LỖI — 11; CTA có tại `app.js:864`. |
| C1 | LỖI — 02,21. Listener ĐẠT: `app.js:1125` dùng delegation; không còn `getElementById(...).addEventListener`. |
| C2 | LỖI — 02,04,18–22,24,26. |
| C3 | LỖI — 03–04,12,22. |
| C4 | LỖI — 05–07. |
| C5 | KHÔNG CHẮC — `server.mjs:152` gọi assessAnswer ngoài phạm vi; `app.js:1027` không đổi kích thước. |
| C6 | ĐẠT tĩnh — `app.js:297`; `server.mjs:132,142` chặn loại file, 8MB,95s. |
| D1 | LỖI — 17,23,25,27; drawer có mở/đóng. HTTP404 upstream KHÔNG CHẮC: `server.mjs:301`. |
| E1 | LỖI — 07,28. |
| F1 | LỖI — 16. Thông điệp 429 KHÔNG CHẮC: `app.js:25` bỏ status; limiter ngoài phạm vi. |
| F2 | KHÔNG CHẮC — `index.html:9`: CSS ngoài phạm vi; `app.js:243` có nhánh reduced-motion. |
| F3 | ĐẠT — `server.mjs:334` trả no-cache cho HTML/JS/CSS. |

P0: hỏng luồng chính; P1: sai; P2: xấu. Sau dấu → là sửa cụ thể.

| # | Mức | Cơ chế → sửa |
|---|---|---|
| 01 | P0 | `app.js:353,355,1144`: khởi tạo offline/edit=null, không bootstrap API → nạp sample LIVE và clean đã cache. |
| 02 | P0 | `app.js:299,333,797`: upload chỉ analyze; 0 filler mất nút → clean ngay; 0 filler dùng original. |
| 03 | P0 | `app.js:299,332,1032`: generation chỉ đổi khi Reset; response1 đè file2 → token mỗi take, hủy request cũ. |
| 04 | P0 | `app.js:794,799`: upload B chen clean A, ghép transcript B/audio A → snapshot takeId, hủy luồng đối nghịch. |
| 05 | P0 | `app.js:295,588`: upload xóa timer nhưng recorder vẫn chạy → dừng recorder/stream trước upload. |
| 06 | P1 | `app.js:306–321`: bấm micro kép tạo recorder/stream dùng chung globals; lỗi không nhả mic → khóa acquiring, biến local, cleanup. |
| 07 | P1 | `app.js:101,307,321,1002`: decode/reject/stream cũ vượt Reset → kiểm generation trước mọi ghi state; giữ stream local. |
| 08 | P1 | `app.js:288,895,915`: stop nguồn kích onended, story tiến và tắt nghe tay → suspend nguồn, chặn bước khi paused. |
| 09 | P1 | `app.js:84,1078`: Play gọi unlock trước guard, tự resume khi paused → guard trước unlock; giữ pause khi load. |
| 10 | P1 | `app.js:814,818,870–878`: Skip chờ chuẩn bị; fallback bỏ Next/Skip → hủy chuẩn bị, kiểm token/cờ mỗi đoạn. |
| 11 | P1 | `app.js:1078`: Watch again luôn gọi sample → replay đúng attempt vừa xem. |
| 12 | P1 | `app.js:726,755`: đổi take giữa animateEdit, pass undefined gây exception/khóa playing → hủy animation, kiểm pass, finally mở khóa. |
| 13 | P1 | `app.js:100`: một fetch/decode lỗi làm mất cả ba buffer → allSettled, giữ buffer thành công. |
| 14 | P1 | `app.js:964,971`: fallback nhận editEnd rồi cắt filler lần nữa → truyền listenEnd theo timeline original. |
| 15 | P1 | `app.js:844–849`: clean thất bại vẫn báo 0 ums/no changed words → hiện “chưa kiểm chứng”, bỏ kết luận mặc định. |
| 16 | P1 | `server.mjs:282–284,193`: quota trừ trước sample/cache hit → miễn sample và clean cache; replay tái dùng attempt. |
| 17 | P1 | `app.js:1001,1090`: history re-render tháo node đang chờ gate → lưu gate vào state, render node hiện tại. |
| 18 | P1 | `app.js:821–825`: Play the edit chỉ chạy animation → tạo/phát clean audio. |
| 19 | P1 | `clean.mjs:23`: hết đoạn giữ lại fallback nguyên clip → xuất silence thay vì khôi phục filler. |
| 20 | P1 | `clean.mjs:44`: regex ASCII coi “mẹ”/“mà” giống nhau → chuẩn hóa Unicode, giữ chữ có dấu. |
| 21 | P1 | `app.js:299`; `server.mjs:158`: m4a thiếu MIME thành webm; ogg/flac lưu sai đuôi → ánh xạ MIME/đuôi đầy đủ. |
| 22 | P1 | `app.js:330–334`: take mới giữ audio đang phát, hero đã béo → dừng playback, reset visuals khi đổi take. |
| 23 | P2 | `app.js:801–802`: measured trộn số take riêng với benchmark sample → ghi rõ nguồn từng phép đo. |
| 24 | P2 | `app.js:37,794`: file riêng mang speaker NASA; metadata kế thừa sai → dựng metadata theo nguồn. |
| 25 | P2 | `app.js:41,595,48`: Pass thiếu words; renderAllData không cập nhật drawer → bổ sung words, render judge khi dữ liệu đổi. |
| 26 | P2 | `app.js:569–573`: waveform edit mặc định Pass0 dù clean xong → hiển thị pass cuối. |
| 27 | P2 | `server.mjs:68`: tuổi process gắn nhãn Sprite “woke” → đổi thành uptime hoặc đo wake thật. |
| 28 | P2 | `app.js:253,1031`: Reset để flyer đang bay → hủy animation và xóa flyer/snack. |