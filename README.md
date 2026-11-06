# ourkit

A package installed into an agent that guides every project through one controlled software development lifecycle. See the terms in [CONTEXT.md](CONTEXT.md) and the decisions in [docs/adr](docs/adr).

The kit is under construction and isn't ready for real projects yet.

## Install and upgrade

Run these from the project's folder. The repo is private, so the machine needs access to it.

```
npx github:LanHuong142002/ourkit
npx github:LanHuong142002/ourkit upgrade
npx github:LanHuong142002/ourkit tracker add github
```

## Repo layout

| Folder | Contents |
|---|---|
| `bin/` | The `ourkit` command |
| `src/` | Code behind the command |
| `core/` | Core |
| `roles/` | Roles |
| `stack-packs/` | Stack Packs |
| `tracker-packs/` | Tracker Packs |
| `stages/` | Stages, each a standard Agent Skills folder |
| `hosts/<host>/` | The Host Shell for each Host |
| `fixtures/` | Fixture Projects |
| `test/` | The kit's tests |

A folder appears only once it has content; `stack-packs/` doesn't exist yet.

## Development

```
npm test
```

Run the Contract Check on the kit:

```
node bin/ourkit.js check
```
