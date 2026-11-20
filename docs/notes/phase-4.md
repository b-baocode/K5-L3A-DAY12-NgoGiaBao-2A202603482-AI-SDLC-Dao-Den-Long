# Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0" · Contract v1.3

## Tiêu chí nghiệm thu → bằng chứng
| Yêu cầu | Tiêu chí | Kiểm chứng / bằng chứng | Kết quả |
|---|---|---|---|
| Bench: cảnh chuẩn | Đêm 1, đúng 200 Bóng Mực `wander` + 100 đom đóm (seed 42), L1–L3 sáng dầu 100; tắt sinh/sát thương/nhặt/hao dầu/kết thúc; Bóng Mực vẫn lang thang | `tests/release.test.js` "bench scene…" (2 test) | Đạt |
| Bench: cửa sổ, camera, đo | 1280×720 không toàn màn hình, vsync GPU tắt, camera tròn r30/Y15 từ (30,15,0) 15 s/vòng, 3 s khởi động, đo `--duration` s, thoát 0 | `scripts/bench.js`, `src/web/main.js` (`startBench`) | Đạt |
| Bench: ngưỡng | avg ≥ 60, p1 low ≥ 30, load ≤ 10000 ms | [bench.json](../../bench.json): 136.4 / 62.9 / 1579 ms (Intel UHD); [BENCH.md](../proof/phase-4/BENCH.md) | Đạt (máy tôi) |
| Soak | 10 Đêm một tiến trình, seed 7+i, input ngẫu nhiên theo seed; crashes 0, mem_end ≤ 1.2 × mem_start | [soak.json](../../soak.json); `release.test.js` "soak…"; Linux (Docker node:22) 3 seed: +1.6–2.2 % | Đạt |
| Bảng xếp hạng | Tên 3–12 `[A-Za-z0-9_]` (+ tiếng Việt), `name/score/nights_won/achieved_at/seed`, top 10, điểm giảm dần, bằng điểm ai trước đứng trên, lưu đĩa, màn hình từ menu, `--export-leaderboard` | `release.test.js` (3 test), e2e trong Edge: thua → lưu "NgôGiaBảo" → `data/leaderboard.json` → export ([p4-leaderboard.png](../proof/phase-4/p4-leaderboard.png)) | Đạt |
| Đổi phím | 9 hành động, báo trùng phím, "Khôi phục mặc định", được lưu | e2e: gán Nhảy = W → "Trùng phím: W đang dùng cho Đi lên và Nhảy"; reset → Space; localStorage ([p4-settings-a11y.png](../proof/phase-4/p4-settings-a11y.png)) | Đạt |
| Phụ đề / chỉ báo | Bóng Mực xuất hiện (+ mũi tên mép màn hình 4 s), gió sắp thổi, 10 s cuối, đèn fuel < 30 | `drawHud()` + `onEvent()` (toast có `aria-live`) | Đạt (kiểm tra bằng mắt) |
| Giảm chuyển động | Tắt rung camera và chớp màn hình (cả nhấp nháy đồng hồ) | `settings.reduce` → `flash()` bỏ qua, không rung, CSS `body.reduce` | Đạt |
| Cỡ chữ | ≥ 18 px ở 1280×720; tùy chọn ×1.25 | e2e đo mọi chữ đang hiển thị: **min = 18 px**; `body.large` | Đạt |
| Đóng gói | Clone → ≤ 3 lệnh → chơi được; README đủ mục; CHANGELOG 4 phase; CREDITS; LICENSE; Release v1.0.0 có bản chạy được | README, `scripts/run.js` tự build lần đầu; Release: zip web tĩnh | Đạt (Release tạo khi tag) |
| Contract v1.3 | `contract_version 1.3`, `bench_cmd`, `soak_cmd`; v1.0–v1.2 giữ nguyên | headless.test "contract file"; proof 19 scenario **giống từng byte** phase-3 | Đạt |
| Retro + video | Retro 1–2 trang; video < 5 phút | [retro.md](retro.md); video: **người làm quay** | Retro đạt; video chờ quay |

## Quyết định
- **Bảng xếp hạng lưu đĩa qua `scripts/run.js`** (server Node không phụ thuộc, `data/leaderboard.json`, ghi atomic) vì lệnh `--export-leaderboard` chạy từ dòng lệnh phải đọc được dữ liệu. Khi chạy bằng `vite dev` hoặc bản web tĩnh, game tự dùng `localStorage`.
- **`run_cmd` = `node scripts/run.js`** (thay `npm start` của vite) để vừa chạy game vừa nhận `--export-leaderboard`. `npm start` gọi cùng lệnh.
- **Bench dùng `puppeteer` (Chrome for Testing)** để máy chấm sạch không cần cài trình duyệt; cửa sổ thật, không headless.
- Giữ bộ giới hạn khung của Chrome (chỉ tắt vsync GPU): đo chứng minh tắt cả hai làm số liệu sai (BENCH.md).

## Lỗi tìm thấy nhờ kiểm chứng
- **Soak trượt trên CI macOS sau khi đã tag** (58.5 > 57.1 MB). Đo từng Đêm trên Linux: mặc định RSS 50 → 60 MB ngay sau Đêm 1 rồi **đi ngang 30 Đêm** (không rò rỉ; là mã TurboFan + young generation). Thử `--max-semi-space-size` (không đủ), gc định kỳ (không đổi), `--jitless` (48.2 → 51.3), `--no-opt` + young gen 1 MB (48.6 → 49.8, chọn). Bài học: phải chạy kiểm chứng trên **cùng hệ điều hành với máy chấm** (Docker Linux) trước khi tag.
- Bench: 850 draw call → instancing; khung khởi động bị tính vào đo; shader biên dịch giữa chừng; đo bộ nhớ bằng WMI gây khựng; cờ `--disable-frame-rate-limit` cho số đo ảo (BENCH.md).
- **Ô nhập tên bị "nuốt" phím**: bộ bắt phím của game gọi `preventDefault()` cho phím đã gán (A, W, S, D, E, F, P, Space) nên "NgôGiaBảo" thành "NgôGiBảo". Phát hiện bằng e2e, sửa bằng cách bỏ qua phím khi đang gõ vào ô nhập.
