# ourkit

Một package cài vào agent để dẫn mọi project — bất kể công nghệ — đi qua cùng một vòng đời phát triển phần mềm có kiểm soát.

## Language

### Cấu trúc package

**Core**:
Phần dùng chung cho mọi Role và mọi project; không chứa bất kỳ giả định nào về ngôn ngữ, framework hay hạ tầng.
_Avoid_: common, base, shared

**Role**:
Một chuyên môn nguyên tử mà agent đảm nhận (vd frontend, backend), mang theo hướng dẫn và checklist riêng chồng lên Core; một project có thể bật nhiều Role cùng lúc.
_Avoid_: persona, mode, profile

**Full-stack**:
Tên gọi cho việc bật đồng thời Role frontend và Role backend — không phải một Role riêng.
_Avoid_: fullstack role

**Stack Pack**:
Gói tùy chọn cài thêm, chứa quy ước sâu cho một công nghệ cụ thể; Core vẫn chạy đủ khi không có Stack Pack nào.
_Avoid_: plugin, adapter, preset

**Host**:
Agent mà kit chạy trên đó (Claude Code là Host đầu tiên).
_Avoid_: platform, target, agent (khi nói về nơi cài)

**Host Shell**:
Lớp mỏng riêng cho từng Host — manifest, hook, đường dẫn cài đặt, cách gọi subagent — bọc quanh nội dung Stage dùng chung; muốn thêm Host thì chỉ viết Host Shell mới.
_Avoid_: adapter, wrapper, vỏ

**Contract Check**:
Lệnh kiểm tra tự động một điểm mở rộng (Host Shell, Role, Stack Pack, Stage) đã thỏa đủ hợp đồng của nó hay chưa.
_Avoid_: validation, lint

**Fixture Project**:
Project mẫu đi kèm kit (vd một Node, một Python, một API-only) để chạy thử kit và Contract Check — không phải project của người dùng.
_Avoid_: sample, demo project

**Tracker**:
Nơi chứa ticket của project (v1: GitHub Issues). Kit đọc ticket làm đầu vào cho Spec, và tự cập nhật trạng thái, comment link PR kèm tóm tắt Change Report.
_Avoid_: issue tracker, board, backlog tool

**Tracker Pack**:
Gói tùy chọn nối Core với một Tracker cụ thể qua hợp đồng 4 việc: đọc ticket, đổi trạng thái, comment, gắn link PR; dùng MCP nếu có, không thì CLI.
_Avoid_: integration

**Connector**:
Kết nối MCP tới một dịch vụ bên ngoài (vd GitHub, Vercel, Notion). Init tự cấu hình phần làm được — không bao giờ ghi token vào repo — và với phần cần người dùng (đăng nhập, tạo token) thì đưa hướng dẫn từng bước. Chỉ được bật khi project thật sự cần, để không tốn ngữ cảnh. Việc chưa xong được lưu lại và nhắc bằng một dòng ở lần chạy sau.
_Avoid_: integration, plugin, MCP (khi nói về một kết nối cụ thể)

**Release**:
Một lần phát hành có đánh số của chính package (v1, v2…).
_Avoid_: phase, milestone, version (khi nói về đợt phát triển)

### Vòng đời

**Stage**:
Một bước trong vòng đời của một thay đổi; v1 gồm Spec → Plan → Tasks → Build (code + test) → Review → Ship, cộng luồng Bug-fix. Deploy có sẵn khung ở v1 và được làm đầy ở Release 2.
_Avoid_: phase, step

**Mode**:
Cách người dùng làm việc với agent cho một thay đổi: Pair hoặc Hands-off. Gần như mọi Gate hành xử khác nhau theo Mode; mặc định là Pair.
_Avoid_: flow, style

**Pair**:
Mode người dùng ngồi cùng agent: Gate hỏi ngay, người dùng duyệt plan, Explainer được gợi ý.
_Avoid_: interactive, manual

