# OXXEN Connect — Backup y restauración

## Datos que nunca deben perderse

Prioridad máxima:

1. `oxxen_connect_cards.id` y `public_id`;
2. `oxxen_connect_card_aliases`;
3. Customers y relaciones `cards.customer_id`;
4. Orders / Order Items;
5. activos NFC, UID y relaciones con pedido/item/card;
6. administradores, analytics y audit logs.

`public_id` y aliases históricos se restauran con sus valores originales. Nunca generar sustitutos para una tarjeta física existente.

## Capas de backup

1. snapshot/pre-change control antes de migraciones;
2. export externo con `npm run backup:export` desde entorno seguro;
3. workflow cifrado de GitHub Actions;
4. backups administrados de Supabase cuando el plan contratado los incluya.

Nunca usar como única copia una tabla dentro de la misma base.

## Export externo

`SUPABASE_SERVICE_ROLE_KEY` es exclusivamente server-side y nunca debe aparecer en `VITE_*`, frontend o repositorio.

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<secret> \
npm run backup:export
```

El script pagina y exporta:

- `oxxen_connect_customers`;
- `oxxen_connect_orders`;
- `oxxen_connect_cards`;
- `oxxen_connect_order_items`;
- `oxxen_connect_nfc_assets`;
- `oxxen_connect_card_aliases`;
- `oxxen_connect_admins`;
- `oxxen_connect_analytics_events`;
- `oxxen_connect_audit_logs`.

## Validación de restauración

Siempre iniciar en dry-run:

```bash
npm run backup:restore -- backups/<backup>
```

El validador comprueba, entre otros:

- `public_id` y aliases sin duplicados;
- IDs/códigos/números de Customers y Orders;
- Cards referencian Customers existentes cuando `customer_id` no es NULL;
- Order Items referencian Orders/Cards existentes;
- NFC IDs/códigos/números/UIDs únicos;
- chip types y estados NFC soportados;
- relaciones NFC → order/item/card coherentes.

Solo durante un incidente revisado:

```bash
npm run backup:restore -- backups/<backup> --apply
```

## Workflow cifrado

`.github/workflows/encrypted-backup.yml`:

1. valida secretos;
2. instala dependencias;
3. exporta el paquete operativo;
4. ejecuta el restore en dry-run;
5. cifra AES-256-CBC/PBKDF2;
6. sube únicamente el archivo cifrado.

Retención configurada:

- diario: 7 días;
- semanal: 28 días;
- mensual: 90 días.

Antes de S3.4 producción debe ejecutarse manualmente con reason `pre-migracion-s3.4`.

## Prueba posterior a restauración

Verificar al menos:

1. conteos de Customers/Orders/Cards/Items/NFC/aliases;
2. `public_id` de cada tarjeta física crítica;
3. URL canónica `/p/{public_id}`;
4. aliases históricos;
5. redirect histórico `oxxen-connect.vercel.app`;
6. login + OWNER MFA;
7. dashboard;
8. `/api/contact`;
9. analytics válido;
10. navegación Customer → Order → NFC → Card sin relaciones rotas.

No almacenar backups operativos sin cifrar en el repositorio o artefactos de larga duración.
