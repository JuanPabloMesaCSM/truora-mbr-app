// agent_sf_readonly_validator.js (v2 — sin auth check, n8n cloud bloquea $env)
// Code node — workflow "sf-agent-readonly"
// Mode: Run Once for All Items, Language: JavaScript.
//
// La autenticacion la maneja el Webhook node via Header Auth credential
// (X-Agent-Secret). Este node solo valida el SQL.
//
// Recibe POST con body { sql, limit? }.
// Devuelve { ok, sql, applied_limit } cuando es seguro,
// o { ok: false, error } si falla validacion.

const item = $input.first().json;

// El webhook node pone el body de la request en $json.body.
const body = (item && item.body) ? item.body : item;

// --- 1. SQL presence ---
const sqlInput = (body && body.sql ? String(body.sql) : '').trim();
if (!sqlInput) {
  return [{ json: { ok: false, error: 'Missing required field: sql' } }];
}

// --- 3. Reject DML / DDL / privileged ---
const DANGEROUS = /\b(INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL|COPY|UNLOAD|PUT|REMOVE|USE\s+ROLE|USE\s+WAREHOUSE)\b/i;
if (DANGEROUS.test(sqlInput)) {
  return [{ json: { ok: false, error: 'DML/DDL not allowed. Read-only SELECT queries only.' } }];
}

// --- 4. Require SELECT ---
if (!/\bSELECT\b/i.test(sqlInput)) {
  return [{ json: { ok: false, error: 'Query must be a SELECT statement.' } }];
}

// --- 5. Reject multiple statements ---
// Remove a single trailing semicolon (legal) then reject any remaining one.
const noTrailingSemi = sqlInput.replace(/;\s*$/, '');
if (noTrailingSemi.indexOf(';') !== -1) {
  return [{ json: { ok: false, error: 'Multiple statements not allowed. Send one SELECT per call.' } }];
}

// --- 6. Force LIMIT ---
const HARD_MAX_LIMIT = 100;
let requestedLimit = HARD_MAX_LIMIT;
if (body && body.limit !== undefined) {
  const parsed = parseInt(body.limit, 10);
  if (!isNaN(parsed) && parsed > 0) {
    requestedLimit = Math.min(parsed, HARD_MAX_LIMIT);
  }
}

let sql = noTrailingSemi;
const limitMatch = sql.match(/\bLIMIT\s+(\d+)\b/i);
if (limitMatch) {
  // Cap existing LIMIT.
  const existing = parseInt(limitMatch[1], 10);
  if (existing > HARD_MAX_LIMIT) {
    sql = sql.replace(/\bLIMIT\s+\d+\b/i, 'LIMIT ' + HARD_MAX_LIMIT);
  }
} else {
  sql = sql + ' LIMIT ' + requestedLimit;
}

const t0 = Date.now();

return [{
  json: {
    ok: true,
    sql: sql,
    original_sql: sqlInput,
    applied_limit: requestedLimit,
    started_at: t0,
  }
}];
