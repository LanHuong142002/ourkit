---
status: accepted (amended 2026-11-07: the Claude Code Host Shell installs into the project's `.claude/` and doesn't use a plugin manifest)
---

# Each Stage is written to the Agent Skills standard and wrapped in the Claude Code Host Shell

v1 runs only on Claude Code, but each Stage is a standard Agent Skills folder (`SKILL.md` plus accompanying resources) rather than a Claude-specific format. The parts only Claude understands (install paths, hooks, subagent definitions) live in a separate thin layer, and Stages are copied into the project's `.claude/skills/` so that they travel with git (ADR 0005). Reason: the content, which holds almost all the value, can move to another agent without being rewritten, and v1 doesn't need a build or conversion step.

## Considered Options

- Writing directly in Claude's plugin format: fastest, but extending later would require a converter.
- A neutral source plus a build step generating each agent's format: most flexible, but costly in v1 with only one target.
