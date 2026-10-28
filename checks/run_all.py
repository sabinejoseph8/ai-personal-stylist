#!/usr/bin/env python3
"""Portfolio package checks. Python standard library only.

Copy this file and prepublish_scan.py into the project's checks/ folder, with a
checks/portfolio.json (template in the portfolio-package skill). Then:

  python3 checks/run_all.py                      every check
  python3 checks/run_all.py --github owner/repo  also check README links on GitHub (needs the gh CLI)
  python3 checks/run_all.py --root PATH --config FILE   check another folder (read only)

It checks: required files, README sections and links, evaluation sections,
no em dashes, headline numbers agree across files, the case study PDF is one
page, private files are not tracked, and no secrets or personal emails in
tracked files. It never changes anything.
"""
from __future__ import annotations

import argparse
import fnmatch
import html
import json
import os
import re
import subprocess
import sys
import urllib.parse
import zlib
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

DEFAULTS = {
    "readme": "README.md",
    "required": ["README.md", "docs/how-to-run.md", "docs/evaluation.md", "docs/architecture.svg",
                 "docs/architecture.png", "docs/architecture.pdf", "docs/case-study.html", "docs/case-study.pdf"],
    # Each entry is one section; "|" separates words that count for it.
    "readme_sections": ["problem", "how it works|how a run works|architecture", "design|decision|tradeoff",
                        "quality|evaluation|measured|results|tested|scorecard", "limitation", "skills"],
    "evaluation": "docs/evaluation.md",
    "evaluation_sections": ["what good looks like", "how it is measured", "results", "caveats",
                            "what the results changed"],
    "style_files": ["README.md", "docs/*.md", "docs/*.html"],
    "case_study_pdf": "docs/case-study.pdf",
    "headline_numbers": {},
    "private_paths": ["interview-notes.md", "private/", "portfolio-private/"],
    "allowed_emails": ["users.noreply.github.com", "noreply@anthropic.com", "noreply@github.com",
                       "git@github.com", "example.com", "example.org"],
    "allowed_secret_markers": ["PLANTED", "FAKE", "EXAMPLE", "PLACEHOLDER", "YOUR_", "XXXX"],
    "skip_paths": ["node_modules/", "package-lock.json", ".git/"],
}

EM_DASH = "\u2014"
SECRET_PATTERNS = [
    ("Anthropic key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("OpenAI-style key", re.compile(r"\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_\-]{20,}")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("Supabase secret key", re.compile(r"\bsb_secret_[A-Za-z0-9_\-]{10,}")),
    ("JSON web token", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}")),
    ("Private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("Key or password assignment", re.compile(
        r"(?i)\b(?:api[_\-]?key|secret|token|password|passwd)\b[\"']?\s*[:=]\s*[\"']([^\"'\s]{12,})[\"']")),
]
EMAIL_RE = re.compile(r"(?<![\w.%+\-])[A-Za-z0-9][A-Za-z0-9._%+\-]*@[A-Za-z0-9][A-Za-z0-9.\-]*\.[A-Za-z]{2,}")
NOT_EMAIL_TLDS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "js", "ts", "tsx", "css", "mjs", "json"}
ENV_FILE_RE = re.compile(r"(^|/)\.env($|\.(?!example$)[^/]+$)")


# ---------------------------------------------------------------- helpers

def load_config(root: Path, config: Optional[str]) -> dict:
    cfg = dict(DEFAULTS)
    path = Path(config) if config else root / "checks" / "portfolio.json"
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
        cfg.update({k: v for k, v in data.items() if not k.startswith("_")})
        for key in ("allowed_emails", "allowed_secret_markers", "skip_paths"):
            cfg[key] = sorted(set(DEFAULTS[key]) | set(data.get(key, [])))
    cfg["headline_numbers"] = {k: v for k, v in cfg.get("headline_numbers", {}).items() if not k.startswith("_")}
    return cfg


