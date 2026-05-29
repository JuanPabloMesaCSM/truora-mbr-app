#!/usr/bin/env python3
"""
sync_skill.py — Sincroniza una skill .md a la tabla agent_skills en Supabase.

USO:
  python sync_skill.py <path-al-md>
  python sync_skill.py .claude/skills/query-repository.md

Detecta name desde el filename, calcula hash SHA-256, extrae description
de la primera linea no-header del .md, y hace UPSERT a Supabase via PostgREST.

Requiere variables de entorno:
  SUPABASE_URL              ej https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY (service_role, NO anon, para bypasear RLS)

Las 2 skills criticas (query-repository, truora-domain) se marcan con is_critical=true
para que el AI Agent las pre-cargue siempre en el system prompt.

Este script lo invoca automaticamente el hook PostToolUse de Claude Code
cuando se edita una skill, pero tambien se puede correr a mano.
"""

import hashlib
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Skills que siempre se pre-cargan en el system prompt del agente Oppy.
# Las demas se consumen on-demand via tools read_skill / search_skills.
CRITICAL_SKILLS = {"query-repository", "truora-domain"}


def load_env_if_missing():
    """
    Si SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no estan en el ambiente, intenta
    cargarlas desde el primer .env encontrado en orden:
      1. csm-center/.env
      2. csm-center/.env.local
      3. csm-center/truora-mbr-app/.env.local  (donde JP las tiene hoy)
    """
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        return

    # Root del proyecto = csm-center/ = 2 niveles arriba de este archivo (tmp/oppy_agent/)
    root = Path(__file__).resolve().parents[2]
    candidates = [
        root / ".env",
        root / ".env.local",
        root / "truora-mbr-app" / ".env.local",
    ]
    for env_file in candidates:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$", line)
            if not m:
                continue
            key, val = m.group(1), m.group(2).strip()
            # Strip surrounding quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            os.environ.setdefault(key, val)
        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
            return


def extract_description(content: str, fallback: str) -> str:
    """
    Extrae la descripcion de una skill. Heuristica:
    1. Si tiene frontmatter '---\n... description: "..."\n... ---', usar esa.
    2. Si no, primer parrafo no-header (no empieza con #) y no vacio.
    3. Fallback: el nombre de la skill.
    """
    # Frontmatter
    fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if fm_match:
        fm_text = fm_match.group(1)
        desc_match = re.search(r'^\s*description\s*:\s*["\']?(.*?)["\']?\s*$', fm_text, re.MULTILINE)
        if desc_match:
            return desc_match.group(1).strip()[:500]

    # Primer parrafo no-header
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        if line.startswith(">"):
            continue
        if line.startswith("---"):
            continue
        return line[:500]

    return fallback


def extract_tags(content: str, name: str) -> list[str]:
    """
    Tags heuristicos: detectar productos (DI/BGC/CE), fuentes (Snowflake/ClickHouse),
    y temas mencionados en headers.
    """
    tags = set()
    low = content.lower()

    if re.search(r"\bdi\b|identidad|identity", low): tags.add("di")
    if re.search(r"\bbgc\b|background", low): tags.add("bgc")
    if re.search(r"\bce\b|whatsapp|customer engagement", low): tags.add("ce")
    if "snowflake" in low: tags.add("snowflake")
    if "clickhouse" in low: tags.add("clickhouse")
    if "supabase" in low: tags.add("supabase")
    if "n8n" in low: tags.add("n8n")
    if "report builder" in low or "mbr" in low: tags.add("report-builder")
    if "botialertas" in low or "boti alertas" in low: tags.add("botialertas")
    if "dashboard" in low: tags.add("dashboard")

    # Categoria desde el nombre
    if "queries" in name or "query" in name: tags.add("queries")
    if "skills" in name: tags.add("meta")

    return sorted(tags)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def upsert_skill(supabase_url: str, service_key: str, payload: dict) -> tuple[int, str]:
    """
    UPSERT via PostgREST. Usa resolution=merge-duplicates.
    """
    url = f"{supabase_url.rstrip('/')}/rest/v1/agent_skills"
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def sync_one(md_path: Path, supabase_url: str, service_key: str) -> bool:
    if not md_path.exists():
        print(f"[skip] {md_path} no existe", file=sys.stderr)
        return False
    if not md_path.is_file():
        print(f"[skip] {md_path} no es archivo", file=sys.stderr)
        return False

    name = md_path.stem
    content = md_path.read_text(encoding="utf-8")
    description = extract_description(content, fallback=name)
    tags = extract_tags(content, name)
    size_bytes = len(content.encode("utf-8"))
    hash_hex = sha256(content)
    is_critical = name in CRITICAL_SKILLS

    payload = {
        "name": name,
        "description": description,
        "content_md": content,
        "size_bytes": size_bytes,
        "sha256_hash": hash_hex,
        "tags": tags,
        "is_critical": is_critical,
        "updated_at": "now()",
    }
    # PostgREST no acepta "now()" como literal — quitamos esa key, Postgres aplica DEFAULT
    del payload["updated_at"]

    status, body = upsert_skill(supabase_url, service_key, payload)
    if status in (200, 201, 204):
        marker = "[*]" if is_critical else "   "
        print(f"[sync] {marker} {name:42s} {size_bytes:>7,d} B  tags={tags}")
        return True
    else:
        print(f"[FAIL] {name}: HTTP {status} — {body}", file=sys.stderr)
        return False


def main():
    if len(sys.argv) < 2:
        print("Uso: python sync_skill.py <path1.md> [path2.md ...]", file=sys.stderr)
        sys.exit(1)

    load_env_if_missing()

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("ERROR: faltan env vars SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        print("       Buscado en csm-center/.env, .env.local y truora-mbr-app/.env.local", file=sys.stderr)
        sys.exit(2)

    ok = 0
    fail = 0
    for arg in sys.argv[1:]:
        path = Path(arg)
        if sync_one(path, supabase_url, service_key):
            ok += 1
        else:
            fail += 1

    print(f"\n[done] {ok} ok, {fail} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
