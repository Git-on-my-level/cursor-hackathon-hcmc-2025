#!/usr/bin/env python3
"""
Optional AI analysis runner using codex CLI.
"""

import argparse
import csv
import json
import logging
import subprocess
from pathlib import Path


def load_repos_map(csv_path: Path) -> dict:
    mapping = {}
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("id") and row.get("repo"):
                mapping[row["id"].strip()] = row["repo"].strip()
    return mapping


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build_prompt(template: str, context: str, repo_id: str, repo: str, metrics_json: str) -> str:
    return (
        template.replace("{{HACKATHON_CONTEXT}}", context)
        .replace("{{REPO_ID}}", repo_id)
        .replace("{{REPO}}", repo)
        .replace("{{METRICS_JSON}}", metrics_json)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run optional AI analysis via codex CLI.")
    parser.add_argument("--work-dir", default="work", help="Work directory (contains ai_outputs, metrics)")
    parser.add_argument("--repos-csv", default="data/repos.csv", help="Path to repos.csv")
    parser.add_argument("--only-id", help="Run AI analysis only for this repo id")
    args = parser.parse_args()

    work_dir = Path(args.work_dir)
    metrics_dir = work_dir / "metrics"
    ai_outputs_dir = work_dir / "ai_outputs"
    ai_outputs_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger = logging.getLogger("ai")

    repos_map = load_repos_map(Path(args.repos_csv))
    context_path = Path("ai") / "hackathon_context.md"
    template_path = Path("ai") / "prompt_template.txt"

    if not context_path.exists() or not template_path.exists():
        logger.error("Missing AI context or template files.")
        return

    hackathon_context = load_text(context_path)
    prompt_template = load_text(template_path)

    if args.only_id:
        target_ids = [args.only_id]
    else:
        target_ids = [
            path.stem for path in metrics_dir.glob("*.json") if not path.name.endswith("_commits.json")
        ]

    for repo_id in target_ids:
        metrics_path = metrics_dir / f"{repo_id}.json"
        if not metrics_path.exists():
            logger.warning("Metrics file missing for %s, skipping.", repo_id)
            continue
        if repo_id not in repos_map:
            logger.warning("Repo id %s not found in repos.csv, skipping.", repo_id)
            continue
        repo = repos_map[repo_id]
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        prompt = build_prompt(
            prompt_template,
            hackathon_context,
            repo_id,
            repo,
            json.dumps(metrics, indent=2),
        )

        logger.info("Running codex for %s", repo_id)
        try:
            result = subprocess.run(
                ["codex", "--yolo", "exec", "--sandbox", "danger-full-access", prompt],
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            logger.error("codex CLI not found: %s", exc)
            (ai_outputs_dir / f"{repo_id}.txt").write_text(
                "ERROR: codex CLI not available\n", encoding="utf-8"
            )
            continue

        output_path = ai_outputs_dir / f"{repo_id}.txt"
        if result.returncode != 0:
            logger.error("codex failed for %s: %s", repo_id, result.stderr.strip())
            output_path.write_text(f"ERROR: codex failed ({result.returncode})\n{result.stderr}", encoding="utf-8")
            continue

        output_path.write_text(result.stdout, encoding="utf-8")
        logger.info("Wrote AI output to %s", output_path)


if __name__ == "__main__":
    main()
