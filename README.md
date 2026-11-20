# Đảo Đèn Lồng

> 🎬 **Video demo:** _(link sẽ thêm ở Phase 4 — Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js). Mây, người giữ đèn nhỏ tuổi đội nón lá, gom đom đóm để thắp lại 5 Đèn Lồng Lớn và né Bóng Mực trong sương đen. Bài lab cá nhân Day 12 AI SDLC — Ngô Gia Bảo, 2A202603482.

## Cài đặt và chạy (Node ≥ 20, macOS / Linux / Windows)
```bash
git clone https://github.com/b-baocode/K5-L3A-DAY12-NgoGiaBao-2A202603482-AI-SDLC-Dao-Den-Long.git && cd K5-L3A-DAY12-NgoGiaBao-2A202603482-AI-SDLC-Dao-Den-Long
npm install
npm start          # mở http://localhost:5173
```

## Điều khiển
| Phím | Hành động |
|---|---|
| W A S D / mũi tên | Di chuyển (theo hướng camera) |
| Kéo chuột trái, Q / C | Xoay camera |
| Space | Nhảy |
| E | Nạp đom đóm vào đèn gần nhất (trong 2.5 m) |
| F hoặc chuột phải | Tỏa sáng: tốn 1 đom đóm, làm choáng + đẩy Bóng Mực trong 6 m |
| R | Chơi lại |

## Luật và cách tính điểm
- Đom đóm tự nhặt khi đi qua (≤ 1 m), mang tối đa **5**. Mỗi đèn cần **5** đom đóm.
- Bóng Mực chạm vào: mất 1 **lửa** (có 3), rơi một nửa đom đóm đang mang, bất tử 1.5 s. Bóng Mực không vào được vùng 4 m quanh đèn **đã thắp**.
- Thắng: thắp cả 5 đèn. Thua: hết lửa, hoặc hết 5 phút (trời sáng).

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực bị choáng bởi tỏa sáng | +20 |
| Khi thắng: mỗi giây còn lại | +1 |
| Khi thắng: mỗi lửa còn lại | +50 |

## Test, headless và bằng chứng
```bash
npm test                                   # 33 test: luật game, Test Contract, phần sáng tạo
npm run proof -- phase-1                   # chạy scenario 2 lần, ghi docs/proof/phase-1/
node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenarios/win.scenario.json] [--inputs scenarios/win.inputs.json] [--snapshot-every 10]
```
- Test Contract v1.0: [`game.contract.json`](game.contract.json). Mã thoát: 0 ok, 2 file inputs/scenario sai định dạng, 1 lỗi khác.
- `tuning` trong contract là **số game thật sự dùng** — game đọc trực tiếp từ file này. `fall_enabled: false` vì đảo có mép chặn, không thể rơi (không có `player_hit` `by: "fall"`). Không có `dash`.
- Giả định và bảng yêu cầu → bằng chứng: [docs/notes/phase-1.md](docs/notes/phase-1.md). Kết quả proof: [docs/proof/phase-1/SUMMARY.md](docs/proof/phase-1/SUMMARY.md).

## Cấu trúc
```
game.contract.json   Test Contract (tuning = nguồn số duy nhất)
src/sim/             luật game thuần JS, tất định (dùng chung cho web + headless)
src/headless.js      CLI theo contract
src/web/             Three.js renderer, HUD, điều khiển
tests/  scenarios/   node:test + scenario/inputs mẫu
scripts/proof.js     sinh bằng chứng
docs/notes/          giả định, nhật ký AI, retro · docs/proof/  bằng chứng từng phase
AGENTS.md CLAUDE.md .claude/   harness AI (hook chặn kết thúc khi test đỏ, skill verify)
```

## Sáng tạo của tôi
Chỉ bật trong game web (`new Game(..., { extras: true })`); **headless không bao giờ bật** nên output theo Test Contract không đổi.

| Thêm gì | Chi tiết |
|---|---|
| 🟠 **Đom đóm Vàng Kim** (15%) | To, nhấp nháy; nhặt được tính **2** ánh sáng và **gấp đôi điểm** |
| 🩵 **Đom đóm Ngọc Lam** (7%) | **Hồi 1 lửa** (tối đa 3); nhặt được kể cả khi đang mang đầy |
| 🟣 **Mực Lướt** (25% Bóng Mực mới) | Nhỏ, xoay nhanh, **nhanh ×1.6**, tầm chạm ×0.8 |
| ⚫ **Mực Khổng Lồ** (20%) | To, **chậm ×0.65** nhưng **tầm chạm ×1.7** |
| ✨ Ánh sáng bay vào đèn | Khi nạp, đốm sáng bay theo vòng cung từ đèn trên nón Mây vào Đèn Lồng Lớn; đèn thắp thì bừng sáng |
| 😨 Bóng Mực sợ đèn | Lại gần vùng sáng của đèn đã thắp thì Bóng Mực run và co nhỏ lại (chỉ hiển thị) |
| 🔊 Âm thanh | Tự tổng hợp bằng Web Audio (không file ngoài): nhặt, nạp, thắp đèn, tỏa sáng, bị chạm, Bóng Mực xuất hiện, thắng/thua |
| 📜 Lời kể | Mở đầu, một câu sau mỗi đèn được thắp, gợi ý khi gặp loại đom đóm/Bóng Mực mới |

**Bằng chứng phần cũ vẫn đúng:**
- Hash SHA-256 của toàn bộ output headless trước và sau khi thêm code giống hệt nhau: [extras-headless-unchanged.txt](docs/proof/phase-1/extras-headless-unchanged.txt).
- Test chặn: `src/headless.js` không được nhắc tới `extras`; khi `extras` tắt chỉ có loại thường và event không có trường thừa ([tests/extras.test.js](tests/extras.test.js)).
- Luật của từng loại mới có test riêng; ảnh: [nạp đèn](docs/proof/phase-1/extras-deposit-sparks.png), [đèn sáng](docs/proof/phase-1/extras-lantern-lit.png).

## Harness AI
- `AGENTS.md`: lệnh, bố cục, quy tắc cho agent. `CLAUDE.md` nạp AGENTS.md.
- Stop hook `.claude/hooks/require-green.js`: agent không được kết thúc khi `npm test` đỏ.
- Skill `.claude/skills/verify`: quy trình chạy headless và sinh bằng chứng.
- CI `.github/workflows/ci.yml`: test + proof + build trên Ubuntu và macOS mỗi lần push.
