# Nhật ký dùng AI

Công cụ: **Claude Code** (model Claude Opus 5.5) trong VS Code. Harness: `AGENTS.md`, `CLAUDE.md`, Stop hook `.claude/hooks/require-green.js`, skill `.claude/skills/verify`.

## Phase 1
| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc yêu cầu | Đọc lab board + 6 file hướng dẫn, tóm tắt Test Contract | Chọn công nghệ (Three.js + Node), đặt tên team |
| Thiết kế | Tách `src/sim` (logic thuần) khỏi `src/web`; tuning chỉ đọc từ `game.contract.json` | Duyệt bảng giả định A1–A17 |
| Build | Viết sim, headless CLI, validate, renderer | Đọc diff |
| Kiểm chứng | 27 test node:test, mutation check (2 lỗi cố ý đều bị bắt), proof chạy 6 scenario × 2 lần | Xem SUMMARY, ảnh chụp |
| Lỗi AI | Quên `renderer.render()`; scenario đặt sai vị trí | Phát hiện bằng ảnh chụp canvas và proof FAIL |

Token ước tính Phase 1: _(điền số từ `/cost` hoặc trang usage của bạn)_.
Cách tiết kiệm: đọc tài liệu một lần rồi tóm tắt; tuning một nguồn tránh vòng sửa lệch số; test CLI bằng scenario nhỏ thay vì cho agent chạy game nhiều lần.

## Phase 2
| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc ticket | Lab board tải ticket từ database riêng, AI không đọc được → tôi lưu trang (Ctrl+S) cho AI trích nội dung | Đối chiếu với bản tôi tự copy |
| Thiết kế | Tách bản đồ thành dữ liệu (`maps.js`), viết lại `step()` theo 12 bước bắt buộc | Duyệt giả định A21–A33; 4 điểm cần hỏi trợ giảng |
| Build | Sim v1.1, headless `--night`, validate scenario mới; web: 3 bản đồ, menu, pause, cài đặt, HUD, âm thanh | Đọc diff |
| Kiểm chứng | 51 test, 14 scenario proof ×2 lần, mutation check, ảnh và FPS trong Edge | Xem ảnh từng Đêm |
| Lỗi AI | Test tự viết sai (không nhả nút, lệch 1 tick); một test không bắt được lỗi tâm Tỏa Sáng; scenario cũ không còn hợp lệ; cảnh quá tối, FPS thấp do nhiều point light | Sửa test, ghi quy tắc vào AGENTS.md; thêm case biên; chỉnh scenario; tắt đèn điểm của đèn chưa nạp |

Token ước tính Phase 2: _(điền từ `/cost`)_. Cách tiết kiệm: viết lại `step()` một lần theo thứ tự ticket thay vì vá dần; chạy test từng file khi sửa; mỗi tính năng một scenario nhỏ.

## Phase 3
| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc ticket | Tách luật bị [THAY THẾ], ưu tiên phần chấm tự động; brief đồ họa để Phase 4 | Duyệt thứ tự ưu tiên (30 phút) |
| Thiết kế | Đèn thành vòng trạng thái có dầu (đơn vị nguyên 1/60), `hasZone`/`lanternNeed`/`capacity`/`winNeed` là hàm suy ra; ADR 0001 | Duyệt giả định A41–A45 |
| Build | Sim v1.2, validate, web: thanh dầu, đèn xẹp/rách, hạt hút dầu, HUD sức chứa, chế độ mù màu | Đọc diff |
| Kiểm chứng | 63 test (12 test dầu mới), 19 scenario proof ×2, ảnh thường + mù màu | Xem ảnh |
| Lỗi AI | 3 kỳ vọng sai trong test/proof (dầu đã hao trước khi châm, khoảng cách 5.9 < 6, đèn vừa thắp vẫn nhận châm); FPS giảm do hạt tạo material mới | Sửa kỳ vọng theo câu chữ ticket; ghi nợ kỹ thuật FPS cho Phase 4 |

Token ước tính Phase 3: _(điền từ `/cost`)_. Cách tiết kiệm: sửa sim bằng một script thay thế có kiểm tra (assert mỗi đoạn) thay vì nhiều lần edit; một file test mới cho luật mới thay vì vá rải rác.

## Phase 4
| Bước | Việc AI làm | Tôi kiểm tra / quyết định |
|---|---|---|
| Đọc ticket | Ưu tiên phần chấm tự động (bench, soak, contract v1.3), rồi bảng xếp hạng, a11y, tài liệu | Chọn lưu bảng xếp hạng trên đĩa qua `run.js` |
| Build | `scripts/soak.js`, `scripts/bench.js` (puppeteer), `src/sim/bench.js`, `src/sim/leaderboard.js`, `scripts/run.js`, UI bảng xếp hạng, đổi phím, phụ đề, giảm chuyển động, chữ lớn | Đọc diff |
| Kiểm chứng | 69 test; e2e trong Edge (lưu điểm, export, trùng phím, min font 18 px); 6 lần chạy bench có in thời điểm khung khựng | Xem ảnh, đọc bench.json |
| Lỗi AI | Đo FPS bằng SwiftShader; cờ trình duyệt cho số ảo; khung khởi động tính vào đo; WMI gây khựng; phím game nuốt chữ khi gõ tên | Đổi sang cửa sổ thật; mỗi giả thuyết một lần đo đối chứng |

Token ước tính Phase 4: _(điền từ `/cost`)_.
