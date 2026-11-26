# Um Goblin — checklist luồng người dùng (mọi bug phải được bắt ở đây trước khi đưa Hà)

Môi trường: LIVE trên Sprite (Deepgram + OpenRouter thật), Chrome desktop 1440×900 và mobile 390×844.

A. Vừa mở trang, chưa bấm gì
 A1 Không có nhãn "Offline preview" khi API sống; dữ liệu sample là LIVE.
 A2 "Hear the original" phát được; "Hear the goblin edit" phát được (không báo "unavailable").
 A3 Bấm nút này khi nút kia đang phát → nút kia dừng (chỉ 1 âm thanh).
 A4 Không lỗi console.
B. Play the story
 B1 Chạy đủ 4 cảnh, có tiếng ở cảnh 1 (8s đầu), cảnh ăn (mỗi um), ợ, A/B, checker có số + từ bị khác.
 B2 Pause/Resume, Next, Skip đều đúng; không treo; không hai âm thanh cùng lúc.
 B3 Bấm nghe tay trong lúc story → story tạm dừng.
 B4 Hết story: hiện "Watch again" + "Try it with your voice"; Watch again chạy lại được lần 2, lần 3.
C. Try it yourself
 C1 Upload file wav/mp3/m4a → "Take analyzed" + nút "Watch the goblin eat your ums".
 C2 Bấm nút đó → story chạy trên chính file đó (transcript, um, tiếng là của file đó), goblin edit + edit audio của file đó phát được.
 C3 Upload file thứ 2 liền sau → kết quả thay bằng file 2, không lẫn dữ liệu file 1.
 C4 Ghi âm micro (cho phép / từ chối quyền) → kết quả hoặc lỗi thân thiện.
 C5 "What if I stay silent?" → verdict not_a_win, goblin không nhỏ đi.
 C6 File không phải audio / >8MB / >95s → lỗi thân thiện.
D. Judge
 D1 Mở/đóng drawer; Test the gate → 404 thật; Sprite facts có số; bảng measured; Pass 0/1/2.
E. Reset
 E1 Reset giữa story, giữa upload, giữa ghi âm → về trạng thái đầu, không response muộn hồi sinh, không âm thanh còn kêu.
F. Khác
 F1 Rate limit 429 → thông điệp thân thiện; sample/cached không ăn quota mỗi lần tải trang.
 F2 Mobile 390px không tràn; reduced-motion vẫn dùng được.
 F3 Tải lại trang sau deploy → code mới (không cache cũ).
