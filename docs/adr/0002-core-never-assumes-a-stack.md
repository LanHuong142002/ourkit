# Core không bao giờ giả định công nghệ

Core không được hard-code bất kỳ ngôn ngữ, framework, lệnh hay cấu trúc thư mục nào; mọi thông tin phụ thuộc công nghệ đều được đọc từ Stack Profile của project (phát hiện tự động → người dùng xác nhận) và, nếu có, từ Stack Pack. Lý do: package phải áp được vào bất kỳ project nào, kể cả project trắng — một quy ước "tiện tay" kiểu "chạy `npm test`" trong Core sẽ âm thầm làm hỏng mọi project không phải Node.

## Consequences

- Mọi Gate cần chạy lệnh (test, lint…) phải hỏi Stack Profile, và xử lý được trường hợp project chưa có lệnh đó.
- Quy ước sâu cho một công nghệ chỉ được nằm trong Stack Pack, không bao giờ trong Core hay Role.
