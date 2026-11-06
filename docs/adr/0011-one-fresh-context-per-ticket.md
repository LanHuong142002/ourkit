# Mỗi ticket chạy trong một ngữ cảnh mới; phiên chính chỉ điều phối

Khi làm nhiều ticket liên tiếp (vd Loop Run), phiên chính chỉ giữ hàng đợi và bản tóm tắt 5 dòng của từng ticket đã xong. Mỗi ticket chạy trong một subagent hoặc phiên mới, xong thì bỏ ngữ cảnh đó; thứ duy nhất được mang sang ticket sau là Lessons và Project Log. Lý do: nếu một phiên làm hết, ngữ cảnh dồn lại nên mỗi tin nhắn sau đắt hơn tin trước, và chỉ vài ticket là chạm limit; tách ngữ cảnh giúp ticket thứ 10 tốn xấp xỉ ticket thứ 1.

## Considered Options

- Một phiên làm hết: tiện, giữ được mọi chi tiết, nhưng chi phí phình theo số ticket.
