# Core never assumes a technology

Core must not hard-code any language, framework, command or folder structure; all technology-dependent information is read from the project's Stack Profile (detected automatically, then confirmed by the user) and, if present, from a Stack Pack. Reason: the package must apply to any project, including a blank one, and a "convenient" convention like "run `npm test`" in Core would silently break every non-Node project.

## Consequences

- Every Gate that needs to run a command (test, lint...) must ask the Stack Profile and must handle a project that doesn't have that command yet.
- Deep conventions for a technology may live only in a Stack Pack, never in Core or a Role.
