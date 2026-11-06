# Active Change

The Active Change is what the user is working on. The kit infers it, so commands take no argument naming a change.

Run `ourkit active-change`. It prints JSON:

- `kind`: `branch` when work is on its own branch, otherwise `worktree`.
- `id`: the name the kit stores this change's records under.
- `branch`: the current branch, if there is one.
- `base`: the commit the change is compared to. `kind: branch` uses the point where the branch left the default branch. `kind: worktree` uses the commit before the latest one, so the change is the uncommitted work plus the latest commit.
- `files`: the changed files, including uncommitted and untracked ones. The kit's own folders aren't listed.

If the command exits 1, there's no Active Change: the folder isn't a git repository, or nothing has changed. Tell the user the reason it prints. Don't guess at a change.
