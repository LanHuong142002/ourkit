# Commands in a project

The Installer copies the kit's command into the project, so its version follows git (ADR 0005). Wherever the kit says `ourkit <subcommand>`, run this from the project root:

```
node .ourkit/kit/bin/ourkit.js <subcommand>
```

| Subcommand | Purpose |
|---|---|
| `command <name>` | Look up a command in the Stack Profile |
| `rules` | Print every rule in layering order |
| `check --project` | Verify Project Roles and Overrides |
| `ticket <body-file> --title "<title>" [--pr]` | Assess a ticket or PR against the Ticket Standard |
| `pack add <pack-folder>` | Install a Stack Pack |
| `baseline` | Record the Baseline of a Brownfield project, once |

`.ourkit/install.json` records the entry path, the Roles, the stack files found, and a hash of each installed kit file. The kit maintains this file, so don't edit it.
