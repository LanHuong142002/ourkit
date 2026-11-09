# A marked block in the Host's always-loaded file routes plain requests into the lifecycle

The Installer and `upgrade` keep one marked block in the file the Host loads in every session, which is `CLAUDE.md` on Claude Code. It says to work on a branch, propose a Tier and follow the Stages before editing. Everything outside the markers belongs to the project and is never changed. Reason: Stages are skills, which only run when called or when their description happens to match. In a real run, a plain request skipped the kit completely, and an agent added an unauthenticated public route on the default branch with no Tier, Gate or Sensitive Area floor. With the block, the same request edited nothing and proposed a Feature.

## Considered Options

- Relying on skill descriptions: nothing to install, but the real run showed it doesn't work.
- A session-start hook: stronger, but it adds a Host mechanism to maintain and writes to settings the project may already use.

## Consequences

- The block is an instruction, so the agent follows it by judgment. It isn't enforcement, and the README lists this as a known limit.
- `CLAUDE.md` is committed, so the whole team gets the same routing.

## Amended by ADR 0014

The same text now lives in its own file, `.claude/rules/ourkit.md`, which Claude Code loads in every session like `CLAUDE.md`. The kit owns the whole file, so it no longer writes a marked block into the project's `CLAUDE.md`, and `upgrade` removes the old block. Like the rest of the kit, the file is committed.
