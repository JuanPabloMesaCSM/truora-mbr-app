#!/usr/bin/env python3
"""
Churn por cliente — comisión equipo CSM.
Cruza el consumo facturable de ClickHouse (por TCI) con la base de clientes de
Supabase (TCIs + CSM) y marca churn por CLIENTE (caída >= 75% del consumo).

Lectura INTERINA con ventanas iguales (1-ene→26-feb vs 1-abr→27-may, 57 días c/u).
NO es el número final de comisión — ese sale al cerrar Q2 (después del ~4-jul).

Maneja la mugre conocida del roster Supabase:
  - DUPLICADO ADMIN: jdiaz / amarquez duplican toda la base (no son CSMs reales)
    -> se excluyen (memoria feedback_admin_duplicate_pattern).
  - soporte@ no es CSM comisionable -> se excluye.
  - Mismo TCI en >1 cliente o cliente repetido (ID 2/ID 3) -> dedup global de TCIs.
  - TCIs con espacios / \r\n / '' -> se limpian.

Uso:
  1. Exportar las 2 queries:
       - roster_supabase.json (o .csv)  -> Query 1
       - consumo_ch.csv       (o .json) -> Query 2 (client_id,consumo_p1,consumo_p2)
  2. Ponerlos en esta carpeta (o ajustar rutas).
  3. python churn_q1_vs_q2.py
  4. Salidas: churn_por_cliente.csv + churn_por_csm.csv + resumen en consola.

Requiere: pandas
"""

import sys
import json
import pandas as pd
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ---------- Config ----------
ROSTER_FILE  = "roster_supabase.json"   # acepta .json o .csv
CONSUMO_FILE = "consumo_ch.csv"          # acepta .csv o .json
OUT_CLIENTES = "churn_por_cliente.csv"
OUT_CSM      = "churn_por_csm.csv"
CAIDA_CHURN  = 0.75      # caída >= 75% => churn (consumo_p2 <= (1-0.75)*consumo_p1)
TCI_COLS     = ["client_id_di", "client_id_bgc", "client_id_ce"]
NULOS        = {"", "nan", "none", "null"}
# CSMs NO comisionables (admins que duplican la base + soporte):
EXCLUDE_EMAILS = {"jdiaz@truora.com", "amarquez@truora.com", "soporte@truora.com"}

def limpio(v):
    if v is None:
        return None
    s = str(v).strip()                   # quita espacios y \r\n
    return None if s.lower() in NULOS else s

def load_table(path):
    if path.lower().endswith(".json"):
        with open(path, encoding="utf-8-sig") as fh:
            return pd.DataFrame(json.load(fh))
    return pd.read_csv(path, sep=None, engine="python", encoding="utf-8-sig")

# ---------- Cargar ----------
roster_raw = load_table(ROSTER_FILE)
consumo    = load_table(CONSUMO_FILE)

consumo["client_id"]  = consumo["client_id"].astype(str).str.strip()
consumo["consumo_p1"] = pd.to_numeric(consumo["consumo_p1"], errors="coerce").fillna(0).astype(int)
consumo["consumo_p2"] = pd.to_numeric(consumo["consumo_p2"], errors="coerce").fillna(0).astype(int)
cons = consumo.groupby("client_id")[["consumo_p1", "consumo_p2"]].sum().to_dict("index")

# ---------- Excluir admins/soporte ----------
roster_raw["csm_email"] = roster_raw["csm_email"].astype(str).str.strip().str.lower()
excluidos = roster_raw[roster_raw["csm_email"].isin(EXCLUDE_EMAILS)]
roster    = roster_raw[~roster_raw["csm_email"].isin(EXCLUDE_EMAILS)].copy()

# Clientes que SOLO existían bajo un email excluido (quedan sin CSM comisionable)
nombres_reales = set(roster["nombre"])
sin_csm = sorted(set(excluidos["nombre"]) - nombres_reales)

# ---------- Cruce por cliente con dedup GLOBAL de TCIs ----------
# Orden determinístico para que el "primer dueño" de un TCI compartido sea estable.
roster = roster.sort_values(["nombre", "id"], kind="stable")

filas, tcis_claimed, conflictos = [], {}, []
for _, r in roster.iterrows():
    cliente = r.get("nombre")
    tcis = {limpio(r.get(c)) for c in TCI_COLS}
    tcis.discard(None)

    propios = set()
    for t in tcis:
        if t in tcis_claimed:
            conflictos.append((t, tcis_claimed[t], cliente))   # TCI ya usado por otro cliente
        else:
            tcis_claimed[t] = cliente
            propios.add(t)

    p1 = sum(cons.get(t, {}).get("consumo_p1", 0) for t in propios)
    p2 = sum(cons.get(t, {}).get("consumo_p2", 0) for t in propios)

    if p1 == 0:
        estado, var = ("sin_base", None)
    else:
        var = round((p2 - p1) * 100.0 / p1, 1)
        estado = "CHURN" if p2 <= (1 - CAIDA_CHURN) * p1 else "activo"

    filas.append({
        "cliente":       cliente,
        "csm":           limpio(r.get("csm_nombre")) or r.get("csm_email"),
        "csm_email":     r.get("csm_email"),
        "n_tcis":        len(propios),
        "consumo_p1":    p1,
        "consumo_p2":    p2,
        "variacion_pct": var,
        "estado":        estado,
    })

df = pd.DataFrame(filas).sort_values(
    ["estado", "variacion_pct"], ascending=[True, True], na_position="last"
)
df.to_csv(OUT_CLIENTES, index=False, encoding="utf-8-sig")

# ---------- Rollup por CSM ----------
def resumen(g):
    total    = len(g)
    sin_base = int((g["estado"] == "sin_base").sum())
    churn    = int((g["estado"] == "CHURN").sum())
    evaluables = total - sin_base
    return pd.Series({
        "clientes":   total,
        "evaluables": evaluables,
        "churn":      churn,
        "pct_churn":  round(churn * 100.0 / evaluables, 1) if evaluables else None,
        "consumo_p1": int(g["consumo_p1"].sum()),
        "consumo_p2": int(g["consumo_p2"].sum()),
    })

csm = (df.groupby("csm", dropna=False).apply(resumen)
       .reset_index().sort_values("churn", ascending=False))
csm.to_csv(OUT_CSM, index=False, encoding="utf-8-sig")

# ---------- Avisos de integridad ----------
huerfanos = sorted(set(consumo["client_id"]) - set(tcis_claimed))

print(f"\n== Resumen ({len(df)} clientes, excluidos {len(set(excluidos['nombre']))} por admin/soporte) ==")
print(f"  CHURN:    {int((df['estado']=='CHURN').sum())}")
print(f"  activo:   {int((df['estado']=='activo').sum())}")
print(f"  sin_base: {int((df['estado']=='sin_base').sum())}")
print(f"\n== Churn por CSM ==\n{csm.to_string(index=False)}")

if conflictos:
    print(f"\n[!]{len(conflictos)} TCI(s) compartidos entre clientes (se asignaron al 1º, revisar en Supabase):")
    for t, dueno, otro in conflictos[:15]:
        print(f"    {t}  ->  {dueno}  (también figuraba en: {otro})")
if sin_csm:
    print(f"\n[!]{len(sin_csm)} cliente(s) sin CSM comisionable (solo estaban bajo admin/soporte): {sin_csm}")
if huerfanos:
    print(f"\n[!]{len(huerfanos)} TCI(s) con consumo en CH pero sin cliente en el roster filtrado: {huerfanos[:10]}")
print(f"\nArchivos: {OUT_CLIENTES}  /  {OUT_CSM}")
