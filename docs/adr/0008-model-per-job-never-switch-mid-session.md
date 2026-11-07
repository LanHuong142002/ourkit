---
status: accepted (amended 2026-11-07: the Reviewer is a subagent; only Pair waits for plan approval; what the Host can't do)
---

# Each kind of work has a fixed model, and the model never changes mid-session

The main session runs Opus (medium effort) and does only work that needs thought: planning, deciding, and reviewing the diff of a Patch itself. From Feature up, review belongs to the Reviewer: a subagent in a fresh context using the strong model (Opus on Claude Code). Implementing approved steps goes to Sonnet subagents; searching, running tests and reporting errors (failures only) goes to Haiku subagents. The main session's model never changes midway, because that loses the prompt cache and costs more overall. Reason: each subagent has its own context, so it can choose its own model without breaking the main session's cache; this is the cheapest approach that keeps quality where it matters.

## Consequences

- The Claude Code Host Shell writes the model into each subagent's frontmatter; Core only says "this work needs a strong/cheap model".
- The Explainer (`/ourkit-huh`) and Teach-back use Sonnet, because they always stay close to real code; for a change touching a Sensitive Area they use Opus.
- In Pair, the main session must wait for the user to approve the plan before starting Build; Hands-off doesn't wait (see ADR 0012).

## Amendment

Two things differ from the above on Claude Code:

- **The main session's model isn't set for you.** It lives in `.claude/settings.json`, which a project may already use, so the Installer leaves it alone and the README recommends choosing Opus with `/model`.
- **The Explainer still costs main session context.** A subagent can't talk to the user directly, so the main session relays its answers. The model choice above still holds, but the context saving is smaller than intended.
