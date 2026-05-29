"""
seed_memories.py — backfill manual de memorias en agent_global_memory.

Lee memories.json (lista de objetos {tipo, titulo, contenido, creado_por, ...}),
para cada uno genera el embedding via la Edge Function oppy-skills-mcp/api/v1/embed
y lo inserta en public.agent_global_memory via PostgREST.

Uso:
  cd c:/Users/Administrador/csm-center
  python tmp/oppy_memories_seed/seed_memories.py

Lee credenciales de truora-mbr-app/.env.local:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY  (bypasea RLS — necesario porque RLS solo
    permite INSERT a admins via JWT; este script usa service_role direct).

Idempotencia: ANTES de procesar, lee los `titulo` ya existentes en la tabla y
saltea las memorias del JSON que ya esten ahi. Asi se puede re-correr sin
generar duplicados (util cuando una corrida previa fallo a mitad por rate limit).

Rate limit Voyage AI (free tier): 3 RPM. El script duerme ~22s entre embeddings
y reintenta hasta 3 veces con backoff en errores 429/502/503/504.
"""

import json
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("Falta requests. Instalalo con: pip install requests")
    sys.exit(1)

# ────────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────────

# Este script vive en truora-mbr-app/n8n/oppy_memories_seed/ → parents[1] = truora-mbr-app
REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / ".env.local"
MEMORIES_FILE = Path(__file__).resolve().parent / "memories.json"

VALID_TIPOS = {"user", "feedback", "project", "reference", "technical"}

# Rate limit: Voyage free tier = 3 RPM. Sleep entre embeddings.
SLEEP_BETWEEN_CALLS = 22       # segundos
MAX_RETRIES = 3                # reintentos por embedding ante 429/502/...
RETRY_BACKOFF_BASE = 30        # segundos, se multiplica por (attempt + 1)
RETRYABLE_STATUSES = {429, 502, 503, 504}


def load_env(path: Path) -> dict:
    """Lee .env.local crudo, devuelve dict de KEY=VALUE."""
    if not path.exists():
        print(f"[ERROR] No encuentro {path}")
        sys.exit(1)
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def get_existing_titles(supabase_url: str, service_key: str) -> set:
    """Trae todos los titulo ya guardados para saltarlos en re-runs."""
    url = f"{supabase_url}/rest/v1/agent_global_memory?select=titulo"
    resp = requests.get(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return {row["titulo"] for row in resp.json() if row.get("titulo")}


def get_embedding(text: str, supabase_url: str, service_key: str) -> list:
    """POST a la Edge Function. Devuelve el array de 1024 floats. Sin retry."""
    url = f"{supabase_url}/functions/v1/oppy-skills-mcp/api/v1/embed"
    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
        json={"text": text, "input_type": "document"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    emb = data.get("embedding")
    if not emb or not isinstance(emb, list):
        raise RuntimeError(f"Edge Function no devolvio embedding valido: {data}")
    return emb


def get_embedding_with_retry(text: str, supabase_url: str, service_key: str) -> list:
    """get_embedding con retry/backoff en codes retryables."""
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return get_embedding(text, supabase_url, service_key)
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else 0
            last_err = e
            if status in RETRYABLE_STATUSES and attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF_BASE * (attempt + 1)
                print(f" {status} retryable, esperando {wait}s...", end="", flush=True)
                time.sleep(wait)
                continue
            raise
    raise last_err  # nunca debería llegar aca, pero por las dudas


def insert_memory(memory: dict, embedding: list, supabase_url: str, service_key: str) -> dict:
    """POST a PostgREST. Devuelve el row insertado."""
    url = f"{supabase_url}/rest/v1/agent_global_memory"
    body = {
        "tipo": memory["tipo"],
        "titulo": memory["titulo"],
        "contenido": memory["contenido"],
        "origen": memory.get("origen", "manual"),
        "source_conversation_id": memory.get("source_conversation_id"),
        "creado_por": memory["creado_por"],
        "embedding": embedding,
    }
    resp = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "return=representation",
        },
        json=body,
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"PostgREST {resp.status_code}: {resp.text[:500]}")
    rows = resp.json()
    if not rows:
        raise RuntimeError("PostgREST devolvio array vacio")
    return rows[0]


