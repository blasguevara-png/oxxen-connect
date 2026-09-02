# OXXEN Connect — Security Hardening post-S3.4

Fecha de auditoría: 2026-09-01 (Perú)
Rama: `security-hardening-post-s3-4`
PR Draft: #22
Base auditada: `main@faa7f4636fffa7063ba1beda8036fe2960761a67`
Estado: PRE-MERGE / NO PUBLICADO

## 1. Objetivo

Cerrar pendientes de seguridad posteriores a S3.4 sin cambiar el comportamiento funcional del MVP ni las identidades QR/NFC existentes.

Invariantes: no modificar `public_id`, slugs, aliases, destinos NFC, QR físicos, redirects legacy ni datos reales.

## 2. Snapshot PRE y verificación final read-only

Producción antes y después del trabajo en rama sigue igual:

- Cards: 2
- Customers: 0
- Orders: 0
- Order Items: 0
- NFC Assets: 0
- `public_id` faltantes: 0
- grupos de `public_id` duplicados: 0
- grupos de alias duplicados: 0
- Cards sin alias actual reservado: 0
- snapshot exacto `id + public_id + slug + aliases`: idéntico PRE/FINAL
- `main`: continúa en `faa7f4636fffa7063ba1beda8036fe2960761a67`
- Vercel producción: sin cambios
- errores/fatales de runtime observados durante auditoría: 0

Los identificadores permanentes no se copian a este documento público para reducir exposición innecesaria.

## 3. Hallazgos

### MEDIO — Leaked Password Protection deshabilitado

Security Advisor sigue reportando `auth_leaked_password_protection`.

**ACCIÓN MANUAL REQUERIDA.**

El conector autorizado de Supabase disponible en esta ejecución no ofrece una acción para modificar configuración de Auth, por lo que no se simula ni se declara activada.

Ruta documentada por Supabase:

1. abrir OXXEN Connect en Supabase Dashboard;
2. ir a **Authentication → Providers → Email** / Password Security;
3. activar **Leaked Password Protection**;
4. guardar;
5. volver a ejecutar Security Advisor y confirmar que desaparece el warning.

Supabase documenta que esta protección consulta Pwned Passwords de HaveIBeenPwned y está disponible en **Pro Plan y superior**. Si el plan actual no la incluye, se requerirá un plan compatible antes de activarla.

No se modificaron otras políticas de contraseña sin justificación.

### BAJO → MEDIO — grants SQL de `authenticated` más amplios de lo necesario

RLS funciona, pero existían privilegios SQL sobrantes:

- Cards: DELETE/TRUNCATE/REFERENCES/TRIGGER además de SELECT/INSERT/UPDATE.
- Card aliases: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER aunque el frontend solo hace SELECT.
- Analytics: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER aunque escritura pública pasa por `record_public_event()`.
- Audit logs: TRUNCATE/REFERENCES/TRIGGER aunque UI es de solo lectura.
- secuencias Orders/NFC: USAGE directo aunque los números se generan dentro de RPCs SECURITY DEFINER.

Corrección preparada en `supabase/migrations/20260902_security_hardening_post_s3_4.sql`:

- Cards conserva SELECT/INSERT/UPDATE para el flujo real de edición y soft archive;
- aliases queda read-only para `authenticated`;
- analytics queda read-only para `authenticated`;
- audit queda read-only para `authenticated`;
- se elimina USAGE directo de secuencias Orders/NFC;
- customer sequence no se toca porque CustomerEditor sí crea Customers directamente;
- exposición de RPC públicos/admin se vuelve a declarar explícitamente.

La migración no contiene UPDATE/DELETE de filas y no toca `public_id`.

### INFORMATIVO — MFA/AAL2 validado

- 1 usuario Auth observado;
- 1 administrador OWNER;
- TOTP verificado;
- OWNER con AAL1: 0 Cards administrativas visibles bajo RLS;
- OWNER con AAL2: acceso administrativo esperado;
- `authenticated` sin rol: 0 filas visibles en las 8 tablas operativas.

Las policies `*_require_owner_aal2` son **RESTRICTIVE**, por lo que se combinan como condición adicional y no crean un bypass permisivo.

## 4. SECURITY DEFINER — decisión por RPC

### Públicos

`get_public_card(text)` — **ACCEPTED BY DESIGN**
- anon/authenticated: EXECUTE intencional;
- expone columnas públicas explícitas de Card activa/no archivada;
- no usa SQL dinámico;
- `search_path` bloqueado a `''` en producción;
- evita conceder SELECT anónimo directo a Cards.

`get_public_card_status(text)` — **ACCEPTED BY DESIGN**
- anon/authenticated intencional;
- devuelve estado acotado;
- sin SQL dinámico;
- `search_path=''`.

`record_public_event(text,text,jsonb,text)` — **ACCEPTED BY DESIGN**
- anon/authenticated intencional;
- anon no tiene INSERT directo en analytics;
- allowlist de eventos, límites de input, perfil activo, hash de visitante, rate limit y deduplicación;
- sin SQL dinámico;
- `search_path=''`.

### Administrativos

`oxxen_connect_bulk_create_nfc_assets(...)` — **ACCEPTED BY DESIGN**
- anon: no EXECUTE;
- authenticated: EXECUTE;
- OWNER/ADMIN interno; OWNER requiere AAL2; cantidad acotada;
- `search_path=''`.

`oxxen_connect_reserve_nfc_assets(...)` — **ACCEPTED BY DESIGN**
- anon: no EXECUTE;
- authenticated: EXECUTE;
- OWNER/ADMIN + OWNER AAL2; validación order/item; reserva concurrente controlada;
- `search_path=''`.

