# A standalone package that borrows its structure from Spec Kit without depending on it

We write all the steps and templates ourselves, inspired by GitHub Spec Kit (and possibly vendoring its MIT templates), but we don't install or call the `specify` CLI at runtime. Reason: the user wants full control of the flow and doesn't want to be affected when Spec Kit changes versions (for example, version 1.0 changing command syntax), and this also removes the Python/uv dependency.

## Considered Options

- Spec Kit plus our own preset or extension: fastest, but Spec Kit would still decide the core flow.
- Rewriting from zero with no reference: loses a proven flow.
