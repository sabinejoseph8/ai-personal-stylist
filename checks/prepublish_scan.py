#!/usr/bin/env python3
"""Pre-publish scan: what would the public see? Python standard library only.

  python3 checks/prepublish_scan.py              the files Git tracks now
  python3 checks/prepublish_scan.py --history    also every commit on every branch
  python3 checks/prepublish_scan.py --root PATH --config FILE

Looks for secrets, personal email addresses (in files and in commit authors),
private files, env files, system junk and very large files. It never changes
anything. Problems in old history are reported for a human decision: rewriting
public history is the owner's call, never automatic.

Exit code: 1 if the current files have a problem, or (with --strict) if history does.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_all as rc  # noqa: E402

JUNK = [".DS_Store", "Thumbs.db", "*.swp", "__pycache__/", "*.pyc"]
BIG_BYTES = 5 * 1024 * 1024


def scan_current(root: Path, cfg: dict) -> List[str]:
    files = rc.tracked_files(root) or []
    out = []
    out += [f"private file tracked: {p}" for p in files if rc.matches_any(p, cfg["private_paths"])]
    out += [f"env file tracked: {p}" for p in files if rc.ENV_FILE_RE.search(p)]
    out += [f"system junk tracked: {p}" for p in files if rc.matches_any(p, JUNK)]
    for p in files:
        try:
            size = (root / p).stat().st_size
        except OSError:
            continue
        if size > BIG_BYTES:
            out.append(f"large file ({size // (1024 * 1024)} MB): {p}")
    for rel, text in rc.tracked_text_files(root, cfg):
        out += [f"secret? {rel}: {h}" for h in rc.scan_text_for_secrets(text, cfg)]
        out += [f"email in {rel}: {e}" for e in rc.scan_text_for_emails(text, cfg)]
    return out


def scan_history(root: Path, cfg: dict) -> List[str]:
    out = []
    people = rc.git(root, "log", "--all", "--format=%an <%ae>%n%cn <%ce>") or ""
    for person in sorted(set(people.splitlines())):
        email = person.rsplit("<", 1)[-1].rstrip(">")
        if email and not any(email.lower().endswith(a.lower()) for a in cfg["allowed_emails"]):
            out.append(f"commit author or committer email: {person}")
    names = rc.git(root, "log", "--all", "--format=", "--name-only") or ""
    for p in sorted(set(n for n in names.splitlines() if n)):
        if rc.matches_any(p, cfg["private_paths"]) or rc.ENV_FILE_RE.search(p):
            out.append(f"private or env file in an old commit: {p}")
    patch = rc.git(root, "log", "--all", "-p", "--no-color", "--format=commit %h") or ""
    commit, seen = "?", set()
    for line in patch.splitlines():
        if line.startswith("commit "):
            commit = line.split()[1]
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for h in rc.scan_text_for_secrets(line, cfg):
            key = ("s", h)
            if key not in seen:
                seen.add(key)
                out.append(f"secret? added in {commit}: {h}")
        for e in rc.scan_text_for_emails(line, cfg):
            key = ("e", e)
            if key not in seen:
                seen.add(key)
                out.append(f"email added in {commit}: {e}")
    return out


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root")
    ap.add_argument("--config")
    ap.add_argument("--history", action="store_true", help="also scan every commit on every branch")
    ap.add_argument("--strict", action="store_true", help="fail on history findings too")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    cfg = rc.load_config(root, args.config)
    if rc.tracked_files(root) is None:
        print("Not a Git repository.")
        return 1

    current = scan_current(root, cfg)
    print(f"Pre-publish scan of {root}\n\nCurrent files: {len(current)} finding(s)")
    for f in current:
        print(f"  {f}")
    history: List[str] = []
    if args.history:
        history = scan_history(root, cfg)
        print(f"\nGit history (all branches): {len(history)} finding(s)")
        for f in history[:60]:
            print(f"  {f}")
        if len(history) > 60:
            print(f"  ... and {len(history) - 60} more")
        if history:
            print("\n  History findings stay visible in a public repository. Decide with the owner;"
                  " never rewrite history without their OK.")
    return 1 if current or (args.strict and history) else 0


if __name__ == "__main__":
    sys.exit(main())
