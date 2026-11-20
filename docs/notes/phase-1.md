# Phase 1 — PRD-0 + Test Contract v1.0

## Thiết kế chính (1 dòng lý do mỗi quyết định)
- **Three.js + Vite (web)**, logic thuần JS trong `src/sim/`: chạy được trên macOS/Linux/Windows chỉ cần Node; giảng viên không cần Docker.
- **`game.contract.json` là nguồn duy nhất của tuning**: game web và headless đều đọc từ file này → không thể khai lệch số.
- **Tick cố định 60 Hz, bộ đếm theo tick nguyên** (invuln/stun/cooldown = `round(s*60)` tick) → tất định, không trôi số thực.
- **PRNG mulberry32 theo `--seed`**, không dùng `Math.random`/thời gian trong `src/sim`.

## Giả định (chỗ PRD-0 chưa quy định)
| # | Chỗ mơ hồ | Giả định của tôi |
|---|---|---|
| A1 | "Máu" là gì | `flames` = số lần chịu đòn (3). Hết `flames` → `lost/no_flames`. |
| A2 | "Tỏa sáng tốn ánh sáng" | Tốn `pulse_cost` = 1 đom đóm đang mang. Mang ít hơn `pulse_cost` hoặc đang hồi chiêu → không tỏa sáng, không có event. |
| A3 | Nhặt đom đóm | Tự động khi trong `pickup_radius` (≤ 1 m), tới khi đủ `carry_capacity` (5). Mỗi con +`per_mote`. |
| A4 | Nạp đèn | Nhấn `interact` trong `interact_radius` (2.5 m) của đèn **chưa thắp gần nhất**; nạp `min(đang mang, lantern_cost − đã nạp)`. Đủ `lantern_cost` (5) → thắp, +`per_lantern`. |
| A5 | Thắng | Thắp đủ 5 đèn → `won/all_lit`, cộng thưởng `per_second_left × floor(thời gian còn)` + `per_flame_left × flames`. |
| A6 | Thua theo giờ | Đêm dài `night1_duration_s` = 300 s; hết giờ → `lost/dawn`. |
| A7 | Bóng Mực | Đuổi thẳng theo người chơi trên mặt phẳng XZ với `shade_speed` 3.5 m/s (chậm hơn người chơi 6 m/s). Chạm (≤ `shade_hit_radius`) → −1 flame, rơi `floor(carried × 0.5)` đom đóm xuống vòng bán kính 2.5 m quanh người chơi, bất tử `invuln_s` 1.5 s. Bóng Mực bị choáng không gây sát thương. |
| A8 | "Bóng Mực sợ đèn" | Bóng Mực không vào được bán kính `safe_radius` (4 m) quanh **đèn đã thắp** (đèn chưa thắp không bảo vệ). Bị đẩy ra ngay ngoài biên. |
| A9 | Pulse | Mọi Bóng Mực trong `pulse_radius` (6 m) bị choáng `pulse_stun_s` 3 s và bị đẩy ra xa `pulse_push_m` 4 m; +`per_stun` mỗi con. Hồi chiêu 1 s. Event `pulse` vẫn ghi khi không trúng con nào (`stunned_ids: []`). |
| A10 | Rơi khỏi đảo | Không có: đảo tròn bán kính 40 m, người chơi bị chặn ở mép → `fall_enabled: false`, không bao giờ có `player_hit` `by: "fall"`. |
| A11 | Sinh ngẫu nhiên | 30 đom đóm; nhặt con nào sinh con mới thay thế. 2 Bóng Mực lúc đầu (cách người chơi ≥ 18 m), thêm 1 con mỗi 30 s (tối đa 6) kèm `shade_spawned`. |
| A12 | Vị trí đèn mặc định | Vòng tròn bán kính 25 m, L1 tại (0,0,25), mỗi đèn cách 72°. |
| A13 | Scenario | `lit: true` không kèm `deposited` → `deposited = lantern_cost`. `motes`/`shades` không có `id` được cấp `M1…`/`S1…` theo thứ tự (bỏ qua id đã dùng). |
| A14 | Lỗi định dạng | JSON hỏng, sai kiểu, `tick` không tăng nghiêm ngặt, id đèn lạ, không đọc được file → mã thoát 2. Sai tham số CLI → mã 1. `move` ngoài [−1,1] được kẹp lại (không coi là lỗi). |
| A15 | Thứ tự trong 1 bước | timers → di chuyển/nhảy → nhặt → nạp đèn (có thể thắng) → pulse → Bóng Mực di chuyển → va chạm → sinh Bóng Mực → thời gian. |
| A16 | Nhảy | Có nhảy (hiển thị, trục Y) nhưng mọi khoảng cách đo theo XZ nên nhảy **không** né được Bóng Mực. |
| A17 | `dash` | Không có trong Phase 1 (bỏ qua). |

