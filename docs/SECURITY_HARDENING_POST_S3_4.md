# OXXEN Connect — Security Hardening post-S3.4

Fecha de auditoría: 2026-09-01 (Perú)
Rama: `security-hardening-post-s3-4`
Base auditada: `main@faa7f4636fffa7063ba1beda8036fe2960761a67`
Estado: PRE-MERGE / NO PUBLICADO

## 1. Objetivo

Cerrar pendientes de seguridad posteriores a S3.4 sin cambiar el comportamiento funcional del MVP ni las identidades QR/NFC existentes.

Invariantes obligatorias: no modificar `public_id`, slugs, aliases, destinos NFC, QR físicos, redirects legacy ni datos reales.

## 2. Estado inicial y snapshot

Auditoría read-only de producción:

- Cards: 2
- Customers: 0
- Orders: 0
- Order Items: 0
- NFC Assets: 0
- `public_id` faltantes: 0
- grupos de `public_id` duplicados: 0
- grupos de alias duplicados: 0
- Cards sin alias actual reservado: 0
- Vercel producción: READY
- CI de `main`: success
- errores/fatales de runtime observados en últimas 24 h: 0

Se capturó un snapshot exacto `id + public_id + slug + aliases` de las 2 Cards antes de cualquier cambio. Ese snapshot deberá compararse byte-for-byte durante el rollout autorizado.

No se copiaron los identificadores permanentes al documento público para reducir exposición innecesaria.

## 3. Hallazgos clasificados

### MEDIO — Leaked Password Protection deshabilitado

Supabase Security Advisor reporta `auth_leaked_password_protection`.

**ACCIÓN MANUAL REQUERIDA.**

Las acciones Supabase disponibles en esta ejecución permiten consultar Advisors, SQL, logs, proyectos y documentación, pero no modificar la configuración de Supabase Auth. Por ello no se simula ni se declara activada.

Ruta de configuración documentada por Supabase:

1. Abrir el proyecto OXXEN Connect en Supabase Dashboard.
2. Ir a **Authentication → Providers → Email** / Password Security.
3. Activar **Leaked Password Protection**.
4. Guardar.
5. Volver a ejecutar Security Advisor y confirmar que desaparece `auth_leaked_password_protection`.

Supabase documenta que Leaked Password Protection consulta Pwned Passwords de HaveIBeenPwned y que la función está disponible en **Pro Plan y superior**. Si el proyecto está en un plan que no la incluye, será necesario cambiar de plan antes de poder activarla.

No se modificó ninguna otra política de contraseña sin justificación.

### BAJO → MEDIO — grants SQL de `authenticated` más amplios que la superficie de la aplicación

RLS está funcionando y bloquea usuarios sin rol, pero `authenticated` conservaba privilegios SQL de defensa en profundidad innecesarios:

- Cards: `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` además de SELECT/INSERT/UPDATE.
- Card aliases: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER aunque el frontend solo hace SELECT; las reservas históricas se gestionan por trigger.
- Analytics events: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER aunque la escritura pública pasa por `record_public_event()` y el admin consume lectura/agregados.
- Audit logs: TRUNCATE/REFERENCES/TRIGGER aunque la UI es de solo lectura.
- Sequences de Orders y NFC: USAGE directo aunque los números se generan dentro de RPCs SECURITY DEFINER.

La migración `20260902_security_hardening_post_s3_4.sql` revoca únicamente esos privilegios sobrantes. No modifica políticas RLS ni roles de negocio.

### INFORMATIVO — MFA/AAL2 funciona como fue diseñado

Estado observado:

- un único usuario Auth;
- un único administrador OWNER;
- factor TOTP verificado;
- OWNER con claims AAL1: 0 Cards visibles bajo RLS;
- OWNER con claims AAL2: Cards administrativas visibles;
- usuario `authenticated` sin fila administrativa: 0 filas visibles en las 8 tablas operativas.

