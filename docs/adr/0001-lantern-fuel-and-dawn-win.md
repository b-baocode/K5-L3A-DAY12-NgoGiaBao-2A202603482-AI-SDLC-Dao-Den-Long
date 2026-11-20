# ADR 0001: Đèn có nhiên liệu, thắng khi sống tới bình minh

- **Trạng thái:** Chấp nhận (Phase 3, Ticket-03, Contract v1.2)
- **Thay thế:** luật Phase 1–2 "đèn đã sáng thì sáng mãi", "thắng ngay khi thắp hết đèn", "Bóng Mực không bao giờ vào vùng an toàn"

## Bối cảnh
Ticket-03 đổi mục tiêu game từ "thắp hết đèn" sang "giữ đảo sáng tới bình minh". Đèn có dầu, dầu hao theo thời gian và bị Bóng Mực hút. Đèn hết dầu thì tắt và phải thắp lại.

## Quyết định
### 1. Mô hình trạng thái đèn
Trước đây đèn có 2 trạng thái: chưa sáng → sáng (vĩnh viễn). Nay là một vòng:

```
chưa từng sáng ──(nạp 10)──▶ SÁNG ──(fuel ≤ 0)──▶ TẮT (ever_lit) ──(nạp 5)──▶ SÁNG …
                              ▲  │ châm dầu: +10 fuel / đom đóm
                              └──┘
```
- Trường của đèn: `lit`, `fuel`, `everLit`, `relitCount`, `deposited`.
- **Dầu lưu bằng đơn vị nguyên 1/60** (100 dầu = 6000 đơn vị). Hao 1/s = 1 đơn vị mỗi tick, hút 5/s = 5 đơn vị mỗi tick. Không có sai số số thực; chỉ làm tròn 1 chữ số thập phân khi xuất snapshot.
- `lanternNeed(l)` = số đom đóm đèn nhận được ngay lúc này: đèn tắt = chi phí (10, hoặc 5 nếu `everLit`) − đã nạp; đèn sáng = `ceil((100 − fuel) / 10)`. Đèn có `need = 0` không được chọn khi tương tác. Cùng một hàm dùng cho chọn đèn, nạp đèn và lời nhắc trên HUD.
- **Vùng an toàn** là thuộc tính suy ra `hasZone(l) = lit && fuel ≥ 30`, không lưu riêng. Mọi chỗ dùng vùng an toàn (chặn Bóng Mực, đẩy ra khi đèn vừa thắp, điểm sinh hợp lệ) đều gọi hàm này.
- Châm dầu làm đèn từ dưới 30 lên ≥ 30 thì dùng lại cơ chế "đèn vừa thắp" có sẵn từ Phase 2 (`justLit` → đẩy Bóng Mực ra mép trong 30 tick, không gây sát thương).

### 2. Thứ tự trong tick
Bước 2 (giảm bộ đếm) thêm: trừ dầu (hao + hút theo số Bóng Mực `drain`), phát `fuel_drain` mỗi 60 tick hút. **Ngay sau** đó đèn có `fuel ≤ 0` tắt (`lantern_out`). Bước 11 không còn "thắng khi thắp hết": hết Ngọn Lửa → thua `no_flames` (luôn xét trước); hết giờ → thắng `dawn_survived` nếu số đèn đang sáng ≥ `ceil(0.6 × tổng)`, ngược lại thua `dawn`.

### 3. Bóng Mực `drain`
Thêm trạng thái thứ 6. Chỉ `wander` mới chọn đèn yếu (sáng, fuel < 30) gần nhất. Không có đèn yếu thì đi về đèn tắt gần nhất. Tới ≤ 2 m thì `drain`, đứng yên. Rời `drain` khi: Mây vào ≤ 6 m → `chase`; trúng Tỏa Sáng → `stunned`; đèn tắt / được châm lên ≥ 30 / cách > 2 m → `wander`. Hết choáng → `wander` (Phase 2 là chase/wander theo khoảng cách).

### 4. Điểm và sức chứa
Điểm theo bảng mới (khóa `score.*` mở rộng: `per_relight`, `per_stun_drain`, `per_lit_lantern_dawn`; `per_second_left = 0`). Sức chứa là getter `capacity = min(20, 10 + 2 × successfulLights)`, không lưu riêng.

## Giả định
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A41 | Tốc độ Bóng Mực `wander` đi tới đèn yếu | Bằng `shade_speed` (4 / 4.5 m/s) |
| A42 | "Đi về đèn tắt gần nhất như trước" (Ticket-02 không có luật này) | `wander` không có đèn yếu → lượn 1.5 m/s về đèn tắt gần nhất; tới ≤ 2 m thì lượn ngẫu nhiên quanh đó |
| A43 | `fuel_drain` "mỗi 60 tick" | Đếm riêng từng Bóng Mực từ lúc bắt đầu hút; phát ở tick thứ 60, 120, … của lần hút đó |
| A44 | Khóa điểm trong `tuning.score` | Giữ khóa cũ, thêm `per_relight`, `per_stun_drain`, `per_lit_lantern_dawn`; `per_second_left = 0` vì thưởng thời gian bị bỏ |
| A45 | Đèn đang sáng chỉ hao một chút (99.98) | Vẫn "chưa đầy" → nhận 1 đom đóm. Hệ quả: sau khi thắp, bấm E tiếp sẽ châm dầu cho đèn đó nếu nó gần nhất (đúng câu chữ ticket: "gần nhất trong các đèn nhận được") |

## Hệ quả
- Test Phase 1–2 về "thắng khi thắp hết", điểm cũ, thời gian Đêm cũ được sửa hoặc thay, có ghi chú `Ticket-03 [THAY THẾ]` ngay trong test (xem `docs/notes/phase-3.md`).
- Scenario `win` đổi ý nghĩa: giờ chứng minh **không** còn thắng sớm.
- Logic hiển thị (thanh dầu, nhấp nháy, đèn xẹp/rách) đọc trực tiếp `fuel`, `everLit`, `hasZone` từ sim. Không có luật nào nằm trong renderer.
