# OXXEN Connect — Backup y restauración

## Datos que nunca deben perderse

Prioridad máxima:

1. `oxxen_connect_cards.id`
2. `oxxen_connect_cards.public_id`
3. `oxxen_connect_card_aliases`
4. relación entre cada tarjeta física y su perfil

También se respaldan administradores, analytics y audit logs.

## Capas de backup

1. **Snapshot pre-migración en PostgreSQL** antes de cambios de esquema.
2. **Export externo** con `npm run backup:export` desde un entorno seguro.
3. **Backups administrados de Supabase** cuando el proyecto pase a un plan que los incluya.
4. Guardar las copias externas cifradas y fuera del repositorio público.

Nunca usar como única copia una tabla dentro de la misma base de datos.

## Export externo

Requiere credenciales server-side. `SUPABASE_SERVICE_ROLE_KEY` nunca debe ir en Vercel como `VITE_*`, en código fuente ni en un repositorio.

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret> \
npm run backup:export
```

El script exporta JSON paginado de:

- cards;
- aliases;
- admins;
- analytics;
- audit logs.

El directorio generado contiene un `manifest.json` con fecha y conteos.

## Validación de restauración

Primero ejecutar siempre en dry-run:

```bash
npm run backup:restore -- backups/<backup>
```

El script valida:

- `public_id` únicos;
- aliases únicos;
- aliases con tarjeta existente;
- analytics con tarjeta existente.

Solo en un incidente real y después de revisar el resultado:

```bash
npm run backup:restore -- backups/<backup> --apply
```

La restauración usa los IDs originales. **Nunca** regenerar `public_id` ni sustituir aliases históricos.

## Prueba posterior a restauración

Verificar al menos:

1. conteos de cards/aliases;
2. `public_id` de una tarjeta física conocida;
3. URL canónica `/p/{public_id}`;
4. alias histórico `/p/{alias}`;
5. QR histórico de `oxxen-connect.vercel.app` redirige al dominio nuevo;
6. login administrador;
7. dashboard;
8. `/api/contact`;
9. analytics registra un evento válido.

## Retención recomendada

Mientras el volumen sea pequeño:

- backup antes de cada migración;
- export externo semanal;
- cuando existan clientes que dependan diariamente del servicio, export diario y/o Supabase Pro con backup administrado.

No almacenar backups sin cifrar en GitHub Actions de un repositorio público.
