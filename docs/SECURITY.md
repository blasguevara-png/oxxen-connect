# OXXEN Connect — Seguridad

## Autorización

- No existe registro público de administradores.
- Una sesión autenticada no basta: el usuario debe existir en `oxxen_connect_admins`.
- RLS protege cards, aliases, analytics y audit logs.
- `service_role` nunca se usa en frontend.

## RPC públicas

`get_public_card`, `get_public_card_status` y `record_public_event` son públicas por diseño porque un visitante debe poder abrir una tarjeta sin iniciar sesión. Se mantienen como `SECURITY DEFINER` para evitar habilitar lectura/INSERT anónimos directos sobre las tablas.

Controles compensatorios:

- permisos EXECUTE concedidos explícitamente solo a `anon`/`authenticated`;
- `search_path` endurecido;
- relaciones referenciadas con schema explícito;
- `get_public_card` devuelve una lista explícita de campos y solo perfiles activos/no archivados;
- analytics valida event type, metadata, session id y limita frecuencia;
- no se almacena IP en texto plano;
- el fingerprint usa una sal privada fuera del schema público.

El Database Linter de Supabase puede seguir mostrando una advertencia por el hecho de que una función `SECURITY DEFINER` sea ejecutable públicamente. En este caso es una exposición deliberada y acotada; no debe eliminarse sin rediseñar el acceso público.

## Contraseñas y MFA

- Activar **Leaked Password Protection** en Supabase Auth cuando la configuración/plan lo permita.
- Habilitar MFA/2FA para administradores antes de incorporar múltiples operadores con privilegios elevados.
- La tabla ya prepara roles `OWNER`, `ADMIN`, `EDITOR`, `SUPPORT`, `SALES`; la separación granular de políticas se hará sin convertir automáticamente a ningún usuario autenticado en administrador.

## Storage

- Bucket público solo para imágenes que deben verse en perfiles públicos.
- Escritura/eliminación únicamente para administradores autenticados.
- MIME permitidos: JPG, PNG, WEBP.
- límite del bucket: 2 MB.
- el frontend inspecciona la firma del archivo, decodifica, redimensiona y convierte a WEBP antes de subir.
- SVG de usuario no se acepta para reducir superficie de contenido activo.

## Secretos

Nunca registrar ni versionar:

- contraseñas;
- access/refresh tokens;
- service role keys;
- claves privadas;
- archivos `.env.local`.

Las variables `VITE_*` son públicas por naturaleza y solo deben contener valores publicables.
