# Kit files in a project are never edited by hand; every customization is an Override

The kit is copied into each project (ADR 0005), but those files are treated as read-only: all customization lives in separate Overrides that take priority over the originals. On `upgrade`, the Installer overwrites only kit files; if it finds a kit file edited by hand, it warns and offers to move the edit into an Override. Reason: users never lose work when upgrading and never have to merge by hand the way they would with git merge.

## Considered Options

- Overwriting directly: simple, but loses customizations.
- Showing a diff for the user to merge: safe, but every upgrade becomes a manual merge.
