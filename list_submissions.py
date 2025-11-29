#!/usr/bin/env python3
"""
Print teams in submission order (rows as they appear in the CSV), showing a
human-friendly team name and the git clone URL.

Usage:
    python3 list_submissions.py [--repos data/repos.csv]

It supports either the simple `repo_url` header (current export) or the
`id,repo` style described in SPEC.md. If a team name is not present, it falls
back to the derived repo slug.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Dict, Tuple


def parse_repo_url(raw: str) -> Tuple[str, str]:
    """
    Normalize a repo URL/slug to (owner/repo slug, clone_url).
    Accepts GitHub page URL, HTTPS .git, SSH git@github.com:owner/repo.git, or slug owner/repo.
    """
    if not raw:
        raise ValueError("Empty repo URL")
    trimmed = raw.strip()
    if trimmed.startswith("git@github.com:"):
        path_part = trimmed.split(":", 1)[1]
    elif "://" in trimmed:
        after_scheme = trimmed.split("://", 1)[1]
        if "/" in after_scheme:
            path_part = after_scheme.split("/", 1)[1]
        else:
            raise ValueError(f"Could not parse repo URL: {raw}")
    else:
        path_part = trimmed

    path_part = path_part.strip("/")
    if path_part.endswith(".git"):
        path_part = path_part[:-4]
    parts = path_part.split("/")
    if len(parts) < 2:
        raise ValueError(f"Could not extract owner/repo from: {raw}")
    owner, repo = parts[0], parts[1]
    slug = f"{owner}/{repo}"
    clone_url = raw if ("://" in trimmed or trimmed.startswith("git@")) else f"https://github.com/{slug}.git"
    return slug, clone_url


def derive_team_name(row: Dict[str, str], slug: str) -> str:
    for key in ("team_name", "Team Name", "team", "name", "id"):
        val = row.get(key, "")
        if val and val.strip():
            return val.strip()
    return slug.replace("/", "-")


def main() -> int:
    parser = argparse.ArgumentParser(description="List teams in submission order with git repo URLs.")
    parser.add_argument("--repos", default="data/repos.csv", type=Path, help="Path to repos CSV (default: data/repos.csv)")
    parser.add_argument(
        "--names-only",
        action="store_true",
        help="Only print team names (no repo URLs)",
    )
    args = parser.parse_args()

    if not args.repos.exists():
        sys.stderr.write(f"Repos CSV not found: {args.repos}\n")
        return 1

    rows = []
    with args.repos.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            repo_val = row.get("repo_url") or row.get("repo") or ""
            repo_val = repo_val.strip()
            if not repo_val:
                continue
            slug, clone_url = parse_repo_url(repo_val)
            team_name = derive_team_name(row, slug)
            rows.append((team_name, clone_url))

    for idx, (team, repo_url) in enumerate(rows, start=1):
        if args.names_only:
            print(f"{idx:02d}. {team}")
        else:
            print(f"{idx:02d}. {team} -> {repo_url}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
