# Phase 2 — Ticket-02 "Ba hòn đảo" · Contract v1.1

## Quyết định thiết kế
- **Số chuẩn thay toàn bộ số tự chọn** của Phase 1. Tuning vẫn chỉ nằm trong `game.contract.json`.
- **Bản đồ là dữ liệu** (`src/sim/maps.js`). Mỗi Đêm khai báo: hàm độ cao mặt đất `ground(x, z)`, vật cản, đèn, điểm sinh đom đóm và Bóng Mực, bục nhảy, bùa, gió. Logic chung dùng cho cả 3 Đêm.
- **Địa hình theo độ cao:** đi vào ô có mặt đất cao hơn chân quá 0.35 m thì bị chặn (vách), có trượt theo trục. Mặt đất thấp hơn thì rơi. Không có mặt đất thì rơi tới Y < −10.
- **Thứ tự 12 bước trong một tick** theo đúng ticket (`Game.step`, có chú thích số bước).
- **Pause nằm trong sim:** `tick` vẫn tăng, `sim_tick` và mọi bộ đếm đứng yên. Bản web dừng hẳn vòng lặp khi mở menu tạm dừng.

## Giả định (chỗ ticket chưa nói rõ, cần xác nhận với trợ giảng)
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A21 | Đêm 3: tâm (0,0,0) là tháp chuông trên tầng 2 | Xuất phát tại **(0,0,−30)**, quay mặt +Z |
| A22 | Trạng thái `spawning` dài bao lâu | **60 tick**. Không di chuyển, không gây hit, không bị Tỏa Sáng |
| A23 | `player.invuln` trong snapshot | **boolean** (đang bất tử hay không) |
| A24 | `night_start` ghi lúc nào | **tick 0**, ngay sau snapshot tick 0 (headless) |
| A25 | Bóng Mực `wander` | Lượn 1.5 m/s tới điểm ngẫu nhiên cách 2–8 m. Phát hiện (≤ 12 m) chỉ khi Mây không đang chờ hồi sinh |
| A26 | Hết `recoil`/`stunned`/`spawning` | Trong 12 m → `chase`, ngoài 12 m → `wander` |
| A27 | Bóng Mực theo địa hình | Tâm luôn cao hơn mặt đất 1 m (bay qua vách). Bị tháp chuông và vùng an toàn chặn |
| A28 | Gió Lạc `idle` | Lượn vòng tròn bán kính 3 m với 2 m/s. Cao 1.5 m trên mặt đất. Sinh trên điểm sinh Bóng Mực ("điểm sương") |
| A29 | Gió mạnh | Bắt đầu ở các tick 1800k (k ≥ 1), kéo dài 300 tick, hướng ngẫu nhiên theo seed |
| A30 | `kind` đom đóm trong snapshot | `random` (điểm sinh, scenario) / `dropped` (rơi khi bị đánh, Gió Lạc thả). `ttl_s` = `null` với `random` |
| A31 | Bục nhảy kích hoạt | Khi Mây **đứng** trên bục (chạm đất, XZ ≤ 1 m). Hướng ngang = từ bục tới tâm đảo kia (Đêm 2) / −Z (Đêm 3) |
| A32 | Tương tác đèn | Khoảng cách XZ ≤ 2 m (theo quy ước contract), không xét độ cao |
| A33 | Rơi xuống bao lâu thì "rơi khỏi đảo" | Đúng như ticket: Y < −10. Trong 60 tick chờ, Mây vô hình, không nhặt, không bị chạm |

