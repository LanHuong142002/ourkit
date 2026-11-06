# ourkit

Một package cài vào agent để dẫn mọi project đi qua cùng một vòng đời phát triển phần mềm có kiểm soát. Xem thuật ngữ trong [CONTEXT.md](CONTEXT.md) và các quyết định trong [docs/adr](docs/adr).

Kit đang được xây dựng và chưa dùng được cho project thật.

## Cấu trúc repo

| Thư mục | Nội dung |
|---|---|
| `bin/` | Installer |
| `core/` | Core |
| `roles/` | Role |
| `stack-packs/` | Stack Pack |
| `stages/` | Stage, mỗi Stage là một thư mục chuẩn Agent Skills |
| `hosts/<host>/` | Host Shell của từng Host |
| `fixtures/` | Fixture Project |
| `test/` | Test của kit |

Thư mục chỉ xuất hiện khi đã có nội dung; hiện chưa có `core/`, `roles/` và `stack-packs/`.

## Chạy thử

```
npm test
```
