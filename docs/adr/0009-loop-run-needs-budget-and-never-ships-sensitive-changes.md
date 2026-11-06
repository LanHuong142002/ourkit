---
status: accepted (amended 2026-11-06: removed the requirement that the plan be approved first)
---

# A Loop Run must have a Budget and never Ships a change touching a Sensitive Area by itself

A Loop Run goes from Spec to PR by itself without waiting for plan approval; the agent settles the Tier and Prior Art itself and records them in the Decision Log, and when finished leaves a Run Report for the user to read or ask about later. Questions that come up are gathered into a Question Batch, and minor matters are decided by the agent and recorded in the Decision Log. Blocking errors from the Reviewer are fixed automatically at most twice, then the run skips to another independent Task. Normal changes are pushed to a PR but not merged; a change touching a Sensitive Area, or needing the user to act on a service, stops twice: after Plan (to avoid burning tokens in the wrong direction) and before Ship (see ADR 0012). A Loop Run doesn't start without a Budget. Reason: running for hours unattended is safe only when the most dangerous places always wait for a person, and cost can't be allowed to grow by itself.
