# File kit trong project không bao giờ sửa tay — mọi tùy biến là Override

Kit được chép vào từng project (ADR 0005), nhưng các file đó được coi là chỉ-đọc: mọi tùy biến nằm trong Override riêng và được ưu tiên hơn file gốc. Khi `upgrade`, Installer chỉ ghi đè file kit; nếu thấy file kit bị sửa tay, nó cảnh báo và đề nghị chuyển phần sửa sang Override. Lý do: người dùng không bao giờ mất công sức khi nâng cấp, và không phải gộp tay như git merge.

## Considered Options

- Ghi đè thẳng: đơn giản nhưng làm mất tùy biến.
- Hiện diff cho người dùng tự gộp: an toàn nhưng mỗi lần upgrade là một lần merge thủ công.
