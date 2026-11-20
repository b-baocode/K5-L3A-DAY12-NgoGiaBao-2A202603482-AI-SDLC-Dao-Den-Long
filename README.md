# Đảo Đèn Lồng

> 🎬 **Video demo:** _(link sẽ thêm ở Phase 4 — Release `v1.0.0`)_

Game 3D góc nhìn thứ ba (Three.js), 3 Đêm: **Đảo Bến**, **Đảo Cau**, **Đảo Chuông**. Mây, người giữ đèn nhỏ tuổi đội nón lá, gom đom đóm để thắp lại các Đèn Lồng Lớn, né Bóng Mực và Gió Lạc trong sương đen. Bài lab cá nhân Day 12 AI SDLC — Ngô Gia Bảo, 2A202603482.

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
| Shift | Lướt (14 m/s trong 0.2 s, hồi 1.5 s) |
| Esc / P | Tạm dừng (Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu) |
| F3 | Hiện FPS |
| E | Nạp đom đóm vào đèn chưa sáng gần nhất (trong 2 m) |
| F hoặc chuột phải | Tỏa Sáng: tốn 3 đom đóm, choáng 2 s và đẩy lùi Bóng Mực trong 5 m |

## Luật và cách tính điểm (số chuẩn Ticket-02)
- Đom đóm tự nhặt khi đi qua (≤ 1 m), mang tối đa **10**. Mỗi đèn cần **10** (nạp nhiều lần được).
- Bóng Mực phát hiện trong 12 m, bỏ đuổi ngoài 18 m. Bị chạm: −1 Ngọn Lửa (có 3), rơi một nửa đom đóm (nhặt lại trong 8 s), bất tử 1.5 s. Bóng Mực không vào được vùng 6 m quanh đèn **đã sáng**.
- Rơi khỏi đảo: −1 Ngọn Lửa, mất hết đom đóm, hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2, 3) đuổi khi bạn mang ≥ 5 đom đóm, cướp 3 rồi bỏ chạy; Tỏa Sáng vào nó để lấy lại. **Bùa Gió** (lá bùa đỏ) cho chạy nhanh và Lướt không hồi chiêu trong 10 s.
- Thắng: thắp hết đèn của Đêm. Thua: hết Ngọn Lửa, hoặc hết giờ (300 / 330 / 360 s).

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm **nạp** vào đèn | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng | +5 |
| Khi thắng: mỗi giây còn lại | +2 |
| Khi thắng: mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm game = tổng điểm các Đêm đã thắng (hiện ở màn Bình Minh).

## Test, headless và bằng chứng
```bash
npm test                                   # 51 test: luật, Test Contract v1.1, phần sáng tạo
npm run proof -- phase-2                   # chạy 14 scenario 2 lần, ghi docs/proof/phase-2/
node src/headless.js --seed 1 --night 2 --ticks 600 --out out.jsonl \
  [--scenario scenarios/win.scenario.json] [--inputs scenarios/win.inputs.json] [--snapshot-every 10]
```
- Test Contract v1.1: [`game.contract.json`](game.contract.json), `--night 1|2|3`. Mã thoát: 0 ok, 2 file inputs/scenario sai định dạng, 1 lỗi khác.
- `tuning` trong contract là **số game thật sự dùng** — game đọc trực tiếp từ file này. Từ Phase 2 tuning là **số chuẩn** của Ticket-02 (`fall_enabled: true`, có Lướt).
- Giả định, tiêu chí nghiệm thu, bảng yêu cầu → bằng chứng: [Phase 1](docs/notes/phase-1.md) · [Phase 2](docs/notes/phase-2.md). Proof: [phase-1](docs/proof/phase-1/SUMMARY.md) · [phase-2](docs/proof/phase-2/SUMMARY.md).

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