`oxxen_connect_create_order_with_items(...)` — **ACCEPTED BY DESIGN**
- anon: no EXECUTE;
- OWNER/ADMIN/SALES interno; OWNER AAL2;
- validación de customer/items/precios/cards y atomicidad PostgreSQL;
- sin SQL dinámico; `search_path=''`.

`oxxen_connect_get_operational_dashboard()` — **ACCEPTED BY DESIGN**
- anon: no EXECUTE;
- exige rol administrativo reconocido; OWNER AAL2;
- retorna agregados, no datasets completos;
- `search_path=''`.

## 5. RLS / RBAC

RLS está habilitado en:

- `oxxen_connect_cards`
- `oxxen_connect_card_aliases`
- `oxxen_connect_customers`
- `oxxen_connect_orders`
- `oxxen_connect_order_items`
- `oxxen_connect_nfc_assets`
- `oxxen_connect_analytics_events`
- `oxxen_connect_audit_logs`

No se cambia la matriz RBAC. `anon` mantiene cero privilegios directos sobre estas tablas.

## 6. Hallazgo funcional fuera de alcance

Se detectó una inconsistencia previa de S3.4:

- `OrderEditor` intenta UPDATE directo de `oxxen_connect_orders` y UPDATE/INSERT de `oxxen_connect_order_items` al editar pedidos existentes;
- producción concede actualmente a `authenticated` solo SELECT sobre Orders/Order Items.

Esto puede impedir editar pedidos existentes aunque existan policies RLS de negocio.

**No se corrige aquí**: ampliar grants sería una decisión funcional/RBAC y mezclaría hardening con autorización. Debe resolverse en una tarea separada con E2E autenticado.

## 7. Performance Advisor

Los warnings `auth_rls_initplan` continúan igual. Las policies reales ya incluyen subconsultas `(select auth.uid())` / `(select auth.jwt())` y son RESTRICTIVE.

Decisión: **requiere benchmark/revisión separada; no cambiar RLS solo para silenciar el Advisor**.

Los INFO de tablas históricas de backup sin PK e índices no utilizados son preexistentes y no constituyen regresión de este PR.

## 8. Backup / recuperación

Backup cifrado validado antes de cualquier eventual rollout:

- run `33474086897`: success;
- export: success;
- restore dry-run: success;
- archive cifrado: success;
- daily artifact `9787535183`: no expirado durante auditoría;
- monthly artifact `9787535438`: no expirado;
- digest común SHA-256 `9b0eb60b67d11c299efc20c944b3ef45d281485114fccdde1d3f12d8445066ad`.

Antes del rollout real debe volver a comprobarse frescura/validez del backup; si falla, detener.

## 9. Tests

Archivos añadidos:

- `src/lib/security-hardening-post-s3-4.test.ts`
- `supabase/tests/security_hardening_post_s3_4.sql`

CI PR #22, run `33575980630`:

- `npm ci`: PASS
- lint: PASS
- typecheck: PASS
- unit tests: PASS
- build: PASS
- critical E2E: PASS
- conclusión workflow: SUCCESS

Vercel preview del HEAD `1a60456fb2c3415217154c56b5c29f4beebc4a04`: READY.

El probe SQL se ejecutará únicamente después de aplicar la migración en un rollout expresamente autorizado; es read-only más claims locales y termina en ROLLBACK.

## 10. Advisors FINAL PRE-MERGE

Como no se publicó la migración, los Advisors de producción permanecen deliberadamente iguales al PRE:

Security:
- Leaked Password Protection disabled → **ACCIÓN MANUAL REQUERIDA**;
- RPC públicos SECURITY DEFINER → **ACCEPTED BY DESIGN**;
- RPC administrativos SECURITY DEFINER para authenticated → **ACCEPTED BY DESIGN**, con validación interna y anon cerrado.

Performance:
- `auth_rls_initplan` → revisión separada;
- backup schemas sin PK → informativo;
- índices sin uso → informativo al volumen actual.

Después de un rollout autorizado deberán ejecutarse otra vez y compararse contra este baseline.

## 11. Rollback

La migración solo modifica ACL mediante REVOKE/GRANT. Si aparece regresión durante rollout:

1. detener rollout;
2. no tocar filas ni identidades;
3. restaurar exclusivamente el grant requerido que se demuestre necesario;
4. volver a ejecutar probe, Advisors y smoke.

No restaurar DELETE/TRUNCATE por defecto.

## 12. Estado y recomendación

**NO PUBLICADO / NO MERGEADO.**

- `main` continúa intacto;
- no existe una migración `security_hardening_post_s3_4` aplicada en Supabase;
- Supabase Auth no fue modificado;
- Cards/public_id/slugs/aliases permanecen idénticos;
- PR Draft #22 está listo para revisión.

### Recomendación

**GO para merge + rollout controlado de la migración de mínimo privilegio**, sujeto a autorización explícita y al gate de backup inmediatamente antes de migrar.

Leaked Password Protection queda como **ACCIÓN MANUAL REQUERIDA** y debe activarse en Auth cuando el plan/configuración del proyecto lo permita. Su warning no debe ocultarse ni marcarse como resuelto hasta verificarlo con Security Advisor.

La inconsistencia de edición de Orders/Order Items debe abrirse como tarea funcional separada; no bloquea este hardening porque actualmente no existen Orders reales, pero debe resolverse antes de depender de edición operativa de pedidos existentes.
