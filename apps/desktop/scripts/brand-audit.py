#!/usr/bin/env python3
"""
Post-build brand audit: scans compiled dist/ for user-visible "Hermes" references.

Exit 0 = clean, exit 1 = brand leak detected.

Usage:
    python3 scripts/brand-audit.py [dist_dir]

If dist_dir is omitted, defaults to ./dist.
"""
import sys
import os
import re
from pathlib import Path

# Patterns that are INTERNAL and should NOT be flagged
INTERNAL_PATTERNS = [
    # Electron bridge API
    re.compile(r'window\.hermesDesktop', re.I),
    re.compile(r'\.hermesDesktop', re.I),
    re.compile(r'^hermesDesktop\.', re.I),  # minified: window. is outside context window
    re.compile(r'hermesDesktop\.api\b', re.I),
    # Environment variables
    re.compile(r'HERMES_DESKTOP_\w+', re.I),
    re.compile(r'HERMES_HOME', re.I),
    re.compile(r'ACTIVE_HERMES_ROOT', re.I),
    # localStorage / sessionStorage keys
    re.compile(r'hermes[-_.](desktop|boot|onboard|update|backend|pane|focus|composer|sessions|native|save)', re.I),
    re.compile(r'hermes:.*(composer|pane|focus|session|native|save|backend)', re.I),
    # Asset filenames
    re.compile(r'hermes[-_.](frame|sprite|png|girl)', re.I),
    # API paths (internal routing)
    re.compile(r'/api/hermes/', re.I),
    # MIME types for drag & drop
    re.compile(r'application/x-hermes-(paths|session)', re.I),
    # BroadcastChannel / custom event names
    re.compile(r'hermes:(sessions|new-session|composer)', re.I),
    # Dataset attributes
    re.compile(r'data-hermes-(mode|theme)', re.I),
    re.compile(r'dataset\.hermes(Theme|Mode)', re.I),
    # Skill/toolset IDs (map to backend directory names)
    re.compile(r"'hermes-(agent|cli|cron|desktop|gateway|tui)'", re.I),
    # Console debug tags
    re.compile(r'\[hermes-terminal\]', re.I),
    re.compile(r'\[qiji-terminal\]', re.I),
    # Real filesystem paths (these ARE the actual locations)
    re.compile(r'~/\.hermes', re.I),
    re.compile(r'\.hermes/(config|logs|auth|profiles|skills|cron|memories)', re.I),
    re.compile(r'LOCALAPPDATA.*hermes', re.I),
    # CLI binary name (actual command is `hermes`)
    re.compile(r'`hermes (update|gateway|config|auth|tools|uninstall)`', re.I),
    # JS variable/type names in minified bundle
    re.compile(r'[Hh]ermes(ActiveSessions|Config|Gateway|Connection|ConfigRecord|ReadDir|ReadFile|Worktree|Ref|Media)', re.I),
    # Provider identifier
    re.compile(r"'nous'", re.I),
    # IPC channel prefix
    re.compile(r'hermes:(connection|saveImageFromUrl|readFileText)', re.I),
    # CSS class / partition
    re.compile(r'persist:hermes-preview', re.I),
    # Protocol handler
    re.compile(r'hermes-media://', re.I),
    re.compile(r'hermes:', re.I),  # general protocol/event prefix
    # Regex patterns in source
    re.compile(r'No.*Hermes.*provider', re.I),
    # Electron partition
    re.compile(r'partition.*hermes', re.I),
    # Internal sentinel values
    re.compile(r'__hermes_empty__', re.I),
    # Skill/toolset IDs (JSON keys mapping to backend directory names)
    re.compile(r'"hermes-[\w-]+"', re.I),
    re.compile(r"'hermes-[\w-]+'", re.I),
    re.compile(r'hermes-(agent|cli|cron|desktop|gateway|tui)[\w-]*', re.I),
    # URL protocol whitelist in regex
    re.compile(r'about\|hermes\)', re.I),
    # hermes): in protocol regex
    re.compile(r'hermes\)', re.I),
]

# Whitelist: these exact strings are allowed
WHITELIST = {
    'hermes',  # standalone variable references in minified JS
}


def is_internal(context: str) -> bool:
    """Check if a Hermes reference is internal (not user-visible)."""
    for pattern in INTERNAL_PATTERNS:
        if pattern.search(context):
            return True
    return False


def scan_file(filepath: Path) -> list:
    """Scan a file for user-visible Hermes references. Returns list of (line_no, context) tuples."""
    try:
        content = filepath.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []

    violations = []

    if filepath.suffix == '.js':
        # Minified JS - search with wide context window
        for match in re.finditer(r'.{0,80}([Hh]ermes).{0,80}', content):
            ctx = match.group(0)
            if not is_internal(ctx):
                violations.append(ctx.strip()[:150])
    else:
        # Line-based files (HTML, JSON, CSS)
        for i, line in enumerate(content.split('\n'), 1):
            if re.search(r'[Hh]ermes', line) and not is_internal(line):
                violations.append(f"L{i}: {line.strip()[:150]}")

    return violations


def main():
    dist_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('dist')

    if not dist_dir.exists():
        print(f"ERROR: dist directory not found: {dist_dir}")
        sys.exit(2)

    scan_extensions = {'.js', '.html', '.json', '.css'}
    all_violations = []
    files_scanned = 0

    for filepath in dist_dir.rglob('*'):
        if not filepath.is_file():
            continue
        if filepath.suffix not in scan_extensions:
            continue

        files_scanned += 1
        violations = scan_file(filepath)

        if violations:
            for v in violations:
                all_violations.append((filepath.relative_to(dist_dir), v))

    print(f"Brand audit: scanned {files_scanned} files in {dist_dir}")
    print(f"User-visible 'Hermes' references: {len(all_violations)}")

    if all_violations:
        print("\n*** BRAND LEAK DETECTED ***\n")
        for path, ctx in all_violations:
            print(f"  [{path}] {ctx}")
        print(f"\n{len(all_violations)} violation(s) must be fixed before release.")
        sys.exit(1)
    else:
        print("PASS - no user-visible Hermes references found.")
        sys.exit(0)


if __name__ == '__main__':
    main()
