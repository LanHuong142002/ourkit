# The files the kit copies stay out of git, and `sync` rebuilds them from the install record

The Installer still copies the kit into each project (ADR 0005), but it lists every file it copies in a marked block of `.gitignore`: `.ourkit/kit/`, the `ourkit-*` skills and subagents, and the rules file under `.claude/`. Git keeps only what describes the project: `.ourkit/install.json` (kit version, Roles, Tracker Pack) and the project's own files in `.ourkit/`. After cloning, a teammate runs `npx github:LanHuong142002/ourkit#v<version> sync`, which rebuilds the copies at the recorded version, with the project's Overrides applied. The routing that ADR 0013 put in `CLAUDE.md` moves to `.claude/rules/ourkit.md`, which Claude Code loads in every session the same way, so the kit owns a whole file and never writes into the project's `CLAUDE.md`. Reason: committing the kit put about 70 files the team never edits into every project's history and diffs, and teams shouldn't have to push files they don't own. The version is still pinned in git, so every machine still runs the same kit, which was ADR 0005's reason for copying it in.

## Considered Options

- A package dependency (`package.json` plus `postinstall`): automatic on `npm install`, but a Go or Python project has no `package.json`, which goes against ADR 0002.
- A Claude Code plugin: nothing in the repo, but each machine installs its own version, and the team setting still has to be committed under `.claude/`.
- Copying the kit to a folder in the user's home, shared by projects: no copies in the project at all, but every path the kit and its sessions use would change. It can follow later.

## Consequences

- A machine that hasn't run `sync` has no skills or rules, so plain requests skip the lifecycle. The Installer prints the command, and the README lists it as a known limit.
- `sync` refuses a different version and names the right command. It refuses to overwrite a hand edit, so an edit isn't lost silently.
- Projects that committed the kit before this keep tracking those files until `git rm --cached`. `upgrade` prints the command, and removes the old block from `CLAUDE.md`.
- Line-ending noise from `upgrade` on Windows no longer shows up, because the copies aren't tracked.
