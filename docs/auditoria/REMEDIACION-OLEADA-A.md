# Remediación — Oleada A (bloqueantes de seguridad)

Fecha: 2026-11-18. Estado: **implementada**, pendiente de ejecutar los pasos de base de datos y despliegue que se indican abajo.

Cambios derivados de los hallazgos A-01 a A-04 de [HALLAZGOS.md](./HALLAZGOS.md).

---

## A-01 · Modo demo ya no es un fallback

**Código**
- `src/middleware.ts`: el panel redirige a `/admin/login?error=unconfigured` cuando Supabase no está configurado y no hay una habilitación explícita de demo. La bandera se calcula como `import.meta.env.DEV && import.meta.env.ALLOW_DEMO_MODE === 'true'`, por lo que en un build de producción siempre es `false`.
- `src/lib/admin.ts`: `isDemoMode` usa la misma condición; `getAdminSession()` devuelve `null` sin Supabase fuera de demo.
- `src/pages/admin/login.astro`: cualquier credencial solo inicia sesión en demo explícita; sin Supabase se muestra un error. Se añadió el mensaje para `?error=unconfigured`.
- `.env.example`: nueva variable `ALLOW_DEMO_MODE=false`.

**Uso en desarrollo**
```bash
# .env (solo local)
ALLOW_DEMO_MODE=true
```
Con Supabase configurado, la demo se ignora aunque la bandera esté en `true`.

---

## A-02 · `confirm_order()` solo para el backend

**Código / SQL**
- `db/schema.sql` y `db/setup.sql`: los `REVOKE ... FROM public/anon/authenticated` y `GRANT ... TO service_role` están ahora justo después de crear la función. La ruta de "un solo archivo" vuelve segura.
- `db/manual-payments.sql`: se conserva para instalaciones anteriores.
- `docs/admin-setup.md`: se actualizó la guía para dejar claro que `setup.sql` ya incluye el endurecimiento.

**Acción obligatoria en instalaciones existentes**
Ejecutar en Supabase → SQL Editor:
```sql
db/hardening-2026-11.sql
```
y confirmar que la consulta final solo devuelve `service_role` como `grantee`.

---

## A-03 · Secretos de Wompi en runtime

**Código**
- `src/lib/wompi.ts`: eliminado el singleton `wompiConfig`. Nueva función `getWompiConfig()` lee `cloudflare:workers` primero y usa `import.meta.env` solo como respaldo local. `isWompiConfigured()` pasó a ser `async`.
- `src/pages/api/webhooks/wompi.ts`: adaptado a `await isWompiConfigured()`.
- `.env.example`: nota indicando que en producción los secretos van en Cloudflare.

**Acción obligatoria en Cloudflare**
```bash
wrangler secret put WOMPI_PUBLIC_KEY
wrangler secret put WOMPI_INTEGRITY_SECRET
wrangler secret put WOMPI_EVENTS_SECRET
# WOMPI_PRIVATE_KEY solo si se llega a usar; hoy no se usa en el código
```
`WOMPI_PUBLIC_KEY` podría configurarse como variable normal, pero leerlo desde secretos también funciona. No poner los secretos en variables de build.

---

## A-04 · Abuso de checkout y formularios

**Código**
- `src/pages/api/checkout.ts`:
  - acepta `Idempotency-Key` (o `idempotencyKey` en el body), validada con `/^[A-Za-z0-9_-]{16,64}$/`;
  - devuelve el pedido existente (`duplicate: true`, HTTP 200) si la clave ya se usó, incluso en carrera (restricción `unique`, código `23505`);
  - limita a **5 pedidos por correo cada 10 minutos** con una consulta agregada en `orders` (devuelve HTTP 429);
  - el cliente recibe el 429 como error, no como falsa confirmación.
- `src/pages/checkout.astro`: genera una clave por intento de compra, la conserva en `sessionStorage`, la envía como cabecera y la limpia al confirmar el pedido.
- `src/components/NewsletterForm.astro`: honeypot + tiempo mínimo de llenado.
- `src/pages/eventos.astro`: tiempo mínimo de llenado (ya tenía honeypot).
- `db/schema.sql`, `db/setup.sql` y `db/hardening-2026-11.sql`: nueva columna `orders.idempotency_key text unique` e índice en `created_at`.

**Acción obligatoria en instalaciones existentes**
Ejecutar `db/hardening-2026-11.sql` (incluye la columna y el índice).

**Recomendación adicional (infraestructura)**
Añadir reglas de rate limiting en Cloudflare para `/api/checkout`, `/api/webhooks/wompi` y los formularios, usando `CF-Connecting-IP`. El control en base de datos cubre el caso sin acceso a la configuración del edge.

---

## Verificación realizada

| Comando | Resultado |
|---|---|
| `npm.cmd run check` | ✅ 0 errores, 0 advertencias |
| `npm.cmd run build -- --outDir <temp>` | ✅ build completado; 16 rutas pre-renderizadas |
| Búsqueda de nombres de secretos en el bundle cliente | ✅ sin coincidencias |

## Verificación pendiente (requiere despliegue)

1. Sin Supabase configurado, `GET /admin` debe redirigir a `/admin/login?error=unconfigured`.
2. Con Supabase configurado, un pedido duplicado con la misma `Idempotency-Key` debe devolver el mismo `orderNumber` y no crear una segunda fila.
3. El webhook debe responder `200/401/500` (no `503`) cuando los secretos de Wompi existan en el runtime de Cloudflare.
4. En Supabase, `routine_privileges` de `confirm_order` solo debe listar a `service_role`.