## Tiêu chí nghiệm thu → bằng chứng
| Yêu cầu | Kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` đủ trường | `tests/headless.test.js` "contract file" | `npm test` | Đạt |
| Tham số CLI, snapshot mặc định 10, end line | headless.test "output format", "default snapshot-every" | `npm test` | Đạt |
| Mô hình tick (k → k+1, tick 0 trước input) | headless.test "tick model" | `npm test` | Đạt |
| Dừng khi game kết thúc, `end.ticks` | headless.test "game over stops the run early" | `npm test` | Đạt |
| Tất định | headless.test "determinism"; proof chạy 2 lần mỗi scenario | [SUMMARY](../proof/phase-1/SUMMARY.md) cột Deterministic | Đạt |
| Sai định dạng → exit 2 | headless.test "bad inputs / scenario" | `npm test` | Đạt |
| Di chuyển theo camera, chuẩn hóa | sim.test "movement" | `npm test` | Đạt |
| Nhặt đom đóm, sức chứa | sim.test "pickup"; proof `pickup_deposit` | SUMMARY | Đạt |
| Nạp/thắp đèn | sim.test "deposit"; proof `pickup_deposit` | SUMMARY | Đạt |
| Thắng / điểm thưởng | sim.test "win"; proof `win` (719 = 5×100 + 119 + 2×50) | SUMMARY | Đạt |
| Bóng Mực đuổi, gây sát thương, bất tử | sim.test "shade"; proof `shade_hit_pulse` | SUMMARY | Đạt |
| Tỏa sáng xua Bóng Mực | sim.test "pulse"; proof `shade_hit_pulse` | SUMMARY | Đạt |
| Bóng Mực sợ đèn | sim.test "safe_radius"; proof `lit_lanterns` | SUMMARY | Đạt |
| Thua (hết lửa / hết giờ) | sim.test "lose" | `npm test` | Đạt |
| Game 3D chơi được, HUD, camera, chơi lại (R) | Chạy thật trong Edge (puppeteer): nhấn W → nhặt đom đóm, HUD cập nhật | [screenshot-play.png](../proof/phase-1/screenshot-play.png) | Đạt |
| Đảo sáng dần khi thắp đèn | Ánh sáng nền và sương đổi theo số đèn đã thắp (`src/web/main.js`) | Kiểm tra bằng mắt | Đạt (chưa có ảnh riêng) |

## Đánh giá nhanh
- Đạt toàn bộ yêu cầu Phase 1 ở trên. 27 test, 6 scenario proof.
- **Lỗi AI phát hiện khi kiểm chứng:** (1) renderer không gọi `renderer.render()` → canvas trong suốt; HUD vẫn chạy nên nhìn qua tưởng ổn. Phát hiện nhờ chụp ảnh và đọc pixel canvas. (2) scenario `lit_lanterns` đặt người chơi xa đèn → proof FAIL; lỗi ở scenario, không phải ở game.
- **Harness chỉnh:** thêm bước "chụp ảnh thật" vào quy trình kiểm chứng; test kiểm tra lại bằng cách cố ý làm hỏng code (mutation check) để chắc test không luôn đạt.

## Sáng tạo (extras)
- Người dùng muốn thêm loại đom đóm và Bóng Mực mới. Đây là thay đổi **luật**, nên không thể chỉ nằm ở renderer. Cách làm: luật mới nằm trong `src/sim` sau cờ `extras` (mặc định tắt). Khi tắt, code không rút thêm số ngẫu nhiên nào → chuỗi RNG và output headless giữ nguyên.
- Kiểm chứng: lưu SHA-256 của 6 file proof **trước** khi viết code, so lại **sau** → giống hệt ([extras-headless-unchanged.txt](../proof/phase-1/extras-headless-unchanged.txt)). Thêm 6 test trong `tests/extras.test.js`.
- Lỗi phát hiện khi chạy thật: đom đóm rơi ra (khi bị chạm) và đom đóm của scenario không có `kind` → renderer crash. Sửa ở sim (mọi đom đóm có `kind`), không đổi output headless (kind không nằm trong snapshot).
