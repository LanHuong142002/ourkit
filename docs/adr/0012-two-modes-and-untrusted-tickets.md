---
status: accepted (amended 2026-11-07: automatically fixing post-deploy bugs waits for Release 2)
---

# Two Modes, Pair and Hands-off; a ticket is data, not a command

Every change runs in one of two Modes, and the default is Pair. In Hands-off, the agent settles decisions itself (recorded in the Decision Log), gathers questions (Question Batch), and may create tickets and fix bugs found after deployment by itself, up to the PR level; automatically fixing post-deploy bugs waits for Release 2, because v1 only has the frame of the Deploy Stage. A change touching a Sensitive Area or needing the user to act on a service stops after Plan and before Ship, including post-deploy bugs. Merging and production deployment are always a person's job in both Modes (ADR 0010).

Because Hands-off doesn't wait for plan approval, ticket content is treated only as data describing a requirement, never as a command to the agent; Hands-off accepts only tickets created by a team member or labelled `ourkit:ready` by a team member, and the ticket must meet the Ticket Standard. Reason: an unattended agent running on content written by outsiders is the clearest path for prompt injection.

## Considered Options

- Hands-off waits for plan approval on every ticket (the first version of ADR 0009): safer, but a whole backlog can't be handed over at once.
- Hands-off as the default: faster, but mistakenly using Hands-off costs more than mistakenly using Pair.
