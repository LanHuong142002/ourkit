# Thay đổi chạm Sensitive Area luôn ít nhất là Feature

Agent đề xuất Tier và người dùng xác nhận, nhưng có một sàn cứng: mọi thay đổi chạm vào auth/phân quyền, dữ liệu, schema, tiền hoặc API public đều tối thiểu là Feature, kể cả khi chỉ sửa một dòng, và người dùng không hạ xuống Patch được. Lý do: đây chính là những chỗ mà lỗi "quên tính tới" gây hậu quả lớn nhất, trong khi cảm giác "chỉ là sửa nhỏ" lại hay xuất hiện nhất.
