# Phase 3 — Ticket-03 "Đèn cạn dầu" · Contract v1.2

Quyết định thiết kế và giả định A41–A45: [ADR 0001](../adr/0001-lantern-fuel-and-dawn-win.md). Thay đổi phá vỡ tương thích: [CHANGELOG](../../CHANGELOG.md).

## Tiêu chí nghiệm thu → bằng chứng
| Yêu cầu | Tiêu chí | Kiểm chứng | Kết quả |
|---|---|---|---|
| Nhiên liệu | Thắp → fuel 100; hao 1/s; fuel ≤ 0 → tắt, `deposited 0`, `lantern_out`, `ever_lit` giữ | fuel.test "lighting sets fuel…", proof `relight` | Đạt |
| Thắp lại | Đèn từng sáng cần 5, +40, `relight: true`, `relit_count`++ | fuel.test "relight…", proof `relight` | Đạt |
| Châm dầu | `used = min(mang, ceil((100−fuel)/10))`, +10 fuel mỗi con, +5 điểm mỗi con; đèn đầy không được chọn | fuel.test "refuel…", proof `refuel`, `win` | Đạt |
| Vùng an toàn theo dầu | fuel < 30 mất vùng; đúng 30 vẫn còn | fuel.test "low fuel…" | Đạt |
| Bóng Mực hút dầu | wander → đèn yếu gần nhất → ≤ 2 m `drain`, 5/s cộng dồn + hao 1/s, `fuel_drain` mỗi 60 tick | fuel.test "wander shade goes…", proof `drain` | Đạt |
| Rời `drain` | ≤ 6 m → chase; Tỏa Sáng → stunned (+15); châm ≥ 30 → wander + đẩy ra không sát thương | fuel.test "drain -> …", "refuelling a weak lantern…" | Đạt |
| Hết choáng → wander | | fuel.test "stun ends -> wander" | Đạt |
| Luật thắng mới | Không thắng sớm; bình minh: sống và ≥ 3/5, 4/6, 5/7 → `dawn_survived`; thiếu → `dawn`; `no_flames` xét trước | fuel.test "dawn…", "win thresholds", "no_flames beats dawn", sim.test "all lit no longer ends the night", proof `win`, `dawn_win`, `dawn_lose` | Đạt |
| Điểm mới | Bảng điểm Ticket-03 | fuel.test (điểm trong từng test), proof `dawn_win` (445 = 3×50 + 95 + 55 + 45 + 2×50) | Đạt |
| Sức chứa | 10 + 2 × lần thắp thành công, tối đa 20; scenario không tính | fuel.test "capacity…", ảnh `p3-fuel.png` (7 / 14) | Đạt |
| Contract v1.2 | Khóa tuning, trường snapshot/scenario, sự kiện mới, thời gian Đêm | headless.test (contract, `--night`, output format), validate.js | Đạt |
| Hiển thị dầu | Thanh dầu, nhấp nháy 1 Hz khi < 30, đèn tắt xẹp 20% + rách | `src/web/main.js`, ảnh `p3-fuel.png` | Đạt (nhấp nháy kiểm tra bằng mắt) |
| Mù màu | Viền Bóng Mực `#00B3FF`, cảnh báo trắng + ⚠, được lưu | ảnh `p3-fuel-colorblind.png`, localStorage | Đạt |

## Test cũ bị thay (cập nhật hoặc xóa có lý do)
| Test | Thay đổi | Lý do |
|---|---|---|
| sim "tuning matches…" | Thời gian 240/270/300, khóa dầu, bảng điểm mới | Ticket-03 §3, §5, §7 |
| sim "win: all lit -> won/all_lit…" | **Xóa**, thay bằng "all lit no longer ends the night" | §3 [THAY THẾ] thắng sớm |
| sim "dawn… win on the last tick still wins" | Bỏ nửa sau (thắng bằng thắp đèn cuối) | §3 [THAY THẾ] |
| sim "lantern: … +10 per mote" | +5 mỗi đom đóm | §5 [THAY THẾ] điểm |
| headless "contract file", "--night", "output format" | v1.2, khóa mới, thời gian mới, trường đèn/player mới | §7 |
| proof `pickup_deposit` | Điểm 200 → 150 | §5 |
| proof `win` | Đổi ý nghĩa: chứng minh **không** thắng sớm, và đèn sáng chưa đầy nhận châm dầu | §1, §3 |

Không có test nào bị skip. 63 test, 19 scenario proof đều PASS.

## Đánh giá nhanh
- **Lỗi khi viết test/kỳ vọng** (game đúng ticket): quên dầu đã hao trước khi châm (6 chứ không phải 5); đặt Mây cách Bóng Mực 5.9 m (đã < 6 m); không lường trước "đèn vừa thắp hao 1/60 nên vẫn nhận châm dầu". Cả 3 đều bị phát hiện vì test/proof đỏ, sửa kỳ vọng sau khi đối chiếu câu chữ ticket.
- **FPS** khi có Bóng Mực hút (nhiều hạt sáng): 24–27 trên renderer phần mềm (SwiftShader), thấp hơn Phase 2 (30–38). Cần tối ưu hạt (dùng chung material) ở Phase 4 và đo lại trên GPU thật.
- `visual-style-brief.md` (bloom, cỏ, trời sao) **chưa làm**: không thuộc Ticket-03, để Phase 4.