def validate(memory: dict, idx: int) -> list:
    """Retorna lista de errores para una memoria (vacia = OK)."""
    errs = []
    for required in ("tipo", "titulo", "contenido", "creado_por"):
        if not memory.get(required):
            errs.append(f"[{idx}] falta campo requerido: {required}")
    if memory.get("tipo") not in VALID_TIPOS:
        errs.append(f"[{idx}] tipo invalido '{memory.get('tipo')}'. Debe ser uno de: {sorted(VALID_TIPOS)}")
    titulo = memory.get("titulo", "")
    if not (3 <= len(titulo) <= 200):
        errs.append(f"[{idx}] titulo debe tener 3-200 chars (actual: {len(titulo)})")
    contenido = memory.get("contenido", "")
    if not (10 <= len(contenido) <= 5000):
        errs.append(f"[{idx}] contenido debe tener 10-5000 chars (actual: {len(contenido)})")
    return errs


def main():
    env = load_env(ENV_FILE)
    supabase_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("[ERROR] Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local")
        sys.exit(1)

    if not MEMORIES_FILE.exists():
        print(f"[ERROR] No encuentro {MEMORIES_FILE}")
        sys.exit(1)

    memories = json.loads(MEMORIES_FILE.read_text(encoding="utf-8"))
    if not isinstance(memories, list):
        print("[ERROR] memories.json debe ser un array")
        sys.exit(1)

    # Validacion previa
    all_errs = []
    for i, m in enumerate(memories):
        all_errs.extend(validate(m, i))
    if all_errs:
        print("[ABORTO] Errores de validacion:")
        for e in all_errs:
            print(f"  {e}")
        sys.exit(1)

    # Idempotencia: saltar titulos ya existentes
    print("Consultando memorias ya existentes en Supabase...")
    try:
        existing = get_existing_titles(supabase_url, service_key)
        print(f"  {len(existing)} ya estan en la tabla, se saltearan si aparecen en el JSON.")
    except Exception as e:
        print(f"[WARN] No pude leer titulos existentes ({e}). Sigo igual (puede haber duplicados).")
        existing = set()

    pending = [m for m in memories if m["titulo"] not in existing]
    skipped = len(memories) - len(pending)
    print()
    print(f"Memorias en JSON: {len(memories)}. Ya existen: {skipped}. A procesar: {len(pending)}.")
    print(f"Rate limit Voyage free tier = 3 RPM → sleep {SLEEP_BETWEEN_CALLS}s entre embeddings.")
    print(f"Tiempo estimado: ~{len(pending) * SLEEP_BETWEEN_CALLS // 60}min.")
    print()

    ok_count = 0
    fail_count = 0
    failed_titulos = []

    for i, m in enumerate(pending):
        label = f"[{i + 1}/{len(pending)}] {m['titulo'][:60]}"
        try:
            text_to_embed = f"{m['titulo']}: {m['contenido']}"
            print(f"  {label}")
            print(f"    -> embedding...", end="", flush=True)
            emb = get_embedding_with_retry(text_to_embed, supabase_url, service_key)
            print(f" OK ({len(emb)} dim)")
            print(f"    -> insertando...", end="", flush=True)
            row = insert_memory(m, emb, supabase_url, service_key)
            print(f" OK (id={row['id']})")
            ok_count += 1
        except Exception as e:
            print(f" FALLO: {e}")
            fail_count += 1
            failed_titulos.append(m["titulo"])
        print()

        # Sleep antes de la siguiente call (no despues de la ultima)
        if i < len(pending) - 1:
            print(f"    (sleeping {SLEEP_BETWEEN_CALLS}s — rate limit Voyage free tier)")
            time.sleep(SLEEP_BETWEEN_CALLS)
            print()

    print("=" * 60)
    print(f"Resumen: {ok_count} OK, {fail_count} fallaron, {skipped} salteadas (ya existian).")
    if failed_titulos:
        print()
        print("Memorias fallidas (re-correr el script las reintenta automaticamente):")
        for t in failed_titulos:
            print(f"  - {t[:80]}")
    if fail_count == 0 and ok_count > 0:
        print()
        print("Verificalo en SQL Editor:")
        print("  SELECT tipo, titulo, creado_por, creado_en FROM public.agent_global_memory ORDER BY creado_en DESC;")


if __name__ == "__main__":
    main()