def git(root: Path, *args: str) -> Optional[str]:
    try:
        out = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=True)
        return out.stdout
    except (OSError, subprocess.CalledProcessError):
        return None


def tracked_files(root: Path) -> Optional[List[str]]:
    out = git(root, "ls-files", "-z")
    if out is None:
        return None
    return [p for p in out.split("\0") if p]


def matches_any(path: str, patterns: List[str]) -> bool:
    for pat in patterns:
        if pat.endswith("/"):
            if path.startswith(pat) or ("/" + pat) in ("/" + path):
                return True
        elif fnmatch.fnmatch(path, pat) or fnmatch.fnmatch(os.path.basename(path), pat):
            return True
    return False


def read_text(path: Path) -> Optional[str]:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:4096]:
        return None
    return data.decode("utf-8", errors="replace")


def expand(root: Path, patterns: List[str]) -> List[Path]:
    seen: Dict[str, Path] = {}
    for pat in patterns:
        for p in sorted(root.glob(pat)):
            if p.is_file():
                seen[str(p)] = p
    return list(seen.values())


def headings(text: str) -> List[str]:
    out, fence = [], False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
            continue
        if not fence and re.match(r"^#{1,6}\s", line):
            out.append(line.lstrip("#").strip())
    return out


def missing_sections(heads: List[str], wanted: List[str]) -> List[str]:
    """Each wanted entry is one section; "|" separates words that count for it."""
    text = " \n ".join(h.lower() for h in heads)
    return [w for w in wanted if not any(alt.strip().lower() in text for alt in w.split("|"))]


def github_slug(title: str) -> str:
    s = re.sub(r"<[^>]+>", "", title).strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


