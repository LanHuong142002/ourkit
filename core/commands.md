# Commands in a project

The Installer copies the kit's command into the project, so its version follows git (ADR 0005). Wherever the kit says `ourkit <subcommand>`, run this from the project root:

```
node .ourkit/kit/bin/ourkit.js <subcommand>
```

| Subcommand | Purpose |
|---|---|
| `active-change` | Print the Active Change as JSON |
| `command <name>` | Look up a command in the Stack Profile |
| `rules` | Print every rule in layering order |
| `check --project` | Verify Project Roles, Overrides and Connectors |
| `pending` | Print setup work still waiting for the user, in one line |
| `pending add "<text>"`, `pending done <id>` | Save or finish a waiting item |
| `gate scope`, `gate floor`, `gate run <test\|lint\|build>` | Run a Gate on the Active Change |
| `lessons`, `lessons add <cost\|quality> "<lesson>"` | Read or save Lessons |
| `log add "<name>" "<summary>" "<link>"` | Add a line to the Project Log |
| `mode [pair\|hands-off]` | Read or set the Mode of the Active Change |
| `decision add`, `decision list` | Write or read the Decision Log |
| `question add`, `question answer`, `question list` | Write or read the Question Batch |
| `review packet`, `review add`, `review resolve`, `review list`, `review complete` | Prepare a review and record its findings |
| `task list`, `task done`, `task block`, `task reopen` | Track progress through the tasks |
| `tier scan`, `tier set`, `tier show` | Find Sensitive Area signals, then set or read the Tier |
| `ticket <body-file> --title "<title>" [--pr]` | Assess a ticket or PR against the Ticket Standard |
| `pack add <pack-folder>` | Install a Stack Pack |
| `baseline` | Record the Baseline of a Brownfield project, once |

`.ourkit/install.json` records the entry path, the Roles, the stack files found, and a hash of each installed kit file. The kit maintains this file, so don't edit it.
