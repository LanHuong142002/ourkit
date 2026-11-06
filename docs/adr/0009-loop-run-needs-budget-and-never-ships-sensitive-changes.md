---
status: accepted (sửa đổi 2026-11-06: bỏ yêu cầu plan phải được duyệt trước)
---

# Loop Run phải có Budget và không bao giờ tự Ship thay đổi chạm Sensitive Area

Loop Run tự đi từ Spec tới PR mà không chờ người duyệt plan; agent tự chốt Tier và Prior Art rồi ghi vào Decision Log, và khi xong để lại một Run Report để người dùng đọc lại hoặc hỏi lại sau. Câu hỏi phát sinh được gom vào Question Batch, việc lặt vặt thì tự quyết và ghi Decision Log. Lỗi blocking từ Reviewer được tự sửa tối đa 2 lần rồi bỏ qua sang Task độc lập khác. Thay đổi thường được đẩy tới PR nhưng không merge; thay đổi chạm Sensitive Area, hoặc cần người dùng thao tác trên một dịch vụ, thì dừng hai lần: sau Plan (để không đốt token vào hướng sai) và trước Ship (xem ADR 0012). Loop Run không bắt đầu nếu chưa đặt Budget. Lý do: chạy hàng giờ không ai canh chỉ an toàn khi chỗ nguy hiểm nhất luôn chờ người, và chi phí không thể tự phình ra.