def strip_code(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    return re.sub(r"`[^`\n]*`", "", text)


def markdown_links(text: str) -> List[str]:
    text = strip_code(text)
    links = re.findall(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)", text)
    links += re.findall(r"^\s*\[[^\]]+\]:\s*(\S+)", text, flags=re.M)
    return links


def pdf_page_count(path: Path) -> Optional[int]:
    """Pages in a PDF, from the page tree's /Count (also inside compressed object streams)."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    chunks = [data]
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end == -1:
            continue
        try:
            chunks.append(zlib.decompress(data[start:end]))
        except zlib.error:
            pass
    counts, pages = [], 0
    for c in chunks:
        for d in re.findall(rb"<<(?:[^<>]|<<[^<>]*>>)*>>", c):
            if re.search(rb"/Type\s*/Pages\b", d):
                m = re.search(rb"/Count\s+(\d+)", d)
                if m:
                    counts.append(int(m.group(1)))
            elif re.search(rb"/Type\s*/Page\b", d):
                pages += 1
    if counts:
        return max(counts)
    return pages or None


# ---------------------------------------------------------------- checks
# Each check returns (status, messages). Status is "pass", "fail" or "skip".

Result = Tuple[str, List[str]]


def check_required(root: Path, cfg: dict) -> Result:
    missing = [p for p in cfg["required"] if not (root / p).exists()]
    return ("fail" if missing else "pass", [f"missing: {p}" for p in missing])


def check_readme_sections(root: Path, cfg: dict) -> Result:
    text = read_text(root / cfg["readme"])
    if text is None:
        return "skip", ["no README"]
    missing = missing_sections(headings(text), cfg["readme_sections"])
    return ("fail" if missing else "pass", [f"no README heading mentions '{k}'" for k in missing])


def check_readme_links(root: Path, cfg: dict) -> Result:
    readme = root / cfg["readme"]
    text = read_text(readme)
    if text is None:
        return "skip", ["no README"]
    problems = []
    for link in markdown_links(text):
        if re.match(r"^[a-z][a-z0-9+.\-]*:", link, flags=re.I):
            continue  # http, https, mailto and other external links: checked with --github or by hand
        target, _, anchor = link.partition("#")
        target = urllib.parse.unquote(target)
        path = readme if not target else (readme.parent / target)
        if not path.exists():
            problems.append(f"broken link: {link}")
            continue
        if anchor and path.suffix.lower() == ".md":
            slugs = {github_slug(h) for h in headings(read_text(path) or "")}
            if anchor.lower() not in slugs:
                problems.append(f"no heading for anchor: {link}")
    return ("fail" if problems else "pass", problems)


def check_evaluation_sections(root: Path, cfg: dict) -> Result:
    text = read_text(root / cfg["evaluation"])
    if text is None:
        return "skip", [f"no {cfg['evaluation']}"]
    missing = missing_sections(headings(text), cfg["evaluation_sections"])
    return ("fail" if missing else "pass", [f"no evaluation heading mentions '{k}'" for k in missing])


def check_em_dashes(root: Path, cfg: dict) -> Result:
    problems = []
    for path in expand(root, cfg["style_files"]):
        text = read_text(path)
        if text is None:
            continue
        text = text.replace("&mdash;", EM_DASH).replace("&#8212;", EM_DASH)
        for n, line in enumerate(text.splitlines(), 1):
            if EM_DASH in line:
                problems.append(f"em dash: {path.relative_to(root)}:{n}")
    return ("fail" if problems else "pass", problems)


def check_headline_numbers(root: Path, cfg: dict) -> Result:
    numbers = cfg["headline_numbers"]
    if not numbers:
        return "skip", ["no headline_numbers in the config"]
    problems = []
    for number, files in numbers.items():
        for f in files:
            text = read_text(root / f)
            if text is None:
                problems.append(f"{f} missing (needed for {number})")
            elif number not in html.unescape(text):
                problems.append(f"'{number}' not found in {f}")
    return ("fail" if problems else "pass", problems)


def check_case_study_pages(root: Path, cfg: dict) -> Result:
    path = root / cfg["case_study_pdf"]
    if not path.exists():
        return "skip", [f"no {cfg['case_study_pdf']}"]
    n = pdf_page_count(path)
    if n is None:
        return "fail", ["could not count the pages"]
    return ("pass", []) if n == 1 else ("fail", [f"{cfg['case_study_pdf']} has {n} pages, not 1"])


def check_private_untracked(root: Path, cfg: dict) -> Result:
    files = tracked_files(root)
    if files is None:
        return "skip", ["not a Git repository"]
    problems = [f"tracked but private: {p}" for p in files if matches_any(p, cfg["private_paths"])]
    for pat in cfg["private_paths"]:
        local = root / pat.rstrip("/")
        if local.exists() and git(root, "check-ignore", "-q", pat.rstrip("/")) is None:
            problems.append(f"exists but not in .gitignore: {pat}")
    return ("fail" if problems else "pass", problems)


def scan_text_for_secrets(text: str, cfg: dict) -> List[str]:
    hits = []
    for name, rx in SECRET_PATTERNS:
        for m in rx.finditer(text):
            value = m.group(0)
            if any(mark.lower() in value.lower() for mark in cfg["allowed_secret_markers"]):
                continue
            hits.append(f"{name}: {value[:12]}...")
    return hits


def scan_text_for_emails(text: str, cfg: dict) -> List[str]:
    hits = []
    for m in EMAIL_RE.finditer(text):
        email = m.group(0).rstrip(".")
        tld = email.rsplit(".", 1)[-1].lower()
        if tld in NOT_EMAIL_TLDS:
            continue
        if any(email.lower().endswith(a.lower()) for a in cfg["allowed_emails"]):
            continue
        hits.append(email)
    return sorted(set(hits))


def tracked_text_files(root: Path, cfg: dict):
    for rel in tracked_files(root) or []:
        if matches_any(rel, cfg["skip_paths"]):
            continue
        text = read_text(root / rel)
        if text is not None:
            yield rel, text


def check_no_secrets(root: Path, cfg: dict) -> Result:
    files = tracked_files(root)
    if files is None:
        return "skip", ["not a Git repository"]
    problems = [f"tracked env file: {p}" for p in files if ENV_FILE_RE.search(p)]
    for rel, text in tracked_text_files(root, cfg):
        problems += [f"{rel}: {h}" for h in scan_text_for_secrets(text, cfg)]
    return ("fail" if problems else "pass", problems)


def check_no_personal_emails(root: Path, cfg: dict) -> Result:
    if tracked_files(root) is None:
        return "skip", ["not a Git repository"]
    problems = []
    for rel, text in tracked_text_files(root, cfg):
        problems += [f"{rel}: {e}" for e in scan_text_for_emails(text, cfg)]
    return ("fail" if problems else "pass", problems)


CHECKS: List[Tuple[str, Callable[[Path, dict], Result]]] = [
    ("Required files exist", check_required),
    ("README has the recruiter sections", check_readme_sections),
    ("README links resolve in the repository", check_readme_links),
    ("Evaluation has its sections in order of evidence", check_evaluation_sections),
    ("No em dashes in public writing", check_em_dashes),
    ("Headline numbers agree across files", check_headline_numbers),
    ("Case study PDF is exactly one page", check_case_study_pages),
    ("Private files are ignored and untracked", check_private_untracked),
    ("No secrets in tracked files", check_no_secrets),
    ("No personal email addresses in tracked files", check_no_personal_emails),
]


def check_github_links(root: Path, cfg: dict, repo: str) -> Result:
    """Every README link, checked against the pushed repository (gh CLI) or the web (status only)."""
    text = read_text(root / cfg["readme"]) or ""
    branch = (git(root, "rev-parse", "--abbrev-ref", "HEAD") or "main").strip()
    problems = []
    for link in markdown_links(text):
        target = link.partition("#")[0]
        if link.startswith(("http://", "https://")):
            m = re.match(r"https://github\.com/([^/]+/[^/]+)/(?:blob|tree)/([^/]+)/(.+)", target)
            if m:
                ok = subprocess.run(["gh", "api", f"repos/{m.group(1)}/contents/{m.group(3)}?ref={m.group(2)}",
                                     "--silent"], capture_output=True).returncode == 0
                if not ok:
                    problems.append(f"not on GitHub: {link}")
            continue
        if not target or re.match(r"^[a-z]+:", target):
            continue
        rel = os.path.normpath(os.path.join(os.path.dirname(cfg["readme"]), urllib.parse.unquote(target)))
        api_path = urllib.parse.quote(rel)
        ok = subprocess.run(["gh", "api", f"repos/{repo}/contents/{api_path}?ref={branch}", "--silent"],
                            capture_output=True).returncode == 0
        if not ok:
            problems.append(f"not on GitHub ({branch}): {link}")
    return ("fail" if problems else "pass", problems)


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", help="project folder (default: the folder above this script's folder)")
    ap.add_argument("--config", help="config JSON (default: <root>/checks/portfolio.json, else built-in defaults)")
    ap.add_argument("--github", metavar="OWNER/REPO", help="also check every README link on GitHub")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    cfg = load_config(root, args.config)
    checks = list(CHECKS)
    if args.github:
        checks.append(("README links work on GitHub", lambda r, c: check_github_links(r, c, args.github)))

    failed = skipped = 0
    print(f"Portfolio checks for {root}\n")
    for name, fn in checks:
        status, messages = fn(root, cfg)
        failed += status == "fail"
        skipped += status == "skip"
        print(f"[{status.upper():4}] {name}")
        for msg in messages[:25]:
            print(f"        {msg}")
        if len(messages) > 25:
            print(f"        ... and {len(messages) - 25} more")
    print(f"\nSUMMARY: {len(checks)} checks, {failed} failed, {skipped} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
