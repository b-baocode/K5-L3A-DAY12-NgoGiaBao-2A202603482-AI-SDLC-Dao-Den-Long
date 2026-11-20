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
