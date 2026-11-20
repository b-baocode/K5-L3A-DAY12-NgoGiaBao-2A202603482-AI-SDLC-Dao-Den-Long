# FPS — visual overhaul (bloom, vignette, low-poly world)

Đo trong **cửa sổ Edge thật** (không headless), 1280×720, mỗi Đêm: khởi động 1.5 s (biên dịch shader) rồi đi bộ 3 s, lấy FPS trung bình 120 khung gần nhất (`window.__fps()`).

- Máy: Intel Core i7-13620H, GPU **Intel UHD Graphics (tích hợp)**, ANGLE Direct3D11, Windows 11, Edge, Node 22.
- Bản build: `npm run build` + `npx vite preview`.

| Cấu hình | Đêm 1 | Đêm 2 | Đêm 3 |
|---|---|---|---|
| Hậu kỳ tắt (trước khi thêm bloom) | 144 | 144 | 144 |
| Hậu kỳ bật (bloom ½ độ phân giải + vignette) | 118.2 | 109.2 | 115.8 |
| Hậu kỳ tắt (đo lại) | 144 | 144 | 144 |

144 = trần làm mới màn hình (vsync). Yêu cầu Ticket-02: ≥ 30 FPS trung bình ở 1280×720 → **đạt** ở cả hai cấu hình.

## Ghi chú trung thực
- Các số đo trước đó bằng Edge **headless + SwiftShader (render bằng CPU)** cho 3–30 FPS và thay đổi theo thứ tự chạy, vì CPU bị chia với ứng dụng khác. Không dùng làm bằng chứng hiệu năng.
- Lần đo SwiftShader giúp tìm ra một chi phí thật: mỗi cây/đá dùng một `MeshStandardMaterial` (PBR) riêng. Đã đổi sang `MeshLambertMaterial` dùng chung theo màu. Hạt sáng dùng chung material (trước đó mỗi hạt tạo material mới, là nợ kỹ thuật ghi ở Phase 3).
- An toàn cho máy yếu: nếu đang bật hậu kỳ mà FPS < 28 liên tục 4 s, game tự tắt hậu kỳ và báo trên màn hình. Có thể bật/tắt trong Cài đặt.

Ảnh: `p4-menu.png`, `p4-night1.png`, `p4-night2.png`, `p4-night3.png` (chụp trong cửa sổ thật, hậu kỳ bật).
