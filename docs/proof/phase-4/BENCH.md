# Benchmark — Ticket-04 §1

Kết quả nộp: [`bench.json`](../../../bench.json) (seed 42, 30 s), chạy bằng `node scripts/bench.js --seed 42 --duration 30 --out bench.json`.

| Chỉ số | Kết quả | Ngưỡng | Đạt |
|---|---|---|---|
| avg_fps | 136.4 | ≥ 60 | ✅ |
| p1_low_fps | 62.9 | ≥ 30 | ✅ |
| frame_ms_p95 | 13.7 ms | — | |
| load_ms | 1579 | ≤ 10000 | ✅ |
| peak_mem_mb | ~630–730 (tổng RSS tiến trình trình duyệt) | — | |

Máy: Intel Core i7-13620H, **GPU Intel UHD (tích hợp)**, 16 GB RAM, Windows 11, Chrome for Testing 131 (puppeteer 23.11.1), three.js r170, cửa sổ 1280×720 (không toàn màn hình). Máy chấm của giảng viên sẽ cho số khác.

## Cách đo
- Cảnh chuẩn sinh trong `src/sim/bench.js`: Đêm 1, đúng 200 Bóng Mực `wander` và 100 đom đóm rải đều trên đảo theo seed 42, L1–L3 sáng dầu 100. Cờ `bench` của sim tắt sinh thực thể, sát thương, nhặt, hao dầu, kết thúc Đêm; Bóng Mực vẫn lang thang theo luật (`tests/release.test.js` kiểm chứng). Sáng tạo thêm **tắt** (`extras: false`).
- Camera: tròn bán kính 30 m, Y = 15, tâm (0,0,0), bắt đầu ở (30,15,0), ngược chiều kim đồng hồ nhìn từ trên, 15 s/vòng. Mây đứng yên ở (0,0,0), không input.
- 3 s khởi động không đo; một khung chỉ được tính nếu **bắt đầu** sau mốc 3 s. Sau đó đo đúng `--duration` giây, rồi thoát mã 0.
- Thống kê đúng định nghĩa ticket: `avg_fps = 1000·N/Σdt`, `p1_low` = 1000 / trung bình k = max(1, ceil(0.01N)) dt lớn nhất, `frame_ms_p95` = phân vị 95 của dt.
- `load_ms` = từ lúc tiến trình `bench.js` bắt đầu tới khung đầu tiên của cảnh bench.
- `peak_mem_mb`: lấy PID các tiến trình trình duyệt **một lần** (DevTools `SystemInfo.getProcessInfo`) trong lúc khởi động, rồi trong khi đo đọc RSS bằng `tasklist` (Windows) / `ps` (macOS, Linux) mỗi 2 s.

## Những gì đã phát hiện khi làm bench (trung thực)
| Lần | avg | p1 low | Nguyên nhân | Sửa |
|---|---|---|---|---|
| 1 | 99 | 12.7 | ~850 draw call/khung (200 Bóng Mực × 3 mesh, 100 đom đóm × 2 sprite) | Bóng Mực = InstancedMesh (2 draw call), đom đóm = 3 `Points` |
| 2 | 240 | 5.4 | `--disable-frame-rate-limit`: rAF chạy vượt GPU, khung "3 ms" rồi treo ~200 ms mỗi ~300 ms | Chỉ tắt vsync GPU, giữ bộ giới hạn khung (ghi trong README) |
| 3 | 81 | 8.8 | Đo bộ nhớ bằng WMI (`Get-CimInstance`) mỗi 2 s gây khựng | Lấy PID một lần, đọc RSS bằng `tasklist`/`ps` |
| 4 | 66–87 | 5–8 | (a) khung khởi động dài vắt qua mốc 3 s bị tính vào đo; (b) shader biên dịch khi vật thể lần đầu vào khung nhìn | (a) chỉ tính khung bắt đầu sau 3 s; (b) `renderer.compile()` trước khi chơi/bench — cũng hết giật khi chơi thật |
| 5 | 109 / 83 | 56 / 33 | Ngẫu nhiên GC: mỗi Bóng Mực tạo mảng mới mỗi tick khi tìm đèn gần nhất | Sắp xếp danh sách đèn một lần |
| Nộp | 136.4 | 62.9 | | |
