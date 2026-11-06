# Loop Run

A Loop Run is Hands-off in cycles over many tickets. The user starts it in a terminal, from the default branch with a clean tree:

```
node .ourkit/kit/bin/ourkit.js loop run --hours 4 42 43 44
```

**It needs a Budget.** Without `--hours` or `--tokens`, it won't start (ADR 0009). With both, whichever runs out first ends the run. The hours count time spent in sessions, and the tokens are the input, output and cache-write tokens the sessions report.

## How it works

The kit's command coordinates, not an agent. For each ticket it starts a fresh session on the `ourkit-handsoff` Stage, then keeps only a five-line summary. That keeps the tenth ticket costing about the same as the first (ADR 0011). Only Lessons and the Project Log carry to the next ticket.

Each ticket's work stays on its own branch. A session that stops midway has its work saved on that branch, so nothing is lost.

## When it stops

| `stopped` | Meaning |
|---|---|
| `done` | The queue is empty and at least one ticket shipped |
| `all-blocked` | The queue is empty and nothing shipped |
| `budget` | The Budget ran out |
| `session-failed` | A session failed, perhaps at a usage limit. The ticket stays queued |
| `dirty-tree` | A session left uncommitted work on the default branch |

Run `ourkit loop status` to see the results, and `ourkit loop run` with no tickets to continue a queue. A ticket that stops at a Hands-off stop doesn't end the run; the next ticket starts.

## The limits

Sessions run with the permissions in `.ourkit/kit/host/session-settings.json`, which deny merging, force-pushing, pushing to the default branch and closing issues, as a Host-level guard behind the Gates. To let sessions run your project's own commands, put an edited copy at `.ourkit/overrides/host/session-settings.json`. It takes effect the next time `upgrade` runs.

A blocking finding gets at most two automatic fixes, tracked with `ourkit review attempt <id>`. After that, the session moves to another independent task or stops (ADR 0009).
