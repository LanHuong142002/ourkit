# The Installer is written in Node and copies the kit into each project; inference is left to the agent

The kit is installed with `npx` (the Installer is written in Node) and copied directly into each project, committed with the repo, rather than installed globally once per machine. The Installer does only deterministic work (asks Greenfield or Brownfield, selects Roles, copies files, does preliminary detection); everything that requires understanding the project, such as the Stack Profile and stack suggestions, is left to the Init step running in the agent. Reason: the kit will be used by teams, so its version must follow git for every machine to behave the same; and static rules in a CLI can't read a messy project the way an agent can.

## Considered Options

- A global plugin at user level: one update covers every project, but each machine may run a different version.
- Python/uvx, a shell script, a single binary: Node was chosen because almost every full-stack developer already has it, and npm provides a public release channel later. The Installer's runtime doesn't constrain the project's stack (see ADR 0002).

## Consequences

- An `upgrade` command is needed to update the kit in each project.

## Amended by ADR 0014

The kit is still copied into each project, but the copies are listed in `.gitignore` instead of committed. Only `.ourkit/install.json` pins the version in git, and `sync` rebuilds the copies on each machine.
