#!/usr/bin/env python3
"""
v2: Extrae SOLO la CTE chica que computa la metrica.

Heuristica:
- Si el bloqueN tiene aggregations (COUNT/SUM/AVG/ROUND) en su SELECT,
  ese es el snippet (la logica vive en bloqueN).
- Si bloqueN solo desenvuelve un upstream _agg CTE (no agreggations, solo
  SELECT x.*), entonces extraemos el upstream _agg.

Output: 1 archivo SQL con UPDATEs por cada bloque_id, con el CTE relevante
(solo el snippet, no runnable standalone — para documentacion / agente IA).
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SF_DIR = ROOT / "truora-mbr-app" / "supabase" / "snowflake"

WORKFLOWS = [
    ("aJTbPA3uXIHUUdjo", "report_builder_di.sql"),
    ("vtBaV8Nscn6aUKl0", "report_builder_bgc.sql"),
    ("JiPo0n1sEUQbJ2k4", "report_builder_ce_global.sql"),
    ("96t8Xl3WGpIaKCLb", "report_builder_ce_por_flujo.sql"),
]

OUTPUT = ROOT / "tmp" / "agent_seed_catalog" / "update_sql_templates_v2.sql"
PREVIEW = ROOT / "tmp" / "agent_seed_catalog" / "mapping_preview_v2.md"


CTE_DEF_RE = re.compile(r"^(\w+)\s+AS\s+\(", re.MULTILINE)
BLOQUE_LIT_RE = re.compile(r"'([^']+)'\s+AS bloque", re.MULTILINE)
# ROUND/NULLIF/COALESCE no cuentan como agg — solo transforman valores ya calculados.
# La logica real esta donde hay COUNT/SUM/AVG/MAX/MIN.
AGG_RE = re.compile(r"\b(COUNT|SUM|AVG|MAX|MIN)\s*\(", re.IGNORECASE)
FROM_JOIN_RE = re.compile(r"(?:FROM|JOIN)\s+(\w+)", re.IGNORECASE)


def find_cte_bodies(content: str) -> list[tuple[str, str, int, int]]:
    """Devuelve [(cte_name, body, body_start, body_end)] para todas las CTEs top-level."""
    out = []
    matches = list(CTE_DEF_RE.finditer(content))
    for i, m in enumerate(matches):
        name = m.group(1)
        body_start = m.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        body = content[body_start:body_end]
        out.append((name, body, body_start, body_end))
    return out


def extract_cte_definition(content: str, cte_name: str) -> str:
    """Devuelve el texto exacto de `cte_name AS (...)` incluyendo parentesis matching."""
    # Buscar la posicion del CTE
    pattern = re.compile(rf"^{re.escape(cte_name)}\s+AS\s+\(", re.MULTILINE)
    m = pattern.search(content)
    if not m:
        return ""
    start = m.start()
    # Avanzar caracter por caracter para encontrar el ) que cierra
    open_pos = content.find("(", m.end() - 1)
    depth = 0
    pos = open_pos
    while pos < len(content):
        ch = content[pos]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return content[start:pos + 1]
        pos += 1
    return content[start:]


def build_cte_index(bodies: list[tuple[str, str, int, int]]) -> dict[str, tuple[str, int]]:
    """name -> (body, position_index) para resolver dependencias."""
    return {n: (b, i) for i, (n, b, _, _) in enumerate(bodies)}


def cte_refs(body: str, all_cte_names: set[str]) -> set[str]:
    """CTEs referenciadas en este body via FROM/JOIN."""
    refs = set()
    for ref in FROM_JOIN_RE.findall(body):
        if ref in all_cte_names:
            refs.add(ref)
    return refs


def decide_metric_ctes(content: str, bloque_name: str, bloque_body: str,
                        cte_index: dict[str, tuple[str, int]]) -> list[str]:
    """
    Selecciona el conjunto de CTEs a mostrar para esta metrica.

    Estrategia:
    1) Si bloque_body tiene agregaciones COUNT/SUM/AVG/MAX/MIN -> arrancar con
       solo el bloque (la logica vive ahi).
    2) Si no -> agregar todas las CTEs upstream que el bloque referencia, MAS
       el propio bloque (para mostrar el ensamble).
    3) Cierre transitivo: por cada CTE incluida, agregar las que ella referencia
       (hasta llegar a tablas reales como TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS).
       Eso incluye params (donde viven los placeholders n8n) y los CTE base
       (donde se aplican los filtros con esos placeholders).
    4) Ordenar segun aparicion en el archivo (topologico natural).
    """
    all_names = set(cte_index.keys())

    seed: set[str] = {bloque_name}
    if not AGG_RE.search(bloque_body):
        seed |= cte_refs(bloque_body, all_names)
        # Filtrar otros bloques (no queremos arrastrar bloque2, bloque3, etc.)
        seed = {c for c in seed if not c.startswith("bloque") or c == bloque_name}

    # Cierre transitivo
    included = set(seed)
    queue = list(seed)
    while queue:
        cur = queue.pop()
        body, _ = cte_index[cur]
        for ref in cte_refs(body, all_names):
            if ref in included:
                continue
            # No incluir otros bloques (mantener foco en este)
            if ref.startswith("bloque") and ref != bloque_name:
                continue
            included.add(ref)
            queue.append(ref)

    # Ordenar por posicion en el archivo (params primero, bloque al final natural)
    ordered = sorted(included, key=lambda n: cte_index[n][1])
    return ordered


def parse_workflow(sql_path: Path) -> dict[str, dict]:
    """
    Devuelve {bloque_id: {cte_name, snippet}}
    """
    content = sql_path.read_text(encoding="utf-8")
    bodies = find_cte_bodies(content)

    # Build map: bloque_id -> bloque_cte_name
    bloque_to_cte = {}
    for name, body, _, _ in bodies:
        blk = BLOQUE_LIT_RE.search(body)
        if blk:
            bloque_to_cte[blk.group(1)] = name

    cte_index = build_cte_index(bodies)

    result = {}
    for blk_id, cte_name in bloque_to_cte.items():
        body = next(b for n, b, _, _ in bodies if n == cte_name)
        ctes = decide_metric_ctes(content, cte_name, body, cte_index)
        snippets = [extract_cte_definition(content, c) for c in ctes]
        # Concatenar con coma + blank line (formato SQL valido para CTE chain)
        # Anteponer 'WITH' para que sea sintacticamente reconocible y agregar
        # un SELECT final para que sea ejecutable copy-paste.
        chain = ",\n\n".join(s for s in snippets if s)
        snippet = f"WITH {chain}\n\nSELECT * FROM {cte_name};"
        result[blk_id] = {"ctes": ctes, "snippet": snippet}

    return result


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    sql_lines = [
        "-- =================================================================",
        "-- UPDATE queries_repository.sql_template — v2",
        "-- Solo la CTE de la metrica (no runnable, solo lectura)",
        "-- Generado por extract_metric_cte.py",
        "-- =================================================================",
        "",
        "BEGIN;",
        "",
    ]
    preview_lines = ["# Mapeo bloque_id -> CTE metrica\n"]

    for workflow_id, filename in WORKFLOWS:
        path = SF_DIR / filename
        if not path.exists():
            continue
        bloques = parse_workflow(path)
        preview_lines.append(f"\n## {filename} (`{workflow_id}`)\n")
        preview_lines.append("| bloque_id | CTEs incluidas | Tamano |")
        preview_lines.append("|---|---|---|")
        for blk_id in sorted(bloques.keys()):
            info = bloques[blk_id]
            size_kb = len(info["snippet"]) / 1024
            ctes_str = " + ".join(f"`{c}`" for c in info["ctes"])
            preview_lines.append(f"| `{blk_id}` | {ctes_str} | {size_kb:.1f} KB |")

            sql_lines.extend([
                f"-- {workflow_id} / {blk_id} -> {info['ctes']}",
                "UPDATE public.queries_repository",
                f"SET sql_template = $tpl${info['snippet']}$tpl$,",
                f"    actualizado_en = now()",
                f"WHERE workflow_id_origen = '{workflow_id}'",
                f"  AND bloque_id_origen = '{blk_id}';",
                "",
            ])

    sql_lines.append("COMMIT;")

    OUTPUT.write_text("\n".join(sql_lines), encoding="utf-8")
    PREVIEW.write_text("\n".join(preview_lines), encoding="utf-8")

    print(f"=> {OUTPUT}  ({OUTPUT.stat().st_size/1024:.1f} KB)")
    print(f"=> {PREVIEW}")


if __name__ == "__main__":
    main()
