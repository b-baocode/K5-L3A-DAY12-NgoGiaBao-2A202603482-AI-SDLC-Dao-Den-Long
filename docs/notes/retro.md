# Retro — Đảo Đèn Lồng (4 phase)

## Số liệu
| | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|
| Yêu cầu chính | PRD-0, Contract v1.0 | Số chuẩn, 3 bản đồ, 6 tính năng, v1.1 | Đèn có dầu, luật thắng mới, v1.2 | Bench, soak, bảng xếp hạng, a11y, v1.3 |
| Test (`npm test`) | 33 | 51 | 63 | 69 |
| Scenario proof | 6 | 14 | 19 | 19 (giống từng byte phase-3) |
| Test cũ phải sửa/xóa | — | 11 (ghi lý do) | 7 (ghi lý do) | 1 (version contract) |
| Commit / tag | 7 / phase-1 | 6 / phase-2 | 5 / phase-3 | … / phase-4 + v1.0.0 |
| Lượt gọi AI | 76 | 44 | 23 | 101 |
| Token đầu ra | 96.934 | 117.156 | 54.288 | 177.323 |
| Token đầu vào (gồm đọc cache) | 12,3 tr | 14,3 tr | 9,9 tr | 60,7 tr |

## Đánh giá từng phase
- **Phase 1:** đạt toàn bộ PRD-0. Kiến trúc tách `src/sim` (luật thuần, tất định) khỏi `src/web` là quyết định đúng nhất của cả dự án: mọi phase sau chỉ cần sửa sim + test, headless/bench/soak dùng lại cùng code.
- **Phase 2:** đạt. Số chuẩn thay số tự chọn; viết lại `step()` theo 12 bước bắt buộc một lần thay vì vá. 4 điểm mơ hồ (xuất phát Đêm 3, `spawning`, `invuln`, `night_start`) ghi giả định A21–A24.
- **Phase 3:** đạt. Change request thay luật cốt lõi; ADR 0001 mô tả vòng trạng thái đèn. Dầu lưu bằng đơn vị nguyên 1/60 → không sai số. Không phase trước nào bị hỏng ngoài các luật bị thay (có ghi chú `[THAY THẾ]` trong test).
- **Phase 4:** đạt các mục đo được trên máy tôi; video do tôi quay. Bench ban đầu trượt `p1_low` (12.7) → 5 vòng đo/sửa → 62.9.

## Điều hiệu quả khi làm với AI
- **Contract và test trước, code sau**: AI viết đúng hơn khi có test/scenario nói rõ "làm A thấy B".
- **Proof tất định** (chạy 2 lần, so từng byte) + **so hash trước/sau** khi thêm sáng tạo: chứng minh phần cũ không đổi mà không cần tin lời AI.
- **Chạy thật trong trình duyệt** (puppeteer, chụp ảnh, đo FPS, e2e) bắt được những lỗi mà test logic không thấy.
- **Mutation check** (cố ý làm hỏng luật): phát hiện 1 test không bắt được lỗi (tâm Tỏa Sáng) → thêm case biên.

## Những lần AI sai và cách phát hiện
| Lần | AI sai | Phát hiện bằng |
|---|---|---|
| P1 | Quên `renderer.render()` — HUD chạy nhưng cảnh 3D trống | Đọc pixel canvas (toàn trong suốt) |
| P1–P3 | Nhiều kỳ vọng test/scenario sai (khoảng cách, dầu đã hao, nhả nút) | Proof/test đỏ → đối chiếu câu chữ ticket trước khi sửa |
| P2 | Test không bắt được lỗi tâm Tỏa Sáng | Mutation check |
| P3 | Hạt sáng tạo material mới mỗi hạt → tụt FPS | Đo FPS |
| P4 | Đo FPS bằng renderer CPU rồi kết luận sai; cờ trình duyệt cho số ảo 240 FPS | So headless/thật, đổi thứ tự đo, in thời điểm khung khựng |
| P4 | Bắt phím game "nuốt" chữ khi gõ tên | e2e gõ "NgôGiaBảo" ra "NgôGiBảo" |
| P2 | Phiên AI không đọc được tab phase trên lab board (dữ liệu tải động) | Tôi lưu trang (Ctrl+S) cho AI đọc |

## Harness giúp nhiều nhất
1. **Stop hook `require-green.js`**: agent không thể kết thúc khi test đỏ — chặn cả những lần AI định báo "xong".
2. **`scripts/proof.js` + skill `verify`**: một lệnh tạo bằng chứng có kiểm tra kỳ vọng và tính tất định.
3. **AGENTS.md** cập nhật mỗi phase (quy tắc `[THAY THẾ]`, "một lần bấm cần một tick nhả nút", đơn vị dầu nguyên…) — các lỗi đã gặp không lặp lại.

## Token và cách tiết kiệm
- **Tổng (đo từ log phiên Claude Code, model claude-opus-5-5, không dùng subagent):** 244 lượt gọi · **445.701 token đầu ra** · 97,2 triệu token đầu vào, trong đó **96,5 triệu (99 %) là đọc prompt cache**, 0,67 triệu ghi cache, chỉ 544 token đầu vào không cache.
- **Nhận xét:** chi phí chủ yếu nằm ở việc đọc lại ngữ cảnh dài mỗi lượt. Phase 4 tốn đầu vào gấp 4–6 lần các phase khác dù số lượt gọi chỉ gấp 1,3–4 lần, vì hội thoại đã rất dài (mỗi lượt đọc lại toàn bộ lịch sử). Làm lại: mở phiên mới (hoặc `/compact`) đầu mỗi phase, chỉ mang theo AGENTS.md + ghi chú phase trước.
- Tiết kiệm: đọc tài liệu một lần rồi tóm tắt; sửa nhiều chỗ bằng một script có `assert` mỗi đoạn thay vì nhiều lần edit; chạy test theo file khi đang sửa; mỗi tính năng một scenario nhỏ; không cho agent chơi game dài — dùng headless.

## Nếu làm lại
- Viết **bench + đo FPS trên GPU thật** ngay từ Phase 2 (khi có ≥ 30 FPS) thay vì để Phase 4; tránh 1 vòng "đo sai bằng SwiftShader".
- Dùng instancing cho mọi thực thể số lượng lớn từ đầu.
- Hỏi trợ giảng các điểm mơ hồ ngay khi đọc ticket (các giả định A21–A45 vẫn chưa được xác nhận).
- Thêm `.gitattributes` (LF) từ commit đầu để bằng chứng khớp từng byte trên mọi hệ điều hành.
