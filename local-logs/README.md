# GitHub-bound logs

The `local-logs/` folder is the **only place where logs should be published to GitHub**. Keep the working copy clean:

- Do not store or process runtime logs here directly on your workstation.
- Use the `logs/` directory for any local or downloaded logs.
- Logs are copied here automatically every time you run `scripts/get-error-log.sh` (unless you pass `--no-publish`/`PUBLISH=0`), which force-stages them, commits, and pushes to the current branch.
- Avoid pulling log artefacts back to the workstation; clean `local-logs/` locally after publishing if you don't need the copies.