Las policies `*_require_owner_aal2` son **RESTRICTIVE**, no permissive. Por tanto deben cumplirse además de las policies de acceso de rol y no crean un bypass por OR.

### INFORMATIVO — RPC SECURITY DEFINER públicos

`get_public_card(text)`
- Ejecutores intencionales: anon, authenticated.
- SECURITY DEFINER: necesario para ofrecer un perfil público acotado sin conceder SELECT anónimo de la tabla Cards.
- `search_path`: bloqueado a `''` en producción.
- SQL dinámico: no.
- Superficie: columnas públicas explícitas, solo Card activa/no archivada.
- Decisión: **ACCEPTED BY DESIGN**.

`get_public_card_status(text)`
- Ejecutores intencionales: anon, authenticated.
- SECURITY DEFINER: permite resolver estado sin enumeración directa.
- `search_path`: `''`.
- SQL dinámico: no.
- Decisión: **ACCEPTED BY DESIGN**.

`record_public_event(text,text,jsonb,text)`
- Ejecutores intencionales: anon, authenticated.
- SECURITY DEFINER: necesario porque anon no tiene INSERT directo en analytics.
- `search_path`: `''`.
- Controles: identifier 1..120, allowlist de eventos, metadata <= 2048 bytes, session id validado, perfil activo, visitor hash, límite por minuto y deduplicación de views.
- SQL dinámico: no.
- Decisión: **ACCEPTED BY DESIGN**.

### INFORMATIVO — RPC SECURITY DEFINER administrativos

`oxxen_connect_bulk_create_nfc_assets(...)`
- anon: no EXECUTE.
- authenticated: EXECUTE.
- validación interna: OWNER/ADMIN; OWNER exige AAL2; cantidad 1..500.
- `search_path`: `''`.
- Decisión: **ACCEPTED BY DESIGN**.

`oxxen_connect_reserve_nfc_assets(...)`
- anon: no EXECUTE.
- authenticated: EXECUTE.
- validación interna: OWNER/ADMIN; OWNER AAL2; pedido/item; cantidad exacta; `FOR UPDATE SKIP LOCKED`.
- `search_path`: `''`.
- Decisión: **ACCEPTED BY DESIGN**.

`oxxen_connect_create_order_with_items(...)`
- anon: no EXECUTE.
- authenticated: EXECUTE.
- validación interna: OWNER/ADMIN/SALES; OWNER AAL2; customer/items/precios/cards.
- transaccional y sin SQL dinámico.
- `search_path`: `''`.
- Decisión: **ACCEPTED BY DESIGN**.

`oxxen_connect_get_operational_dashboard()`
- anon: no EXECUTE.
- authenticated: EXECUTE.
- validación interna: cualquier rol administrativo reconocido; OWNER AAL2.
- devuelve agregados, no filas sensibles completas.
- `search_path`: `''`.
- Decisión: **ACCEPTED BY DESIGN**.

La migración de hardening vuelve a declarar explícitamente estos grants para evitar exposición por defaults futuros.

## 4. RLS

RLS está habilitado en las 8 tablas operativas:

- `oxxen_connect_cards`
- `oxxen_connect_card_aliases`
- `oxxen_connect_customers`
- `oxxen_connect_orders`
- `oxxen_connect_order_items`
- `oxxen_connect_nfc_assets`
- `oxxen_connect_analytics_events`
- `oxxen_connect_audit_logs`

No se modifica la matriz RBAC en este hardening.

La prueba read-only con una identidad `authenticated` sin rol administrativo devolvió 0 filas en todas ellas.

## 5. Grants post-hardening esperados

### anon

- cero acceso directo a tablas operativas;
- EXECUTE únicamente sobre RPC públicos necesarios para perfil/estado/analytics.

### authenticated

- Cards: SELECT, INSERT, UPDATE.
- Aliases: SELECT.
- Analytics: SELECT.
- Audit: SELECT.
- Customers: se mantienen los grants actuales necesarios para CRUD comercial.
- Orders / Order Items / NFC: no se amplían permisos en este hardening.
- RPC administrativos: EXECUTE sujeto a controles internos de rol/AAL2.

