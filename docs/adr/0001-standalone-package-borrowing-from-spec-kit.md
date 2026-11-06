# Package độc lập, mượn cấu trúc từ Spec Kit chứ không phụ thuộc vào nó

Chúng ta tự viết toàn bộ các bước và template, lấy cảm hứng (và có thể vendor các template MIT) từ GitHub Spec Kit, nhưng không cài hay gọi `specify` CLI lúc chạy. Lý do: người dùng muốn toàn quyền kiểm soát luồng và không bị ảnh hưởng khi Spec Kit đổi phiên bản (vd bản 1.0 đổi cú pháp lệnh), đồng thời bỏ được dependency Python/uv.

## Considered Options

- Spec Kit + preset/extension riêng: nhanh nhất, nhưng luồng lõi vẫn do Spec Kit quyết định.
- Viết lại từ con số 0, không tham khảo: mất luồng đã được kiểm chứng.
