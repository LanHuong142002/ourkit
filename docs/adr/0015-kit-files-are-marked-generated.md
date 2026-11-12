# The kit's committed files are marked as generated

The Installer and `upgrade` write a marked block into the project's `.gitattributes` that sets `linguist-generated=true` on the files the kit copies: `.ourkit/kit/`, `.ourkit/install.json`, and the kit's Stages, subagents and rules file under `.claude/`. GitHub then collapses those files in pull requests and leaves them out of the language stats. The files stay committed, as ADR 0014 decided. Reason: committing about 70 files the team didn't write made the install and every upgrade a noisy diff, and that noise was the main complaint about keeping the kit in the repo.

## Considered Options

- Keeping the copies out of git again, rebuilt by a SessionStart hook pinned to the project's version. No one would have to remember anything, unlike 0.2.0, but the first session on every machine and in the cloud would need network access to the private kit repository and Node. Kept in reserve if a clean repository becomes a requirement.
- A Claude Code plugin, rejected again for the reasons in ADR 0014.

## Consequences

- Overrides, Project Rules and the kit's documents for each change (specs, plans, reports) are the team's own work, so they are not marked.
- The project's own lines in `.gitattributes` are left alone; only the block between `# ourkit:start` and `# ourkit:end` is rewritten.
- Installing still ends with a commit of the kit on its own, so it never mixes with a change's code.
- Like `.ourkit/` and `.claude/`, `.gitattributes` doesn't count as part of a change or block the Baseline, because the kit writes to it. A team's own edit to it is therefore not seen by the Gates either.