### service_role / postgres

No se reducen en esta tarea; son roles backend/propietario y no se exponen al navegador.

## 6. Hallazgo funcional fuera de alcance

Se detectó una inconsistencia previa de S3.4:

- `OrderEditor` intenta UPDATE directo sobre `oxxen_connect_orders` y UPDATE/INSERT directo sobre `oxxen_connect_order_items` para pedidos ya existentes;
- la matriz SQL observada en producción concede actualmente a `authenticated` solo SELECT sobre Orders/Order Items.

Esto puede impedir editar pedidos existentes aun cuando las RLS policies contemplen roles comerciales.

**No se corrige en este hardening**, porque solucionarlo ampliando grants sería un cambio funcional/de autorización y debe revisarse como tarea separada con su propia matriz RBAC y pruebas autenticadas.

## 7. Performance Advisor

Los warnings `auth_rls_initplan` permanecen en las policies AAL2.

La definición real ya usa subconsultas como `(select auth.uid())` / `(select auth.jwt())` y las policies AAL2 son RESTRICTIVE. No se modifica RLS solo para silenciar el linter.

Clasificación: **requiere revisión/benchmark separado; no bloquear este hardening**.

Los INFO sobre tablas históricas de backup sin PK e índices no utilizados no representan regresión de S3.4 y no se mezclan con esta tarea.

## 8. Backup / recuperación

Backup cifrado previo disponible y validado:

- GitHub Actions run: `33474086897` — success.
- Export operational backup: success.
- Restore package dry-run: success.
- Encrypted archive: success.
- Daily artifact: `9787535183`, no expirado al momento de la auditoría.
- Monthly artifact: `9787535438`, no expirado.
- SHA-256 común: `9b0eb60b67d11c299efc20c944b3ef45d281485114fccdde1d3f12d8445066ad`.

Antes de un rollout posterior debe volver a verificarse que haya un backup válido y reciente; si no, detener rollout.

## 9. Pruebas versionadas

- `src/lib/security-hardening-post-s3-4.test.ts`: contratos estáticos sobre grants, identidad y exposición RPC.
- `supabase/tests/security_hardening_post_s3_4.sql`: probe read-only/rollback para verificar grants, RPC y usuario authenticated sin rol después de aplicar la migración.

El probe SQL NO se ejecutará contra producción antes de autorización de rollout.

Gates del PR:

- `npm ci`
- lint
- typecheck
- unit tests
- build
- critical E2E

## 10. Advisors PRE

Security Advisor:

- WARN Leaked Password Protection disabled → **ACCIÓN MANUAL REQUERIDA**.
- WARN SECURITY DEFINER públicos → **ACCEPTED BY DESIGN**, necesarios para el producto y acotados.
- WARN SECURITY DEFINER administrativos para authenticated → **ACCEPTED BY DESIGN**, con checks internos y sin anon.

Performance Advisor:

- `auth_rls_initplan` → deuda técnica/revisión separada.
- backup schemas sin PK → informativo.
- índices sin uso → informativo dado el volumen actual.

## 11. Rollback propuesto

La migración solo contiene REVOKE/GRANT. Si un rollout autorizado mostrara una regresión, el rollback debe restaurar exclusivamente los grants previos documentados, sin tocar filas ni identidades.

Nunca restaurar DELETE/TRUNCATE por defecto sin demostrar que la aplicación lo necesita.

## 12. Estado de publicación

**NO PUBLICADO.**

No se aplicó `20260902_security_hardening_post_s3_4.sql` en producción. No se cambió Supabase Auth. No se hizo merge a `main`.

El siguiente gate es CI verde del PR Draft y comparación final read-only de invariantes. Después se entrega recomendación GO/NO-GO y se espera autorización explícita para merge/rollout.