**Hands-off**:
Mode agent tự làm rồi báo cáo: tự chốt quyết định và ghi Decision Log, gom câu hỏi vào Question Batch; với thay đổi chạm Sensitive Area hoặc cần người dùng thao tác trên dịch vụ thì dừng hai lần — sau Plan và trước Ship.
_Avoid_: autopilot, autonomous, solo

**Loop Run**:
Hands-off chạy theo chu kỳ trên nhiều ticket (có thể cả backlog), mỗi ticket một ngữ cảnh mới; tự dừng khi bị chặn hết, xong việc, hoặc hết Budget.
_Avoid_: batch mode, background run

**Budget**:
Giới hạn giờ chạy hoặc ước lượng token đặt trước cho một Loop Run; không có Budget thì Loop Run không bắt đầu. Nếu Host cho đọc mức sử dụng của gói, Loop Run còn dừng nhận ticket mới khi gần chạm limit, cảnh báo người dùng, và tự chạy tiếp khi limit được làm mới (nếu Host cho hẹn giờ).
_Avoid_: quota, limit, cap

**Question Batch**:
Các câu hỏi cần người dùng quyết định, được gom lại để hỏi một lần thay vì dừng lại hỏi từng câu.
_Avoid_: blockers, pending questions

**Run Report**:
Bản tổng kết sau một Loop Run: đã xong gì, Decision Log, Question Batch, Test Handoff, và những thay đổi đang chờ người dùng. Người dùng đọc lại hoặc hỏi lại flow từ đây.
_Avoid_: summary, run log

**Gate**:
Điểm kiểm tra giữa hai Stage; mức độ nghiêm (chặn hay chỉ nhắc) phụ thuộc vào Tier của thay đổi.
_Avoid_: check, guard, checkpoint

**Tier**:
Cỡ của một thay đổi — Patch, Feature hoặc Epic — quyết định nó phải đi qua những Stage và Gate nào; agent đề xuất Tier kèm lý do, người dùng xác nhận.
_Avoid_: size, level, mode

**Patch**:
Tier nhỏ nhất: chỉ đi Build và Review.

**Feature**:
Tier đi đủ mọi Stage.

**Epic**:
Tier cho thay đổi quá lớn cho một vòng: được grill trước và chia thành nhiều Feature.

**Active Change**:
Thay đổi mà người dùng đang làm, được kit tự suy ra từ nhánh hiện tại; nếu không suy ra được (vd Patch không tạo nhánh) thì là phần chưa commit cùng commit gần nhất. Nhờ vậy các lệnh không cần tham số.
_Avoid_: current feature, selected change

**Bug-fix**:
Luồng riêng cho sửa lỗi, gồm các Stage Reproduce → Fix → Verify; vẫn chịu luật Tier như mọi thay đổi khác.
_Avoid_: hotfix flow, bug flow

**Reviewer**:
Subagent chấm một thay đổi trong ngữ cảnh mới — chỉ thấy spec, diff và checklist, không thấy quá trình làm. Feature có một Reviewer đọc checklist của mọi Role đang bật; chạm Sensitive Area thì thêm một Reviewer riêng chỉ soi vùng đó; Patch thì phiên chính tự review. Mỗi phát hiện là blocking hoặc non-blocking.
_Avoid_: code reviewer, checker, linter

**Explainer**:
Subagent (gọi bằng lệnh `huh`) giúp người dùng hiểu một thay đổi cho tới khi nắm rõ: mở đầu bằng tóm tắt 3 câu, trả lời bằng cách chỉ vào code thật, và kết thúc bằng Teach-back. Khác với clarify (agent hỏi để làm rõ spec), Explainer làm rõ cho người dùng.
_Avoid_: walkthrough, briefing, tutor

**Teach-back**:
Vài câu hỏi Explainer đặt ra cuối phiên để kiểm tra người dùng thật sự hiểu thay đổi; câu nào trả lời sai thì được giải thích lại và ghi vào Change Report.
_Avoid_: quiz, test (khi nói về người dùng)

