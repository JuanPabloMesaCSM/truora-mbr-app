// catalog_sync_detect_drift.js
//
// Code node: compara el SQL extraido del MCP contra el snapshot guardado
// en Supabase y, si difiere, construye los payloads para:
//   1) INSERT en catalog_sync_alerts (uno por bloque del catalogo asociado)
//   2) PATCH workflow_snapshots SET drift_detected_at = now()
//   3) PATCH queries_repository SET drift_detected_at = now() WHERE workflow_id_origen = X
//
// Si no hay drift, outputea drift=false y los nodos posteriores (controlados
// por IF) lo saltan.
//
// Input (por item):
//   $json.workflow_id           string
//   $json.workflow_name         string
//   $json.sql_completo_remoto   string   -- viene del parse_mcp.js
//   $json.sql_hash_remoto       string   -- viene del parse_mcp.js
//
//   $json.snapshot_actual       array de 1 elemento:
//     [{
//        workflow_id, workflow_name, sql_completo, sql_hash, last_synced_at,
//        drift_detected_at,
//        queries_repository: [
//          { id, slug, bloque_id_origen, nombre, drift_detected_at },
//          ...
//        ]
//     }]
//
// El snapshot_actual viene de un HTTP GET previo a PostgREST:
//
//   GET /rest/v1/workflow_snapshots
//     ?workflow_id=eq.{{$json.workflow_id}}
//     &select=workflow_id,workflow_name,sql_completo,sql_hash,last_synced_at,drift_detected_at,
//             queries_repository(id,slug,bloque_id_origen,nombre,drift_detected_at)
//
// Output (por item):
//   workflow_id              string
//   workflow_name            string
//   drift                    boolean
//   alerts_payload           array of objects -- listo para INSERT batch
//   workflow_patch_url       string -- URL para PATCH workflow_snapshots
//   queries_patch_url        string -- URL para PATCH queries_repository
//   drift_payload            { drift_detected_at: ISO timestamp }
//   message                  string -- log humano
//   stats                    { queries_count, old_hash_prefix, new_hash_prefix }

const out = [];

for (const item of $input.all()) {
  const j = item.json;

  const workflowId   = j.workflow_id;
  const workflowName = j.workflow_name || '(sin nombre)';
  const newHash      = j.sql_hash_remoto;
  const newSql       = j.sql_completo_remoto;

  // Snapshot actual: array con 1 elemento del PostgREST con embed
  const snapshotArr = j.snapshot_actual;
  if (!Array.isArray(snapshotArr) || snapshotArr.length === 0) {
    // El workflow no existe en workflow_snapshots: no deberia pasar despues del seed
    // pero lo manejamos como caso especial: crear alert con query_id=null
    out.push({
      json: {
        workflow_id: workflowId,
        workflow_name: workflowName,
        drift: true,
        is_new_workflow: true,
        alerts_payload: [{
          query_id: null,
          workflow_id: workflowId,
          bloque_id: '_unknown',
          old_hash: null,
          new_hash: newHash,
          old_sql_snapshot: null,
          new_sql_snapshot: newSql,
          status: 'pending',
        }],
        workflow_patch_url: null,
        queries_patch_url: null,
        drift_payload: null,
        message: `Workflow ${workflowId} no tiene snapshot guardado. Crear primero en workflow_snapshots.`,
        stats: { queries_count: 0, old_hash_prefix: null, new_hash_prefix: newHash.slice(0, 12) },
      },
    });
    continue;
  }

  const snapshot = snapshotArr[0];
  const oldHash  = snapshot.sql_hash || '';
  const oldSql   = snapshot.sql_completo || '';
  const queries  = Array.isArray(snapshot.queries_repository) ? snapshot.queries_repository : [];

  const drift = newHash !== oldHash;

  if (!drift) {
    out.push({
      json: {
        workflow_id: workflowId,
        workflow_name: workflowName,
        drift: false,
        alerts_payload: [],
        workflow_patch_url: null,
        queries_patch_url: null,
        drift_payload: null,
        message: `OK ${workflowId} (${workflowName}): sin drift. hash=${newHash.slice(0, 12)}...`,
        stats: {
          queries_count: queries.length,
          old_hash_prefix: oldHash.slice(0, 12),
          new_hash_prefix: newHash.slice(0, 12),
        },
      },
    });
    continue;
  }

  // Drift detectado: armar payloads
  const driftIso = new Date().toISOString();

  // 1) Alerts (1 por query del catalogo asociada al workflow)
  let alertsPayload;
  if (queries.length === 0) {
    // Workflow remoto cambio pero no hay queries en el catalogo todavia
    alertsPayload = [{
      query_id: null,
      workflow_id: workflowId,
      bloque_id: '_unknown',
      old_hash: oldHash,
      new_hash: newHash,
      old_sql_snapshot: oldSql,
      new_sql_snapshot: newSql,
      status: 'pending',
    }];
  } else {
    alertsPayload = queries.map(q => ({
      query_id: q.id,
      workflow_id: workflowId,
      bloque_id: q.bloque_id_origen || '_unknown',
      old_hash: oldHash,
      new_hash: newHash,
      old_sql_snapshot: oldSql,
      new_sql_snapshot: newSql,
      status: 'pending',
    }));
  }

  // 2) URL para PATCH workflow_snapshots
  // Construida con base URL del HTTP node (config en n8n credentials).
  // El PATCH body es { drift_detected_at: driftIso } — NO se toca sql_completo
  // ni sql_hash (decision Modelo D: el snapshot conserva el estado conocido
  // hasta que el admin reconcilie).
  const workflowPatchUrl = `/rest/v1/workflow_snapshots?workflow_id=eq.${encodeURIComponent(workflowId)}`;
  const queriesPatchUrl  = `/rest/v1/queries_repository?workflow_id_origen=eq.${encodeURIComponent(workflowId)}`;

  out.push({
    json: {
      workflow_id: workflowId,
      workflow_name: workflowName,
      drift: true,
      is_new_workflow: false,
      alerts_payload: alertsPayload,
      workflow_patch_url: workflowPatchUrl,
      queries_patch_url: queriesPatchUrl,
      drift_payload: { drift_detected_at: driftIso },
      message: `DRIFT ${workflowId} (${workflowName}): ${alertsPayload.length} alert(s) creadas. hash ${oldHash.slice(0, 12)} -> ${newHash.slice(0, 12)}`,
      stats: {
        queries_count: queries.length,
        old_hash_prefix: oldHash.slice(0, 12),
        new_hash_prefix: newHash.slice(0, 12),
      },
    },
  });
}

return out;
