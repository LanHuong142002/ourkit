---
status: accepted (amended 2026-11-07: a recorded false match keeps Patch)
---

# A change touching a Sensitive Area is always at least a Feature

The agent proposes a Tier and the user confirms it, but there is a hard floor: any change touching auth or permissions, data, schema, money or public API is at least a Feature, even for a single line, and the user cannot lower it to Patch. Reason: these are exactly the places where a "forgot to consider that" mistake has the largest consequences, and also where the feeling of "it's only a small fix" appears most often.

## Amendment

The path scan can match a file that isn't sensitive, such as a `tokens.css` of design values. `--not-sensitive "<reason>"` records why, so that change can stay a Patch. It only answers a false match from the scan: it never overrides a Sensitive Area someone declared, and it's not for a change that merely feels small.
