# Changelog

## [v1.0.0 / phase-4] — Ticket-04 "Bình minh: phát hành v1.0.0", Test Contract v1.3

### ⚠ Breaking changes
- **Contract 1.2 → 1.3:** thêm `bench_cmd` (`node scripts/bench.js`) và `soak_cmd` (`node --expose-gc scripts/soak.js`).
- **`run_cmd`** đổi từ `npm start` (vite dev) sang `node scripts/run.js` (server tĩnh + API bảng xếp hạng, tự build lần đầu; nhận `--export-leaderboard`). `build_cmd` = `npm install && npm run build`.
- Sim nhận tùy chọn `bench` (mặc định tắt; headless không đổi — 19 scenario giống từng byte phase-3).

### Added
- Benchmark cảnh chuẩn (200 Bóng Mực, 100 đom đóm, camera bay vòng) → `bench.json`. Soak 10 Đêm → `soak.json`.
- Bảng xếp hạng top 10 lưu đĩa (`data/leaderboard.json`), nhập tên sau Bình Minh hoặc khi thua, màn hình từ menu, xuất JSON.
- Dễ tiếp cận: đổi phím 9 hành động (báo trùng, khôi phục mặc định), phụ đề/chỉ báo (Bóng Mực xuất hiện + mũi tên mép màn hình, gió sắp thổi, 10 s cuối, đèn sắp cạn), giảm chuyển động, chữ ≥ 18 px và tùy chọn ×1.25.
- Retro, ghi chú Phase 4, BENCH.md.

### Fixed / performance
- Bóng Mực vẽ bằng InstancedMesh, đom đóm bằng Points (~850 → ~45 draw call trong bench). Biên dịch shader trước khi chơi (hết giật khi camera quay). Không cấp phát mảng mỗi tick khi tìm đèn gần nhất.
- Ô nhập tên không còn bị phím game "nuốt" chữ.

## [Unreleased → v1.0.0] — làm đẹp đồ họa (giữa Phase 3 và 4)
- Phong cách low-poly theo brief: trời gradient + sao lấp lánh, biển mây gợn, đảo có mặt dưới bằng đá, đá tinh thể, cây low-poly, cỏ InstancedMesh lay theo gió (mạnh hơn khi Gió mạnh Đêm 3).
- Đom đóm và hạt sáng dạng sprite phát sáng (additive), Bóng Mực có viền fresnel phát sáng và mắt.
- Hậu kỳ: bloom (½ độ phân giải) + vignette, bật/tắt trong Cài đặt, tự tắt nếu FPS < 28 trong 4 s.
- Menu/giới thiệu/Bình Minh: camera lượn chậm quanh đảo. HUD và menu thiết kế lại (khung kính mờ, nút nổi bật).
- Hiệu năng: vật liệu Lambert dùng chung theo màu, hạt sáng dùng chung material, pixel ratio tối đa 1.25.
- Không đổi logic/headless: 63 test và proof giữ nguyên.

## [phase-3] — Ticket-03 "Đèn cạn dầu", Test Contract v1.2

### ⚠ Breaking changes
- **Contract 1.1 → 1.2.** `tuning` thêm `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`.
- **Thời gian Đêm** 300/330/360 s → **240/270/300 s**.
- **Luật thắng:** bỏ thắng sớm khi thắp hết đèn (`game_over.reason = "all_lit"` không còn dùng). Thắng = còn sống lúc bình minh và ≥ `ceil(0.6 × tổng)` đèn đang sáng → `dawn_survived`. Thua lúc bình minh thiếu đèn → `dawn`.
- **Đèn có thể tắt:** dầu 100, hao 1/s. Hết dầu → `lit: false`, `deposited: 0`, sự kiện `lantern_out`. Đèn đã sáng nhận thêm đom đóm để châm dầu (trước đây không nhận).
- **Vùng an toàn** chỉ còn ở đèn có `fuel ≥ 30` (trước đây mọi đèn sáng).
- **Bóng Mực:** thêm trạng thái `drain`. Hết choáng luôn về `wander` (trước đây `chase` nếu Mây trong 12 m).
- **Điểm:** thay toàn bộ. +5 mỗi đom đóm nạp (cũ +10), thắp lần đầu +100, thắp lại +40, Tỏa Sáng +5 (+15 nếu Bóng Mực đang `drain`), bình minh +50 + floor(fuel) mỗi đèn sáng, +50 mỗi Ngọn Lửa. Bỏ thưởng thời gian.
- **Sức chứa** không cố định 10 nữa: `10 + 2 × số lần thắp thành công`, tối đa 20.
- **Snapshot:** đèn thêm `fuel`, `ever_lit`, `relit_count`; `player` thêm `capacity`.
- **Scenario:** đèn nhận `fuel`, `ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`; đèn `lit: true` không có `fuel` → 100.
- **Sự kiện mới:** `refuel`, `lantern_out`, `fuel_drain`. `lantern_lit` thêm `relight`.

### Added
- Chế độ **"Bảng màu dễ phân biệt"** (lưu trong Cài đặt): viền Bóng Mực `#00B3FF`, cảnh báo UI màu trắng kèm ⚠.
- Thanh dầu trên đèn sáng, nhấp nháy 1 Hz khi dầu < 30. Đèn tắt xẹp 20% và có vết rách. Hạt sáng chảy từ đèn vào Bóng Mực đang hút.
- HUD: `đang mang / sức chứa`, số đèn cần giữ tới bình minh, lời nhắc "E — Châm dầu (x/100)".
- ADR `docs/adr/0001-lantern-fuel-and-dawn-win.md`.

## [phase-2] — Ticket-02 "Ba hòn đảo", Test Contract v1.1
- Số liệu chuẩn, 3 bản đồ chuẩn, Lướt, Gió Lạc, Bùa Gió, rơi khỏi đảo, tạm dừng, chuỗi 3 Đêm, cài đặt, HUD đầy đủ, âm thanh.

## [phase-1] — PRD-0, Test Contract v1.0
- Đêm 1 chơi được, chế độ headless, sáng tạo (đom đóm/Bóng Mực đặc biệt, hiệu ứng, âm thanh).
