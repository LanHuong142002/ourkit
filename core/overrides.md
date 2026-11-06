# Overrides

Kit files in a project are read-only (ADR 0007). To customize one, put a copy at the same path under `.ourkit/overrides/`:

| Kit file | Override |
|---|---|
| `.ourkit/kit/core/rule-layering.md` | `.ourkit/overrides/core/rule-layering.md` |
| `.ourkit/kit/roles/backend/checklist.md` | `.ourkit/overrides/roles/backend/checklist.md` |

The Override replaces the whole file and keeps the original's place in rule layering. `ourkit rules` labels it `(Override)`.

`ourkit check --project [project-dir]` reports an Override with no matching kit file, because it has no effect.

Use an Override to change how the kit behaves. To add a project's own rules, use Project Rules instead.
