// Code node "Set Params" del workflow Dashboard Metrics Detail.
//
// Lee el body del Webhook trigger y expone variables resueltas para los
// nodos siguientes (IFs por producto + Snowflake DI/BGC/CE + Stitch).
//
// Body esperado:
//   {
//     client_id_di:  string|null,
//     client_id_bgc: string|null,
//     client_id_ce:  string|null,
//     fecha_inicio:  "YYYY-MM-DD",
//     fecha_fin:     "YYYY-MM-DD",
//     productos:     ["DI","BGC","CE"]   // subset de los 3
//     email:         string              // quien dispara, para logs
//   }
//
// Devuelve UN solo item para que los nodos posteriores hagan
// $('Set Params').first().json.<campo>.
//
// Reglas n8n: nada de optional chaining, nada de fetch, sin arrow functions
// dentro de configs de nodos posteriores.

const body = ($input.first().json && $input.first().json.body)
  ? $input.first().json.body
  : ($input.first().json || {});

const clientIdDi  = body.client_id_di  || null;
const clientIdBgc = body.client_id_bgc || null;
const clientIdCe  = body.client_id_ce  || null;

const fechaInicio = body.fecha_inicio;
const fechaFin    = body.fecha_fin;
const productos   = Array.isArray(body.productos) ? body.productos : [];
const email       = body.email || 'unknown';

if (!fechaInicio || !fechaFin) {
  throw new Error('fecha_inicio y fecha_fin son requeridos');
}
if (productos.length === 0) {
  throw new Error('productos[] no puede estar vacio');
}

// Solo ejecutamos SF para productos pedidos Y con client_id no-null.
// El IF de cada rama lee estos flags.
const runDi  = productos.indexOf('DI')  !== -1 && !!clientIdDi;
const runBgc = productos.indexOf('BGC') !== -1 && !!clientIdBgc;
const runCe  = productos.indexOf('CE')  !== -1 && !!clientIdCe;

return [{
  json: {
    client_id_di:  clientIdDi,
    client_id_bgc: clientIdBgc,
    client_id_ce:  clientIdCe,
    fecha_inicio:  fechaInicio,
    fecha_fin:     fechaFin,
    productos:     productos,
    email:         email,
    run_di:        runDi,
    run_bgc:       runBgc,
    run_ce:        runCe
  }
}];
