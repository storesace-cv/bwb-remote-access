# Local logs (not versioned)

All logs generated on the local workstation or downloaded from the droplet **must live under `logs/`**:

- `logs/local/` – outputs from Step-1 to Step-3.
- `logs/deploy/` – deploy logs from Step-4.
- `logs/droplet/` – copies of logs pulled from remote hosts (keeps per-run files like
  `run-0001-app-debug.log` plus a `latest-app-debug.log` symlink).
- `logs/archive/` – numbered archives produced by Step-5
  (`run-0001-logs-<timestamp>.tar.gz`) with `logs-latest.tar.gz`
  pointing to the newest bundle.

This directory is ignored from Git by default. Use scripts to publish selected files into `local-logs/` when you need to share them via GitHub. Do **not** commit files directly from `logs/`.
