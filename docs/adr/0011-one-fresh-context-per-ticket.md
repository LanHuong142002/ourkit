---
status: accepted (amended 2026-11-07: a Loop Run uses new sessions)
---

# Each ticket runs in a fresh context; the main session only coordinates

When working through multiple tickets in a row (for example, a Loop Run), the main session keeps only the queue and a five-line summary of each finished ticket. Each ticket runs in a subagent or a new session, and that context is discarded when it finishes; the only things carried to the next ticket are Lessons and the Project Log. Reason: if one session does everything, context accumulates so that each later message costs more than the one before, and a few tickets are enough to reach the limit; separating contexts makes the tenth ticket cost about the same as the first.

## Considered Options

- One session does everything: convenient and keeps every detail, but cost grows with the number of tickets.

## Amendment

A Loop Run starts a new session for each ticket, coordinated by the kit's own code rather than by an agent. That makes the "main session" here a program, so a Budget can't be talked past and a ticket's context costs nothing once it ends. Subagents remain valid for work within one ticket.
