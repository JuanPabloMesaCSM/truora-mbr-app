#!/usr/bin/env bash
# agent_test_webhooks.sh
# Tests para los webhooks del agente. Correr DESPUES de:
#   1. Importar los 2 workflows en n8n UI.
#   2. Activarlos (toggle ON, esquina superior derecha).
#   3. Configurar variable de entorno AGENT_SECRET en n8n.
#   4. Exportar AGENT_SECRET aca en tu shell:
#        export AGENT_SECRET="el-mismo-secret-que-pusiste-en-n8n"
#
# Uso: bash agent_test_webhooks.sh

set -u

N8N_HOST="${N8N_HOST:-https://n8n.zapsign.com.br}"
SECRET="${AGENT_SECRET:-}"

if [ -z "$SECRET" ]; then
  echo "ERROR: export AGENT_SECRET first (el mismo string que pusiste en n8n env vars)."
  exit 1
fi

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local expect_field="$2"   # 'ok' o 'error'
  local expect_value="$3"   # 'true' / 'false' / fragmento del error
  local response="$4"

  echo ""
  echo "── $name ──"
  echo "$response" | head -c 500
  echo ""

  case "$expect_field" in
    ok)
      if echo "$response" | grep -q "\"ok\":$expect_value"; then
        echo "✅ PASS"
        PASS=$((PASS + 1))
      else
        echo "❌ FAIL (esperaba ok=$expect_value)"
        FAIL=$((FAIL + 1))
      fi
      ;;
    error)
      if echo "$response" | grep -qi "$expect_value"; then
        echo "✅ PASS"
        PASS=$((PASS + 1))
      else
        echo "❌ FAIL (esperaba error con '$expect_value')"
        FAIL=$((FAIL + 1))
      fi
      ;;
  esac
}

# ============================================================
# Workflow 1: sf-agent-readonly
# ============================================================
echo "═══════════════════════════════════════════════════════"
echo " Tests sf-agent-readonly"
echo "═══════════════════════════════════════════════════════"

# Test 1.1: Query valido simple
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "SELECT CURRENT_DATE() AS today"}')
run_test "1.1 SELECT simple" ok true "$resp"

# Test 1.2: Query con LIMIT custom
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "SELECT 1 AS n UNION SELECT 2 UNION SELECT 3", "limit": 2}')
run_test "1.2 LIMIT inyectado (cap a 2)" ok true "$resp"

# Test 1.3: DROP rechazado
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "DROP TABLE TRUORA.PUBLIC.CLIENTES"}')
run_test "1.3 DROP rechazado" error "DML/DDL" "$resp"

# Test 1.4: INSERT rechazado
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "INSERT INTO foo VALUES (1)"}')
run_test "1.4 INSERT rechazado" error "DML/DDL" "$resp"

# Test 1.5: Multiple statements rechazado
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "SELECT 1; SELECT 2"}')
run_test "1.5 Multiple statements rechazado" error "Multiple statements" "$resp"

# Test 1.6: Secret invalido → 401
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: wrong-secret" \
  -d '{"sql": "SELECT 1"}')
run_test "1.6 Secret invalido rechazado" error "Unauthorized" "$resp"

# Test 1.7: SQL invalido (columna inexistente) → SF error capturado
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "SELECT columna_inexistente_xyz FROM TRUORA.PUBLIC.NO_EXISTE"}')
run_test "1.7 SQL invalido devuelve sf_error_detail" error "Snowflake execution failed" "$resp"

# Test 1.8: Query real contra IDENTITY_PROCESSES (sanity check de cred SF)
resp=$(curl -sS -X POST "$N8N_HOST/webhook/sf-agent-readonly" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"sql": "SELECT COUNT(*) AS total FROM TRUORA.PUBLIC.IDENTITY_PROCESSES WHERE CREATION_DATE >= CURRENT_DATE() - 7"}')
run_test "1.8 Query real DI (sanity check)" ok true "$resp"

# ============================================================
# Workflow 2: ch-agent-query
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " Tests ch-agent-query"
echo "═══════════════════════════════════════════════════════"

# Test 2.1: endpoint_id valido (DI)
resp=$(curl -sS -X POST "$N8N_HOST/webhook/ch-agent-query" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"endpoint_id": "di", "query_variables": {}}')
run_test "2.1 endpoint_id=di valido" ok true "$resp"

# Test 2.2: endpoint_id invalido
resp=$(curl -sS -X POST "$N8N_HOST/webhook/ch-agent-query" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{"endpoint_id": "fake_endpoint"}')
run_test "2.2 endpoint_id desconocido rechazado" error "Unknown endpoint_id" "$resp"

# Test 2.3: Sin endpoint_id
resp=$(curl -sS -X POST "$N8N_HOST/webhook/ch-agent-query" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $SECRET" \
  -d '{}')
run_test "2.3 endpoint_id missing rechazado" error "Missing required field" "$resp"

# Test 2.4: Secret invalido
resp=$(curl -sS -X POST "$N8N_HOST/webhook/ch-agent-query" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: wrong" \
  -d '{"endpoint_id": "di"}')
run_test "2.4 CH Secret invalido rechazado" error "Unauthorized" "$resp"

# ============================================================
# Resumen
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════════"
echo " Resumen: $PASS pass, $FAIL fail"
echo "═══════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
