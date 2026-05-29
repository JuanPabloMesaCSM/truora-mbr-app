#!/usr/bin/env python3
"""
seed_all_skills.py — Sincroniza TODAS las skills de .claude/skills/ a Supabase.

Es el "big bang" inicial. Para sync incremental, se usa sync_skill.py
(invocado por el hook PostToolUse de Claude Code).

USO:
  python seed_all_skills.py

Requiere las mismas env vars que sync_skill.py.
"""

import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # csm-center/
SKILLS_DIR = ROOT / ".claude" / "skills"


def main():
    if not SKILLS_DIR.exists():
        print(f"ERROR: {SKILLS_DIR} no existe", file=sys.stderr)
        sys.exit(1)

    md_files = sorted(SKILLS_DIR.glob("*.md"))
    if not md_files:
        print(f"[warn] No hay archivos .md en {SKILLS_DIR}")
        sys.exit(0)

    print(f"[seed] Encontradas {len(md_files)} skills en {SKILLS_DIR}\n")

    sync_script = Path(__file__).parent / "sync_skill.py"
    args = [sys.executable, str(sync_script)] + [str(p) for p in md_files]
    result = subprocess.run(args, env=os.environ.copy())
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
