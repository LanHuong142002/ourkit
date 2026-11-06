---
status: accepted (sửa đổi 2026-11-07: Host Shell của Claude Code cài vào `.claude/` của project, không dùng plugin manifest)
---

# Mỗi Stage được viết theo chuẩn Agent Skills, bọc trong Host Shell của Claude Code

v1 chỉ chạy trên Claude Code, nhưng mỗi Stage là một thư mục chuẩn Agent Skills (`SKILL.md` + tài nguyên kèm theo) thay vì định dạng riêng của Claude. Phần chỉ Claude hiểu (đường dẫn cài đặt, hook, định nghĩa subagent) nằm trong một lớp vỏ mỏng tách riêng, và Stage được chép vào `.claude/skills/` của project để đi theo git (ADR 0005). Lý do: phần nội dung — nơi chứa gần như toàn bộ giá trị — mang sang agent khác được mà không cần viết lại, trong khi v1 không phải dựng bước build/chuyển đổi.

## Considered Options

- Viết thẳng định dạng plugin Claude: nhanh nhất, nhưng mở rộng sau này phải viết bộ chuyển đổi.
- Nguồn trung lập + bước build sinh ra từng agent: linh hoạt nhất, nhưng tốn công ở v1 khi chỉ có một đích.
