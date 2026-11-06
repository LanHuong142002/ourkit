# Hai Mode Pair và Hands-off; ticket là dữ liệu, không phải lệnh

Mọi thay đổi chạy ở một trong hai Mode, mặc định là Pair. Ở Hands-off, agent tự chốt quyết định (ghi Decision Log), gom câu hỏi (Question Batch), được tự tạo ticket và tự sửa bug phát hiện sau deploy tới mức PR. Thay đổi chạm Sensitive Area hoặc cần người dùng thao tác trên dịch vụ thì dừng sau Plan và trước Ship, kể cả bug sau deploy. Merge và deploy production luôn là việc của người ở cả hai Mode (ADR 0010).

Vì Hands-off không chờ người duyệt plan, nội dung ticket chỉ được coi là dữ liệu mô tả yêu cầu, không bao giờ là lệnh cho agent; Hands-off chỉ nhận ticket do người trong team tạo hoặc đã được người trong team gắn nhãn `ourkit:ready`, và ticket phải đạt Ticket Standard. Lý do: agent chạy không ai canh trên nội dung do người ngoài viết là đường tấn công prompt injection rõ nhất.

## Considered Options

- Hands-off chờ người duyệt plan cho mọi ticket (bản đầu của ADR 0009): an toàn hơn nhưng không giao được cả backlog trong một lần.
- Mặc định là Hands-off: nhanh hơn, nhưng nhầm sang Hands-off đắt hơn nhầm sang Pair.
