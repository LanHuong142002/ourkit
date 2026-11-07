# ourkit

A package installed into an agent that guides every project through one controlled software development lifecycle. See the terms in [CONTEXT.md](CONTEXT.md) and the decisions in [docs/adr](docs/adr).

v1 runs on Claude Code and needs Node 18 or later to install. See [Known limits](#known-limits) before relying on it unattended.

## Get started

The repo is private, so the machine needs access to it.

1. In your project's folder, run the Installer. It asks whether the project is Greenfield or Brownfield, and which Roles you want:

   ```
   npx github:LanHuong142002/ourkit
   ```

2. Commit what it added.
3. Open Claude Code in the project and run `/ourkit-init`. The agent reads the project and proposes a Stack Profile for you to confirm. An existing project also gets a glossary draft and a Baseline, so old code isn't judged.
4. Commit again, so your team shares the setup.

## Everyday use

Describe your change to the agent. It proposes a Tier, and you confirm it:

| Tier | For | Goes through |
|---|---|---|
| Patch | A small change, outside any Sensitive Area | Build, Review |
| Feature | Anything else that fits one cycle | Spec, Plan, Tasks, Build, Review, Ship |
| Epic | Too large for one cycle | Grilled, then split into Features |

A change touching auth, data, schema, money or a public API is always at least a Feature.

You can start any step yourself:

| Command | What it does |
|---|---|
| `/ourkit-spec`, `/ourkit-plan`, `/ourkit-tasks`, `/ourkit-build`, `/ourkit-review`, `/ourkit-ship` | Run one Stage |
| `/ourkit-bugfix` | Fix a bug: reproduce it, fix it, verify the fix |
| `/ourkit-epic` | Question a large change and split it |
| `/ourkit-huh` | Understand a change, then check your understanding |
| `/ourkit-handsoff` | Take one change to a PR without you |
| `/ourkit-deploy` | Deploy to staging; it never deploys to production |

## Working unattended

By default you work alongside the agent (Pair). `/ourkit-handsoff` works by itself and reports back. A change touching a Sensitive Area, or needing you to act on a service, stops after Plan and before Ship. Merging and deploying to production are always yours.

To work through many tickets, run this in a terminal from the default branch, with a clean tree. Without a Budget, it won't start:

```
node .ourkit/kit/bin/ourkit.js loop run --hours 4 --wait 42 43 44
```

Each ticket gets a fresh session on its own branch. Tracker commands run in the agent's shell, which may not have the same PATH as your terminal. Windows' Git Bash can drop `gh`; if a session reports it missing, add it in `~/.bashrc`:

```
export PATH="$PATH:/c/Program Files/GitHub CLI"
```

When the run stops, read `.ourkit/run-report.md`, or run `/ourkit-run-report`. See [core/loop-run.md](core/loop-run.md) for when it stops and what sessions may do.

Tickets must meet the [Ticket Standard](core/ticket-standard.md). Hands-off takes only tickets written by a team member, or labelled `ourkit:ready` by one.

## Make it yours

| To | Do this |
|---|---|
| Add your project's rules | Write `.ourkit/rules.md` |
| Add a specialty for this project | Add a [Project Role](core/role-contract.md) in `.ourkit/roles/` |
| Change how the kit behaves | Add an [Override](core/overrides.md), and never edit kit files |
| Change your project's commands | Edit `.ourkit/stack-profile.json` |
| Connect GitHub Issues | `npx github:LanHuong142002/ourkit tracker add github` |
| Update the kit | `npx github:LanHuong142002/ourkit upgrade` |

## Known limits

The kit enforces what it can in code, but an agent with a shell can't be fully fenced in by instructions:

- **Protect your default branch.** "Never merge" is an instruction, backed in a Loop Run by a deny list. Branch protection is what truly enforces it.
- **Keep production credentials away from where the agent runs.** The rule against production deploys is also an instruction.
- **Approvals are recorded by the agent,** so the kit can't prove a person said yes.
- **Sensitive Area detection reads file paths,** then relies on the agent's judgment. It can miss one.
- **Intake facts are gathered by the agent.** A ticket that misleads the agent at that point could get through.
- **Model choice for the main session isn't set for you.** ADR 0008 recommends Opus, so choose it with `/model`.
- **Usage data comes from an undocumented Claude Code event.** If it changes, a Loop Run loses its early pause and works the same otherwise.

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