**Sensitive Area**:
Phần của hệ thống mà mọi thay đổi chạm vào đều ít nhất là Feature, dù chỉ một dòng: auth/phân quyền, dữ liệu, schema, tiền, API public.
_Avoid_: critical path, risky code

### Cài đặt

**Installer**:
Công cụ dòng lệnh ở terminal, chạy trước khi mở agent: hỏi Greenfield hay Brownfield, chọn Role, chép kit vào project và phát hiện sơ bộ stack. Không suy luận gì.
_Avoid_: CLI (khi nói chung chung), setup script

**Init**:
Bước chạy bên trong agent ngay sau Installer: agent đọc project thật, đề xuất Stack Profile và hoàn tất lối vào tương ứng.
_Avoid_: onboarding command, bootstrap

**Greenfield**:
Lối vào cho project chưa có code: chọn stack, tạo Stack Profile, dựng khung bằng công cụ tạo project chính thức của stack đó.
_Avoid_: new project, blank project

**Brownfield**:
Lối vào cho project đã có code: quét code, đề xuất Stack Profile, viết nháp glossary từ code hiện có và ghi nhận Baseline.
_Avoid_: existing project, legacy project

### Ghi chép

**Ticket Standard**:
Mẫu chuẩn cho ticket (Summary, Title, User Story, Context, Scope Boundary, Links & References) và PR, phải đạt 4C: Correct, Clear, Complete, Concise. Dùng cho ticket kit tạo, nội dung PR, và để kiểm tra ticket trước khi nhận làm.
_Avoid_: template, ticket format

**Decision Log**:
Danh sách những quyết định lặt vặt agent tự chốt trong lúc chạy (kèm lý do một câu) để người dùng xem lại sau, thay vì dừng lại hỏi.
_Avoid_: notes, assumptions

**Test Handoff**:
Phần việc agent không tự kiểm được và giao lại cho người dùng test, luôn kèm hướng dẫn test từng bước; agent chỉ báo lại phần này, còn lại tự xử lý.
_Avoid_: manual QA, todo for user

**Change Report**:
Báo cáo của một Feature, Epic, hoặc Bug-fix chạm Sensitive Area: 5 dòng tóm tắt ở đầu, chi tiết bên dưới; Patch không có Change Report.
_Avoid_: report, summary, release notes

**Project Log**:
Mục lục lịch sử của cả project: mỗi lần Ship một thay đổi có Change Report thì thêm một dòng (ngày, tên, Tier, một câu tóm tắt, link).
_Avoid_: changelog, history

**Lessons**:
Bài học ngắn agent tự rút ra sau mỗi Change Report — về chi phí (vd Stage nào tốn bất thường) và chất lượng (lỗi Reviewer hay bắt lại, câu Teach-back hay sai) — được đọc lại ở đầu mỗi Stage Plan; tối đa khoảng 30 dòng, dòng cũ tự bị bỏ.
_Avoid_: memory, notes, retro

### Theo từng project

**Stack Profile**:
Bản khai báo công nghệ và các lệnh (test, lint, build, run) của một project — được phát hiện tự động rồi người dùng xác nhận; với project trắng thì được đề xuất cho người dùng chọn.
_Avoid_: config, stack config, settings

**Project Rules**:
Luật riêng của một project, đè lên Core → Role → Stack Pack theo đúng thứ tự đó; là "constitution" của project.
_Avoid_: constitution, project config, custom rules

**Project Role**:
Role do người dùng tự định nghĩa cho riêng một project, nằm cùng Project Rules, theo đúng hợp đồng như Role của kit.
_Avoid_: custom role, local role

**Override**:
Bản tùy biến của một file kit, đặt riêng trong project và được ưu tiên hơn file gốc; file kit không bao giờ bị sửa tay nên `upgrade` không làm mất Override.
_Avoid_: patch, customization, fork

**Baseline**:
Trạng thái của code tại thời điểm kit được cài vào một project Brownfield; Gate chỉ áp chuẩn lên phần thay đổi so với Baseline, không lên code cũ.
_Avoid_: legacy, snapshot, grandfathered code
