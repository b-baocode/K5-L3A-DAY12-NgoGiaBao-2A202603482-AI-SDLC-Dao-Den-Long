# Credits

- Code: Ngô Gia Bảo, viết cùng Claude Code (Anthropic, model Claude Opus 5.5).
- Engine: [three.js](https://threejs.org) (MIT), build: [Vite](https://vitejs.dev) (MIT).
- Hậu kỳ: addon đi kèm three.js (`three/addons/postprocessing`: EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass), MIT. Shader trời, sao, cỏ lay gió, viền fresnel Bóng Mực, vignette do mình viết (với Claude Code).
- Phong cách đồ họa theo brief quan sát nền 3D của trang lab (low-poly, flat shading, bloom). Không sao chép mã nguồn trang lab.
- Mọi hình khối 3D đều tạo bằng primitive của three.js trong code; không dùng asset, nhạc hay mô hình bên ngoài.
- **Âm thanh và nhạc nền:** tổng hợp lúc chạy bằng Web Audio API (dao động sine/triangle/sawtooth); mã do Claude Code viết theo yêu cầu của tôi. Không có file âm thanh.
- **Lời thoại / lời kể** (Ông Đăng, phụ đề, thông báo): viết cùng Claude Code (AI), tôi duyệt.
- **Biểu tượng** 🔥 🏮 ⚠ 🍃 ⏳: emoji của phông chữ hệ điều hành.
- **Công cụ kiểm thử:** [puppeteer](https://pptr.dev) 23.11.1 (Apache-2.0) + Chrome for Testing cho benchmark và chụp ảnh bằng chứng; `ffmpeg` (nén video demo).
- Ảnh chụp màn hình trong `docs/proof/` do script tự chụp từ chính game.
- Nhân vật, bối cảnh "Đảo Đèn Lồng" thuộc tài liệu lab Day 12 AI SDLC.
