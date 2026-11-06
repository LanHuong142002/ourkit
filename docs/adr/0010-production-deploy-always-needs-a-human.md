# Deploy lên production luôn cần người bấm

Agent được tự deploy lên staging, nhưng không bao giờ tự deploy lên production — kể cả trong Loop Run. Stage Deploy (khung ở v1, làm đầy ở Release 2) đọc lệnh `deploy` và `smoke` từ Stack Profile, nên Core vẫn không giả định hạ tầng nào. Lý do: production là chỗ lỗi chạm tới người dùng thật, và cùng tinh thần với ADR 0009 — merge đã là việc của người, deploy production cũng vậy.
