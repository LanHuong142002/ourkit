# Mỗi loại việc một model cố định, không đổi model giữa phiên

Phiên chính chạy Opus (effort medium) và chỉ làm việc cần suy nghĩ: lên kế hoạch, ra quyết định, review mọi diff. Việc implement các bước đã được duyệt giao cho subagent Sonnet; việc tìm kiếm, chạy test và báo lỗi (chỉ báo phần fail) giao cho subagent Haiku. Không bao giờ đổi model của phiên chính giữa chừng, vì làm vậy mất prompt cache và tổng chi phí còn cao hơn. Lý do: mỗi subagent có ngữ cảnh riêng nên chọn model riêng mà không phá cache của phiên chính; đây là cách rẻ nhất mà vẫn giữ chất lượng ở chỗ quan trọng.

## Consequences

- Host Shell của Claude Code ghi model vào frontmatter từng subagent; Core chỉ nói "việc này cần model mạnh/rẻ".
- Explainer (`/ourkit-huh`) và Teach-back dùng Sonnet, vì luôn bám vào code thật; riêng thay đổi chạm Sensitive Area thì dùng Opus.
- Phiên chính phải chờ người dùng duyệt plan trước khi bắt đầu Build.
