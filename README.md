# Hackathon GitHub Repo Analyzer

Local CLI for judges to clone GitHub submissions, compute commit/activity metrics, and optionally produce short-form AI observations. Designed for macOS and ≤100 repos.

## Requirements
- macOS with `python3` (3.10+) and `git` in PATH
- Optional: `codex` CLI in PATH for AI summaries (`codex --yolo exec --sandbox danger-full-access "<PROMPT>"`)

## Layout
```
hackathon-analyzer/
  scan.py               # main metrics CLI
  ai/run_ai.py          # optional AI summaries
  ai/hackathon_context.md
  ai/prompt_template.txt
  data/repos.csv        # input list of repos
  work/                 # generated clones, metrics, summaries, ai outputs
```

## Quick Start
1) Populate `data/repos.csv` with headers `id,repo,t0` (see `data/repos.csv` sample). `repo` can be `owner/name` or full git URL. `t0` is optional per-repo override.
2) Set your global hackathon T0 (ISO-8601, e.g., `2025-12-01T10:00:00Z`).
3) Run the analyzer:
```bash
python3 scan.py \
  --repos data/repos.csv \
  --t0 2025-12-01T10:00:00Z \
  --work-dir work
```
Optional flags:
- `--t1 <ISO>`: hackathon end time
- `--force`: recompute even if metrics already exist
- `--no-update`: skip git fetch/reset for existing clones
- `--log-level DEBUG|INFO|...`

## Outputs
Created under `work/` (auto-created if missing):
- `repos/<id>/` cloned repositories (cached)
- `metrics/<id>.json` per-repo summary metrics
- `metrics/<id>_commits.csv` per-commit stats (chronological)
- `summary/metrics_summary.csv` cross-repo table for judges
- `logs/scan.log` run log
- `ai_outputs/<id>.txt` AI notes (only when run_ai is executed)

## AI Analysis (optional)
1) Fill `ai/hackathon_context.md` with event details/rules.
2) Adjust `ai/prompt_template.txt` if desired.
3) After metrics exist, run:
```bash
python3 ai/run_ai.py \
  --work-dir work \
  --repos-csv data/repos.csv
```
Use `--only-id team-alpha` to limit to one repo.

## Caching & Resuming
- Metrics are skipped if `metrics/<id>.json` exists; use `--force` to recompute.
- Existing clones are refreshed via fetch/reset unless `--no-update` is set.

## Troubleshooting
- Clone failures (auth/private repos) are logged and other repos continue.
- Invalid date strings for `--t0/--t1` or per-row `t0` will be reported and that repo is skipped.
- Missing `codex` CLI will create an error note in `ai_outputs/<id>.txt` and continue.
