# The routing moves to a rules file the kit owns, and the kit's files stay committed

The routing that ADR 0013 put in a marked block of `CLAUDE.md` moves to its own file, `.claude/rules/ourkit.md`. Claude Code loads it in every session the same way, so the kit owns a whole file and never writes into the project's `CLAUDE.md`. `upgrade` removes the old block, and the file too if the block was all it held. Everything the Installer copies is still committed, as ADR 0005 decided, so a teammate who clones the project needs nothing else. A `sync` command rebuilds the copies from the install record, for an Override added after install or a copy deleted by mistake. Reason: a project's `CLAUDE.md` belongs to its team, and mixing the kit's text into it made both harder to change.

## Considered Options

- Keeping the copies out of git, with `sync` rebuilding them after each clone. Version 0.2.0 shipped this. Every teammate then had to run an extra command after cloning, and forgetting it left Claude Code with no skills or rules and no warning. The copies are about 70 small text files, around 64 KB compressed, which is a small price for nothing to remember. 0.3.0 commits them again, and `upgrade` removes the `.gitignore` block 0.2.0 wrote.
- A Claude Code plugin: nothing in the repo, but each machine installs its own version, and the team setting still has to be committed under `.claude/`.
- A package dependency with `postinstall`: automatic for Node projects only, which goes against ADR 0002.

## Consequences

- `upgrade` still produces a commit that changes many files the team didn't write, once per kit version.
- A rules Override lives at `.ourkit/overrides/rules/ourkit.md`, like Stage and subagent Overrides.