## Tiêu chí nghiệm thu, Phần 3 (và các luật mới ở Phần 1, 2)
| Tính năng | Tiêu chí nghiệm thu (làm A thì thấy B) | Kiểm chứng | Kết quả |
|---|---|---|---|
| **Lướt** | Nhấn dash (cạnh false→true) → 14 m/s trong 12 tick theo hướng di chuyển, đứng yên thì theo hướng mặt. Hồi chiêu 90 tick tính từ lúc bắt đầu. Trên không giữ độ cao. Event `dash {}` | sim.test "dash…", proof `dash` | Đạt |
| **Gió Lạc** | Sinh tick 1200k ở Đêm 2/3, tối đa 2. Mang ≥ 5 và ≤ 15 m → `chase` (7 m/s). Chạm ≤ 1.2 m → cướp min(3, mang), `flee` 240 tick → `removed`. Tỏa Sáng lúc chase → flee không cướp. Lúc flee có đồ → thả hết thành đom đóm rơi, 120 tick sau biến mất. Không mất lửa | sim.test "drifter…" (3 test), proof `drifter` | Đạt |
| **Bùa Gió** | Nhặt như đom đóm → `charm_picked`, 600 tick: chạy 7.2 m/s, Lướt không hồi chiêu (vẫn phải nhấn lại). Xuất hiện lại sau 2700 tick | sim.test "charm…", proof `charm` | Đạt |
| **Chuỗi 3 Đêm** | Menu → giới thiệu Đêm (tên đảo, lời Ông Đăng) → chơi → kết quả → Đêm kế. Thua → chơi lại Đêm đó. Thắng Đêm 3 → Bình Minh với tổng điểm các Đêm đã thắng | Chạy thật trong Edge: `p2-menu.png`, `p2-intro.png` | Đạt (ảnh menu, intro; màn kết quả/Bình Minh kiểm tra bằng tay) |
| **Tạm dừng** | Esc/P → logic dừng hoàn toàn, menu Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. Headless: `tick` tăng, `sim_tick` đứng, `state: "paused"`, event `paused`/`resumed` | sim.test "pause…", headless.test "pause via inputs", proof `pause`, `p2-pause.png` | Đạt |
| **Cài đặt** | Âm lượng và độ nhạy chuột lưu vào `localStorage`, còn sau khi mở lại | Kiểm tra bằng tay | Đạt (chưa có test tự động) |
| **Âm thanh** | Nhạc nền đêm và hiệu ứng: nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối (cùng gió, cướp, bùa) | Web Audio tự tổng hợp (`audio` trong `src/web/main.js`) | Đạt (kiểm tra bằng tai) |
| **HUD đầy đủ** | Lửa (trên trái), mm:ss (trên giữa, đỏ và nhấp nháy ≤ 30 s), đèn k/n và điểm (trên phải), 10 ô đom đóm (dưới giữa), hồi chiêu Lướt/Tỏa (dưới phải), "E — Nạp ánh sáng (x/10)" gần đèn, mũi tên tới đèn chưa sáng gần nhất khi ở ngoài màn hình | `p2-night*.png` | Đạt |
| **Bảng màu** | Dùng đúng hex của ticket cho các thành phần liệt kê (`C` trong `src/web/main.js`) | Đọc code | Đạt |
| **Ánh sáng môi trường** | Cường độ = 0.15 + 0.55 × (đèn sáng / tổng) | `ambient.intensity` trong `draw()` | Đạt |
| **3 bản đồ** | Đúng toạ độ đèn, điểm sinh, cầu, bục, tầng, dốc, tháp | sim.test "maps…", "night 2…", "night 3…", proof `jump_pad`, `tiers_wind` | Đạt |
| **Rơi khỏi đảo** | Y < −10: −1 lửa, mất hết đom đóm (`lost`), chờ 60 tick, hồi sinh tại điểm xuất phát, bất tử 90. Hết lửa thì thua ngay | sim.test "fall…" (2 test), proof `fall` | Đạt |
| **Contract v1.1** | Trường snapshot/scenario/input/event mới, `--night 1..3`, tên trạng thái Bóng Mực, sai định dạng → exit 2 | headless.test (13 test) | Đạt |
| **Hiệu năng headless** | 21.600 tick ≤ 30 s | headless.test "performance", đo: 0.14–0.25 s mỗi Đêm | Đạt |
| **≥ 30 FPS @1280×720** | FPS trung bình đo trong trình duyệt | Edge headless **render bằng CPU (SwiftShader)**: Đêm 1/2/3 = 31/38/30 FPS. Máy có GPU sẽ cao hơn | Đạt (đo trên renderer phần mềm) |

## Thay đổi test cũ (luật mới thay luật cũ)
| Test Phase 1 | Thay đổi | Lý do (Ticket-02) |
|---|---|---|
| tuning / contract fields | Số mới, `contract_version` 1.1, thêm 5 khóa | Phần 1 và Phần 4 |
| "island edge: no falling" | **Bỏ** → thay bằng "fall…" | Ngoài 40 m là biển mây (rơi) |
| "pickup… score per_mote" | Nhặt **không** cộng điểm; +10 mỗi đom đóm **nạp** | Điểm chuẩn hóa |
| "deposit…", "win…" | Chi phí 10, thưởng ×2 giây còn lại | Số chuẩn |
| "pulse…" | 3 đom đóm, 5 m (3D từ chân + 0.8), +5/con, choáng 120 tick, đẩy 4 m trong 15 tick | Số chuẩn |
| "shade…" | Thêm wander/chase 12/18 m, recoil, rơi đom đóm ra vành 1.5–2.5 m có TTL | Số chuẩn |
| "safe_radius" | 4 m → 6 m, thêm đẩy ra khi đèn vừa thắp | Số chuẩn |
| "random world" | 30 → 20 đom đóm, Bóng Mực từ tick 300 theo lịch | Số chuẩn |
| headless "tick model" | Scenario mang 3 thay vì 2 để Tỏa Sáng được | Chi phí Tỏa Sáng 3 |
| headless "scenario setup emits no events" | Chỉ có `night_start` | Event mới v1.1 |
| scenario `pickup_deposit`, `win`, `shade_hit_pulse`, `lit_lanterns` | Chỉnh theo chi phí 10, vùng an toàn 6, Bóng Mực nhanh hơn | Số chuẩn |

Bằng chứng Phase 1 trong `docs/proof/phase-1/` giữ nguyên (khớp tag `phase-1`).

## Đánh giá nhanh
- 51 test (32 luật, 13 contract, 6 sáng tạo), 14 scenario proof đều PASS và tất định.
- **Mutation check:** đổi số cướp của Gió Lạc 3 → 2 thì test đỏ. Đổi tâm Tỏa Sáng (chân + 0.8 → chân) thì **ban đầu test vẫn xanh**. Đã thêm Bóng Mực ở đúng ranh giới để test bắt được.
- **Lỗi khi viết test** (không phải lỗi game): helper `press` không nhả nút giữa hai lần bấm, lệch 1 tick ở hồi chiêu và TTL. Ghi lại để không lặp lại: một lần bấm mới cần ít nhất một tick nhả nút.
- Scenario `shade_hit_pulse` FAIL sau khi chuẩn hóa vì Bóng Mực nhanh hơn, đánh trúng trước khi Tỏa Sáng. Lỗi nằm ở scenario, game đúng luật.
