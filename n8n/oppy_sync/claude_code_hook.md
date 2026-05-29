# Hook Claude Code: Auto-sync de skills a Supabase

> **Estado**: instalado, opt-in (requiere `OPPY_SYNC_ENABLED=true` en `.env`)
> **Trigger**: cada vez que Claude Code hace `Write`/`Edit`/`MultiEdit` a un archivo en `.claude/skills/*.md`
> **Acción**: corre `tmp/oppy_agent/sync_skill.py` con el path del archivo, hace UPSERT a `agent_skills` en Supabase

## Flujo end-to-end

```
JP edita .claude/skills/X.md (via Claude Code o manualmente con Claude Code abierto)
         │
         ▼
Claude Code dispara PostToolUse hook (matcher: Write|Edit|MultiEdit)
         │
         ▼
.claude/hooks/on-skills-edit.ps1
   ├─ Filtra: ¿el archivo está en .claude/skills/*.md? Si no → exit 0
   ├─ Carga .env del proyecto (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
   ├─ Verifica OPPY_SYNC_ENABLED=true (opt-in)
   └─ Ejecuta python sync_skill.py <path>
         │
         ▼
sync_skill.py
   ├─ Lee el .md
   ├─ Extrae description del frontmatter o primer párrafo
   ├─ Calcula SHA-256
   ├─ Detecta tags heurísticos (di, bgc, ce, snowflake, etc.)
   ├─ Marca is_critical=true si es query-repository o truora-domain
   └─ UPSERT via PostgREST a agent_skills
         │
         ▼
Próxima conversación con Oppy → ve la skill actualizada
```

## Setup (una vez)

### 1. Crear `.env` en la raíz del proyecto

```bash
# c:\Users\Administrador\csm-center\.env
SUPABASE_URL=https://<tu-proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<tu service_role key>
OPPY_SYNC_ENABLED=true
```

> **IMPORTANTE**: este `.env` NO debe commitearse. Está fuera del repo
> `truora-mbr-app/`, así que git no lo ve, pero igual NUNCA lo
> pongas en cualquier carpeta versionada.

### 2. Aplicar la migration

En Supabase SQL Editor, correr:

```
truora-mbr-app/supabase/migrations/20260521170000_agent_skills_and_oppy_logs.sql
```

Verificar:

```sql
SELECT count(*) FROM public.agent_skills;        -- 0
SELECT count(*) FROM public.oppy_chat_logs;      -- 0
SELECT * FROM public.search_agent_skills('test'); -- vacio
```

### 3. Seed inicial de las 15 skills

```powershell
cd c:\Users\Administrador\csm-center
python tmp\oppy_agent\seed_all_skills.py
```

Output esperado:

```
[seed] Encontradas 15 skills en .claude\skills

[sync] ★ query-repository                          29,049 B  tags=['di', ...]
[sync] ★ truora-domain                             12,788 B  tags=['di', 'bgc', 'ce']
[sync] · botialertas-v2                            44,059 B  tags=[...]
[sync] · canvas-mbr                                44,526 B  tags=[...]
...
[done] 15 ok, 0 fail
```

Verificar:

```sql
SELECT name, size_bytes, is_critical, array_length(tags, 1) AS n_tags
FROM public.agent_skills
ORDER BY is_critical DESC, name;
```

### 4. Verificar el hook

Hacé un cambio trivial a cualquier skill (ej: agregar/quitar un espacio en
`.claude/skills/truora-domain.md`) usando Claude Code. Después:

```powershell
Get-Content C:\Users\Administrador\csm-center\tmp\oppy_agent\sync.log -Tail 5
```

Deberías ver una línea reciente tipo:

```
[2026-05-21 18:32:15] sync: C:\Users\...\truora-domain.md
[2026-05-21 18:32:16] result: [sync] ★ truora-domain  12,789 B  tags=[...]
```

Y en Supabase:

```sql
SELECT updated_at FROM public.agent_skills WHERE name = 'truora-domain';
-- Debe ser <30s atrás
```

## Opt-out / pausa

Para pausar el sync sin desinstalar:

```bash
# .env
OPPY_SYNC_ENABLED=false
```

O simplemente borra la línea — el script chequea exactamente `true`.

Cuando lo reactives, el próximo edit dispara el sync. Si querés re-sincronizar
todo después de una pausa, corré `seed_all_skills.py`.

## Troubleshooting

### "El hook no se dispara"

Verificá que `.claude/settings.json` exista con el contenido correcto. Claude Code
lee la config al arrancar — si la creaste mientras Claude Code estaba corriendo,
reiniciá la sesión.

### "El hook se dispara pero no llega a Supabase"

Mirá `tmp/oppy_agent/sync.log`. Cosas comunes:

- `.env` no existe o le faltan vars: el script sale silencioso. Crealo.
- `OPPY_SYNC_ENABLED` no es exactamente `true`: chequealo.
- Error HTTP 401 / 403: la `service_role` key es incorrecta o caducó.
- Error HTTP 404 al UPSERT: la migration no se aplicó. Aplicala.

### "Quiero ver qué hace el hook sin actualizar Supabase"

Comentá la línea `python.exe ... $filePath` en `.claude/hooks/on-skills-edit.ps1`
y agregá `Write-Host "would sync: $filePath"`. El log lo va a mostrar pero
no toca Supabase.

### "El skill se sincronizó pero el agente no lo ve"

El agente lee `agent_skills` en cada request — no tiene cache. Si después de
un sync exitoso el agente sigue sin verlo:

1. Confirmá en Supabase que `updated_at` se actualizó.
2. Confirmá que el Edge Function está deployada y responde
   (`curl <url>/health`).
3. Confirmá en n8n que el sub-workflow `Oppy Tool: read_skill` está apuntando
   al endpoint correcto.

## Notas de seguridad

- El hook NUNCA loggea el contenido completo del archivo, solo el path.
- `.env` con la service_role key vive solo en el filesystem local de JP.
  No se sube a GitHub (está en `csm-center/`, no en `truora-mbr-app/`).
- El script `sync_skill.py` usa `urllib` (stdlib) en vez de `requests` para
  no requerir `pip install` adicional.
- Si alguien edita una skill MANUALMENTE sin Claude Code abierto, el sync
  NO se dispara. Para sincronizar a mano:
  ```powershell
  python tmp\oppy_agent\sync_skill.py .claude\skills\<nombre>.md
  ```
