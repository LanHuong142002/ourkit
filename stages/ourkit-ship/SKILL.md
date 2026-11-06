---
name: ourkit-ship
description: Opens a PR for the reviewed Active Change that meets the Ticket Standard, and never merges it. Use after the ourkit Review Stage, or when asked to ship an ourkit change.
---

# Ship

Deliver the reviewed change as a clear PR, so the user can decide whether to merge it. In these steps, `ourkit <subcommand>` means `node .ourkit/kit/bin/ourkit.js <subcommand>`, run from the project root.

**Merging is always the user's job, in both Modes. Never merge a PR, enable auto-merge, or push to the default branch (ADR 0010, ADR 0012).** Deploying is a separate Stage.

## Before you start

1. Run `ourkit pending`. If it prints anything, mention that line to the user.
2. Run `ourkit tier show` and `ourkit mode`.
3. **A Patch in Pair doesn't reach this Stage.** It ends at Review, and the user commits it. If that's where you are, tell the user and stop.

## Steps

1. **Commit the work.** Commit anything still uncommitted on the change's branch, including its `.ourkit` records. A Patch in Hands-off may still be on the default branch, so create a branch for it first.
2. **Run the Gate** with `ourkit gate ship`. If it blocks, fix each problem it lists, going back to the Stage that owns it. Never work around it.
3. **Write the PR description** to a temporary file, in the PR shape from `.ourkit/kit/core/ticket-standard.md`:
   - **Summary:** what changed.
   - **Context:** why, from the spec.
   - **Scope Boundary:** what's in, what's out, and anything deliberately left undone.
   - **How To Verify:** steps a reviewer can follow, and only test results you actually observed. Say so plainly if something wasn't run or couldn't be verified.
   - **Links & References:** the ticket this closes, if any, and relevant decisions.
   - In Hands-off, also include the Decision Log (`ourkit decision list`), the open Question Batch (`ourkit question list --open`), non-blocking findings, and the Test Handoff with its step-by-step instructions, since the user wasn't there.
4. **Assess it** with `ourkit ticket <file> --title "<title>" --pr`, then judge the rest of 4C yourself. Fix what's wrong.
5. **Push the branch and open the PR** using the project's git host tools. If you can't, because a tool is missing or you aren't signed in, give the user the title and description to use, and add the step with `ourkit pending add`.

## Handing over

Tell the user the PR's link, what they still need to check, and that merging is up to them.
