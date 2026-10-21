# Review gate

Every push to a branch other than `main` must carry the exact tree recorded by a review. The pre-push hook compares the pushed commit's Git tree with the latest review artifact for the local branch. A tree match remains valid when commits are rebased, amended, squashed or cherry-picked without changing their content.

Record a completed review from the repository root:

```sh
bun run review:log --tier 2 --reason "security-sensitive parser changes" --agents 3
```

This writes `.review-logs/<branch>-round-<N>.json`. The directory is intentionally untracked. `reviewedSha` and `reviewedTree` are computed from Git, including uncommitted working-tree content, and cannot be supplied through a findings file. Pass `--round N` to replace a particular round or `--findings file.json` to attach structured findings.

If the pushed diff touches `packages/html/src/sanitize`, `packages/frame/src/bridge` or any file under `packages/format/src/`, the artifact must record tier 2 or 3. A missing or null tier is refused. When coverage does not match, the hook names the unreviewed commits and asks for a new review artifact.
