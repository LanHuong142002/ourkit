# Installer viết bằng Node, chép kit vào từng project; phần suy luận để cho agent

Kit được cài bằng `npx` (Installer viết bằng Node) và được chép thẳng vào từng project, commit cùng repo, thay vì cài global một lần cho cả máy. Installer chỉ làm phần tất định (hỏi Greenfield/Brownfield, chọn Role, chép file, phát hiện sơ bộ); mọi thứ cần hiểu project — Stack Profile, gợi ý stack — được giao cho bước Init chạy trong agent. Lý do: kit sẽ được dùng theo team, nên phiên bản kit phải đi theo git để mọi máy chạy giống nhau; còn luật tĩnh trong CLI không đọc nổi project lộn xộn như agent.

## Considered Options

- Plugin global ở cấp user: cập nhật một lần cho mọi project, nhưng mỗi máy có thể chạy một phiên bản khác.
- Python/uvx, shell script, binary đơn: Node được chọn vì gần như mọi dev full-stack đã có, và npm cho kênh phát hành public sau này. Runtime của Installer không ràng buộc stack của project (xem ADR 0002).

## Consequences

- Cần lệnh `upgrade` để cập nhật kit trong từng project.
