# Matriz de hallazgos — Auditoría Iris Candles

**Fecha:** 2026-11-18 · **Compañero:** [INFORME.md](./INFORME.md)
**Convención:** `archivo:línea` referido a la raíz del repositorio.

> **Estado:** los hallazgos A-01 a A-04 (Oleada A) ya tienen corrección implementada.
> Los pasos de base de datos y despliegue están en [REMEDIACION-OLEADA-A.md](./REMEDIACION-OLEADA-A.md).
> Las fichas siguientes conservan el diagnóstico original como registro.

## Escala de severidad

| Nivel | Criterio |
|---|---|
| **Crítico** | Acceso no autorizado, elevación de privilegios o pérdida de integridad de datos explotable por un visitante. Bloquea el despliegue. |
| **Alto** | Funcionalidad de negocio rota en producción o abuso trivil con impacto económico/operativo. |
| **Medio** | Debilidad explotable en escenarios concretos o calidad insuficiente en lógica crítica. |
| **Bajo** | Hardening, accesibilidad fina, deuda técnica o SEO. |

---

## Matriz resumen

| ID | Sev. | Categoría | Hallazgo | Evidencia principal |
|---|---|---|---|---|
| A-01 | 🔴 Crítico | Auth | Modo demo otorga sesión `owner` si falta Supabase | `src/middleware.ts:29-32` |
| A-02 | 🔴 Crítico | DB | `confirm_order()` queda pública si solo se instala `setup.sql` | `db/setup.sql:247-271`, `db/manual-payments.sql:19-26` |
| A-03 | 🟠 Alto | Config/Pagos | Secretos Wompi leídos en build, no en runtime Cloudflare | `src/lib/wompi.ts:18-23` |
| A-04 | 🟠 Alto | Abuso | Checkout y formularios públicos sin rate limit ni idempotencia | `src/pages/api/checkout.ts:33-167`, `db/schema.sql:352-363` |
| A-05 | 🟡 Medio | Pagos | Checksum comparado sin tiempo constante y `properties` controlados por el body | `src/lib/wompi.ts:106-122` |
| A-06 | 🟡 Medio | DB | Un `admin` puede ascenderse a `owner` | `db/admin.sql:27-35,202-204` |
| A-07 | 🟡 Medio | DB | `profiles.role` editable por el propio usuario y documentación engañosa | `db/schema.sql:77,312-314,392-393` |
| A-08 | 🟡 Medio | Dependencias | 13 vulnerabilidades `high` (picomatch ReDoS) | `npm audit`, `package.json:12-26` |
| A-09 | 🟡 Medio | Cloudflare | Bindings `IMAGES`/`SESSION` esperados sin configuración en el repo | build log, sin `wrangler.*` |
| A-10 | 🟡 Medio | UX | Errores 500/503 del checkout se muestran como confirmación alternativa | `src/pages/checkout.astro:628-635` |
| A-11 | 🟡 Medio | Calidad | No hay tests ni CI | `package.json:6-11` |
| A-12 | 🔵 Bajo | Seguridad | Sin headers de seguridad (CSP, HSTS, X-Frame-Options) | `public/**`, build log |
| A-13 | 🔵 Bajo | A11y | Indicador de foco débil en campos del panel | `src/styles/admin.css:263-269` |
| A-14 | 🔵 Bajo | A11y | Botón "Quitar" sin nombre accesible por producto | `src/pages/carrito.astro:249` |
| A-15 | 🔵 Bajo | A11y | Modales sin focus trap ni restauración de foco | `src/layouts/AdminLayout.astro:263-283` |
| A-16 | 🔵 Bajo | SEO | Dominio provisional en canonical/sitemap | `astro.config.mjs:6-8`, `src/layouts/Base.astro:26` |
| A-17 | 🔵 Bajo | Deuda | `setup.sql` duplica `schema.sql` + `admin.sql` (riesgo de divergencia) | `db/setup.sql:1-5` |
| A-18 | 🔵 Bajo | Deuda | Variables de configuración declaradas pero sin uso real | `src/lib/wompi.ts:20`, `src/pages/admin/configuracion.astro:58,66` |
| A-19 | 🔵 Bajo | Logs | Errores de base de datos volcados a consola sin saneamiento | `src/pages/api/checkout.ts:125,145` |
| A-20 | 🔵 Bajo | Auth | Validación laxa del parámetro `next` | `src/pages/admin/login.astro:239-241` |
| A-21 | 🟡 Medio | Concurrencia | Descuento de stock con lectura-escritura no atómica | `src/pages/api/admin/orders/update.ts:59-96` |

---

## Fichas detalladas

### A-01 · Modo demo otorga sesión `owner` si falta Supabase — 🔴 Crítico

**Evidencia**
- `src/middleware.ts:5-12` — `DEMO_SESSION` con `role: 'owner'`.
- `src/middleware.ts:29-32` — si `!isSupabaseServerConfigured`, asigna esa sesión y llama a `next()` sin autenticar.
- `src/lib/admin.ts:7,75-90,120` — `isDemoMode = !isSupabaseConfigured`; `getAdminSession()` devuelve la sesión demo; `canAccess()` devuelve `true` para demo.
- `src/pages/admin/login.astro:103-113,159,254-255,305-309` — banner invitando a entrar, credenciales prellenadas y aceptación de cualquier credencial.

**Impacto**
Un despliegue con las variables de Supabase ausentes o mal nombradas deja `/admin` totalmente accesible con privilegios de propietaria. El panel muestra datos de ejemplo y, según `canAccess`, habilita todas las acciones de la UI. Las escrituras reales vía API sí se bloquean (`src/lib/admin-auth.ts:21-22` devuelve `null` sin Supabase → 401), por lo que el daño directo se limita a acceso no autorizado a la interfaz y a la información de demostración, pero es un fail-open peligroso y confuso.

**Recomendación**
1. En `src/middleware.ts`, si no está configurado Supabase y `import.meta.env.PROD`, responder `503` o redirigir a `/admin/login?error=unconfigured`. Nunca asignar `DEMO_SESSION`.
2. Habilitar demo solo con una bandera explícita: `import.meta.env.DEV && import.meta.env.ALLOW_DEMO_MODE === 'true'`.
3. Quitar el prellenado de correo/contraseña y el texto "cualquier credencial abre el panel" del login cuando no sea demo controlado.
4. Añadir una aserción en el pipeline de despliegue que verifique que `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` existan antes de publicar.

**Esfuerzo:** Bajo (1–2 h).

---

### A-02 · `confirm_order()` queda pública si solo se instala `setup.sql` — 🔴 Crítico

**Evidencia**
- `db/setup.sql:1-5` — se presenta como "Instalación completa (schema + admin)" y sugiere pegar un solo archivo (`docs/admin-setup.md:32-34`).
- `db/setup.sql:247-271` — crea `public.confirm_order(...)` como `security definer`; Postgres otorga `EXECUTE` a `PUBLIC` por defecto.
- `db/manual-payments.sql:19-26` — contiene los `REVOKE ... FROM public/anon/authenticated` y el `GRANT ... TO service_role`.
- `docs/admin-setup.md:36-42` — el paso de seguridad aparece solo en la ruta "por partes".

**Impacto**
Siguiendo la ruta recomendada de un solo archivo, cualquier visitante con la clave anónima puede invocar `/rest/v1/rpc/confirm_order` con el UUID de un pedido ajeno: la función marca el pedido como `approved`/`paid` y descuenta stock, todo con privilegios de `security definer` y sin verificar quién llama. Es una pérdida de integridad de pedidos e inventario.

**Recomendación**
1. Incorporar los `REVOKE`/`GRANT` inmediatamente después de la creación de la función en `db/schema.sql` **y** en `db/setup.sql`.
2. Convertir la ruta de un solo archivo en la única opción segura; si se mantiene la ruta por partes, marcar `manual-payments.sql` como obligatorio y no opcional.
3. Agregar al checklist de despliegue la consulta de verificación de `information_schema.routine_privileges` (ya incluida en `db/manual-payments.sql:28-33`) y exigir que solo aparezca `service_role`.
4. Revisar también los privilegios de `is_staff`, `is_owner` y `has_permission`; aunque solo devuelven booleanos, conviene limitar su ejecución.

**Esfuerzo:** Bajo (1 h).

---

### A-03 · Secretos Wompi leídos en build, no en runtime Cloudflare — 🟠 Alto

**Evidencia**
- `src/lib/wompi.ts:18-23` — `wompiConfig` se construye una vez con `import.meta.env.WOMPI_*`.
- `src/lib/wompi.ts:25-27,46-49,106-122` — `isWompiConfigured`, la firma y la verificación dependen de ese objeto.
- `src/lib/supabase-admin.ts:19-33` — el resto del backend sí lee `cloudflare:workers` y usa `import.meta.env` solo como respaldo de desarrollo.
- Build log: el adaptador Cloudflare inyecta valores en tiempo de compilación; `/api/webhooks/wompi.ts:32-34` responde `503` si `isWompiConfigured` es falso.

**Impacto**
En Cloudflare, los secretos configurados con `wrangler secret put` existen solo en runtime. Como `wompiConfig` se evalúa en build, el webhook verá cadenas vacías y responderá `503` permanentemente: ningún pago se confirmará automáticamente. Existe además el riesgo inverso: si alguien pone los secretos en variables de build para "arreglarlo", quedarán incrustados en el artefacto del servidor. El comportamiento es además engañoso porque `WOMPI_PRIVATE_KEY` se declara pero nunca se usa.

**Recomendación**
1. Crear `async function getWompiConfig()` que intente `cloudflare:workers` primero y use `import.meta.env` únicamente en desarrollo.
2. Pasar la configuración como parámetro a `integritySignature`, `buildWompiCheckoutUrl` y `verifyWompiEvent`, evitando el singleton de módulo.
3. Mantener `WOMPI_PUBLIC_KEY` públicamente expuesta (es una llave pública) y el resto como secretos de Cloudflare.
4. Añadir un check de arranque que registre qué variables están presentes (nunca sus valores) y alertar si falta `WOMPI_EVENTS_SECRET`.

**Esfuerzo:** Medio (3–4 h).

---

### A-04 · Checkout y formularios públicos sin rate limit ni idempotencia — 🟠 Alto

**Evidencia**
- `src/pages/api/checkout.ts:33-167` — endpoint público que escribe en `orders` y `order_items` con service role; sin límite de frecuencia, idempotencia ni verificación de humano.
- `db/schema.sql:352-363` — `quiz_public_insert`, `events_public_insert` y `newsletter_public_insert` con `with check (true)`.
- `src/components/NewsletterForm.astro:64-71` — inserción directa desde el navegador con la clave anónima.

**Impacto**
Un script puede crear pedidos falsos ilimitadamente (llenando la base de datos, contaminando el panel de pedidos y amplificando escrituras con service role) o saturar las tablas de marketing. No hay forma de distinguir un reintento legítimo de un duplicado: un timeout de red puede generar dos pedidos.

**Recomendación**
1. Aplicar rate limiting en Cloudflare (reglas por IP + cabecera `CF-Connecting-IP`) para `/api/checkout` y los formularios.
2. Añadir una columna `idempotency_key text unique` en `orders` y aceptarla desde el cliente para deduplicar reintentos.
3. Implementar honeypot o Cloudflare Turnstile en newsletter/quiz/eventos; mantener `with check(true)` pero con cuotas y validación de longitud en base.
4. Monitorizar tasa de creación de pedidos y alertar sobre anomalías.

**Esfuerzo:** Medio (4–6 h).

---

### A-05 · Checksum sin tiempo constante y `properties` controlados por el body — 🟡 Medio

**Evidencia**
- `src/lib/wompi.ts:106-122` — `expected.toLowerCase() === checksum.toLowerCase()`; `properties` se toma directamente del cuerpo recibido.
- `src/pages/api/webhooks/wompi.ts:43-50,69-86` — solo valida la firma y el `status`; no compara monto, moneda ni referencia con el pedido.

**Impacto**
La comparación `===` no es de tiempo constante (explotabilidad remota baja, pero evitable). Más relevante: la lista de campos firmados la define el propio mensaje, y el webhook no verifica que el importe aprobado coincida con `total_cop`. Si el secreto de eventos se filtrara, sería posible aprobar pedidos manipulando el evento.

**Recomendación**
1. Comparar con una Rutina de tiempo constante (p. ej., XOR acumulado sobre bytes, o HMAC verification vía Web Crypto con clave derivada).
2. Fijar en el servidor la lista esperada de `signature.properties` en lugar de aceptar la del body.
3. Validar que `transaction.reference`, `amount_in_cents` y `currency` coincidan con el pedido antes de llamar a `confirm_order`.
4. Rechazar explícitamente tipos de evento desconocidos.

**Esfuerzo:** Medio (3 h).

---

### A-06 · Un `admin` puede ascenderse a `owner` — 🟡 Medio

**Evidencia**
- `db/admin.sql:27-35` — `is_owner()` devuelve `true` para `role in ('owner','admin')`.
- `db/admin.sql:202-204` — `admin_users_owner_write` usa `is_owner()` tanto en `using` como en `with check`.

**Impacto**
La política se llama "owner_write" pero en realidad permite a cualquier `admin` insertar, actualizar y borrar filas de `admin_users`, incluido cambiar su propio rol a `owner` o crear nuevos administradores. El veto a que el personal se autoescala queda sin efecto para el rol `admin`.

**Recomendación**
1. Crear `is_admin()` distinto de `is_owner()` (este último solo `role = 'owner'`).
2. Usar `is_owner()` en las políticas de escritura de `admin_users`, `settings` y lectura de `audit_log`.
3. Restringir con un trigger qué columnas puede cambiar un no-owner (por ejemplo, impedir cambios de `role` propios).

**Esfuerzo:** Bajo (1–2 h).

---

### A-07 · `profiles.role` editable por el usuario y documentación engañosa — 🟡 Medio

**Evidencia**
- `db/schema.sql:77` — `profiles.role` acepta `'admin'`.
- `db/schema.sql:312-314` — `profiles_own_update` permite actualizar la fila propia sin restringir columnas.
- `db/schema.sql:392-393` — la nota indica promover al primer usuario con `update profiles set role = 'admin'`.

**Impacto**
Cualquier usuario autenticado puede asignarse `role = 'admin'` en su perfil. Hoy la autorización real vive en `admin_users`, así que no hay escalada directa al panel, pero los datos quedan inconsistente y la documentación induce a error: un operador que siga la nota creerá que dio acceso y no será así.

**Recomendación**
1. Eliminar el valor `'admin'` de `profiles.role` o evitar que sea fuente de autorización; dejar `admin_users` como único origen de verdad.
2. Restringir la columna `role` con `revoke update(role) on profiles from authenticated` o un trigger que impida cambios.
3. Actualizar la nota de `db/schema.sql` y `docs/admin-setup.md` para apuntar siempre a `admin_users`.

**Esfuerzo:** Bajo (1 h).

---

### A-08 · 13 vulnerabilidades `high` en dependencias — 🟡 Medio

**Evidencia**
- `npm audit`: 13 avisos `high` por `picomatch` (GHSA-fc5q-39xc-vjpf, ReDoS en extglobs), propagados por `anymatch`, `tinyglobby`, `vite`, `@astrojs/internal-helpers`, `@astrojs/check` y `astro`.
- `package.json:12-26` — Astro `^7.4.11`, Supabase `^2.119.0`, TypeScript `^6.0.3`.

**Impacto**
La vulnerabilidad afecta principalmente a la toolchain de build/desarrollo (glob matching), no a una ruta HTTP del sitio publicado. Aun así, incrementa la superficie de ataque en CI y entornos de desarrollo, y el arreglo sugerido por npm (`astro@5.3.0`) es un downgrade con cambios rompientes.

**Recomendación**
1. No ejecutar `npm audit fix --force` sin evaluar el downgrade.
2. Suscribirse al advisory y aplicar `overrides` de `picomatch` en cuanto exista versión parcheada compatible.
3. Añadir `npm audit --audit-level=high` a CI como gate informativo y mantener `package-lock.json` actualizado.

**Esfuerzo:** Bajo (1 h de análisis + seguimiento).

---

### A-09 · Bindings `IMAGES`/`SESSION` sin configuración en el repo — 🟡 Medio

**Evidencia**
- Build log: `@astrojs/cloudflare` anuncia "Enabling image processing with Cloudflare Images for production with the `IMAGES` Images binding" y "Enabling sessions with Cloudflare KV with the `SESSION` KV binding".
- No existe `wrangler.toml`, `wrangler.json` ni `wrangler.jsonc` en el árbol (solo el directorio local `.wrangler/`).

**Impacto**
Si el despliegue se hace con Wrangler y no se han creado esos bindings en el panel de Cloudflare, el procesamiento de imágenes y las sesiones pueden fallar en producción o directamente impedir el despliegue. Es una dependencia de entorno no documentada.

**Recomendación**
1. Añadir un archivo de configuración de Wrangler con los bindings `IMAGES` y `SESSION` (o un KV compatible) para el entorno de producción.
2. Documentar en `docs/` los pasos de creación de esos recursos y el nombre exacto esperado por el adaptador.
3. Validar con un despliegue a un entorno de staging antes de publicar.

**Esfuerzo:** Medio (2–3 h).

---

### A-10 · Errores del checkout mostrados como confirmación alternativa — 🟡 Medio

**Evidencia**
- `src/pages/checkout.astro:605-635` — solo `response.ok && data.orderNumber` y `status === 400` tienen manejo específico; cualquier otro caso (500, 503, error de red) llama a `showDone(null, true)`.
- `src/pages/checkout.astro:536-546` — ese estado dice "Pedido listo para enviar" y muestra un resumen.

**Impacto**
Si el backend no está disponible (justamente lo que ocurre con A-03 o con Supabase sin configurar), el cliente ve una pantalla de éxito aparente y puede creer que su pedido fue registrado. El carrito no se limpia en ese caso, pero el mensaje es engañoso y deja al usuario sin un camino claro de reintento.

**Recomendación**
1. Distinguir `503` (servicio no disponible) y `500` (error interno) de un fallo de red, con mensajes distintos y botón de reintento.
2. Reservar `showDone` para el caso confirmado; para el fallback usar un estado explícitamente denominado "No pudimos registrar tu pedido".
3. Conservar el borrador del formulario (ya se hace) y avisar de que el carrito sigue guardado.

**Esfuerzo:** Bajo (1–2 h).

---

### A-11 · No hay tests ni CI — 🟡 Medio

**Evidencia**
- `package.json:6-11` — solo `dev`, `build`, `preview`, `check`; no existen `test`, `lint`, `test:e2e` ni configuración de CI en el repo.

**Impacto**
La lógica crítica (cálculo de precios, firma de integridad, validación del webhook, autorización del panel) carece de regresiones automatizadas. Un cambio innocuo en `order-pricing.ts` o `wompi.ts` puede romper cobros sin que nadie lo detecte.

**Recomendación**
1. Añadir Vitest y pruebas unitarias prioritarias: `priceOrderItems` (cantidades, SKUs inválidos, topes), `integritySignature`/`verifyWompiEvent` (vectores conocidos, campos manipulados).
2. Pruebas de integración para `/api/checkout` con Supabase simulado.
3. Pipeline de CI con `astro check`, `npm test` y `npm audit --audit-level=high`.

**Esfuerzo:** Medio (1–2 días).

---

### A-12 · Sin headers de seguridad — 🔵 Bajo

**Evidencia**
- `public/` contiene solo `favicon.svg`, logo, OG y fuentes; no hay `_headers`.
- Build log: el adaptador inyecta únicamente `Cache-Control` inmutable para `/_astro/*`.

**Recomendación**
Añadir `public/_headers` (o reglas de Cloudflare) con `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y `Strict-Transport-Security`. Validar que la CSP no rompa los scripts inline de Astro (usar nonces o ajustar `script-src`).

**Esfuerzo:** Medio (2–4 h por ajuste de CSP).

---

### A-13 · Indicador de foco débil en campos del panel — 🔵 Bajo

**Evidencia**
- `src/styles/admin.css:263-269` — `outline: none` reemplazado por `box-shadow: 0 0 0 3px rgba(6, 75, 59, 0.08)`.

**Impacto**
El anillo de foco tiene muy poco contraste; puede no cumplir WCAG 2.4.11/1.4.11 en pantallas claras o con baja visión. El sitio público sí define `:focus-visible` correcto (`src/styles/global.css:68-70`).

**Recomendación**
Usar `:focus-visible { outline: 2px solid var(--color-jade-700); outline-offset: 2px; }` en los campos del panel, manteniendo el `box-shadow` solo como refuerzo.

**Esfuerzo:** Bajo (30 min).

---

### A-14 · Botón "Quitar" sin nombre accesible por producto — 🔵 Bajo

**Evidencia**
- `src/pages/carrito.astro:249-251` — `<button ... data-remove>Quitar</button>` sin `aria-label`.

**Impacto**
En un carrito con varios artículos, un lector de pantalla anuncia repetidamente solo "Quitar", sin indicar qué producto se eliminará.

**Recomendación**
Añadir `aria-label="Quitar ${line.collectionName} ${line.size.label} del carrito"`, con el mismo patrón ya usado en los botones `+/−` (`carrito.astro:237,247`).

**Esfuerzo:** Bajo (15 min).

---

### A-15 · Modales sin focus trap ni restauración — 🔵 Bajo

**Evidencia**
- `src/layouts/AdminLayout.astro:263-283` — `openAdminModal` enfoca el primer campo, pero no atrapa el foco ni lo devuelve al cerrar; no se marca el contenido de fondo como `inert`.
- Los modales sí declaran `role="dialog"`, `aria-modal="true"` y `aria-labelledby` (p. ej. `src/pages/admin/pedidos.astro:248-250`).

**Impacto**
Con teclado, el foco puede salirse del modal hacia la página de fondo; al cerrar, el foco queda perdido.

**Recomendación**
Implementar un ciclo de foco dentro del modal, restaurar el foco al elemento que lo abrió y aplicar `inert` al contenedor principal mientras el modal esté abierto.

**Esfuerzo:** Medio (2–3 h).

---

### A-16 · Dominio provisional — 🔵 Bajo

**Evidencia**
- `astro.config.mjs:6-8` — `site: 'https://iriscandles.com'` marcado como provisional.
- `src/layouts/Base.astro:26` — fallback codificado al mismo dominio.
- `.env.example:8` — `SITE_URL=https://iriscandles.com`.

**Impacto**
Si el dominio definitivo cambia, canonical, OG, sitemap y enlaces de correo quedarán apuntando al sitio equivocado antes del lanzamiento.

**Recomendación**
Mover el dominio a una única variable de configuración de despliegue y verificarlo en el checklist de release.

**Esfuerzo:** Bajo (30 min).

---

### A-17 · `setup.sql` duplica otros scripts — 🔵 Bajo

**Evidencia**
- `db/setup.sql:1-5,406-798` — copia literal de `schema.sql` y `admin.sql`, sin include ni generación automática.

**Impacto**
Cualquier corrección de seguridad aplicada solo a `schema.sql` (por ejemplo la de A-02) puede no llegar a `setup.sql`, que es justo el archivo que la documentación recomienda usar.

**Recomendación**
Generar `setup.sql` desde las fuentes con un pequeño script, o eliminarlo y documentar la ejecución ordenada de los tres archivos. Añadir una comprobación de diff en CI.

**Esfuerzo:** Bajo (1 h).

---

### A-18 · Variables declaradas sin uso real — 🔵 Bajo

**Evidencia**
- `src/lib/wompi.ts:20` — `privateKey` se lee pero nunca se usa.
- `src/pages/admin/configuracion.astro:58,66` — `WOMPI_*` y `RESEND_*` aparecen solo en una lista de integraciones con `configured: false`.
- No hay código que envíe correo con Resend ni que use `SITE_URL`.

**Impacto**
El panel da la impresión de que hay integraciones configurables que no funcionan; aumenta la confusión sobre qué secretos son necesarios (relacionado con A-03).

**Recomendación**
Eliminar las variables muertas o implementar las integraciones; si se mantienen, marcarlas claramente como "planeado" en la UI.

**Esfuerzo:** Bajo (1 h).

---

### A-19 · Errores de base de datos volcados a consola — 🔵 Bajo

**Evidencia**
- `src/pages/api/checkout.ts:125,145` — `console.error('[checkout] ...', orderError)`.
- `src/pages/api/admin/orders/update.ts:133,201` — patrón equivalente.

**Impacto**
Los mensajes de error de Supabase pueden incluir detalles de la consulta o del registro. En Cloudflare quedan en los logs de la cuenta; conviene limitarlos.

**Recomendación**
Registrar solo código de error y un identificador de correlación, nunca el payload ni la fila completa.

**Esfuerzo:** Bajo (1 h).

---

### A-20 · Validación laxa del parámetro `next` — 🔵 Bajo

**Evidencia**
- `src/pages/admin/login.astro:239-241` — acepta cualquier valor que empiece por `/admin` y lo usa en `window.location.replace(next)`.
- `src/middleware.ts:44` — genera el valor a partir de `pathname + search`, por lo que en el flujo normal es seguro.

**Impacto**
Un enlace manipulado podría intentar redirecciones relativas inesperadas. El riesgo es bajo porque el prefijo `/admin` limita el valor, pero la validación no es estricta.

**Recomendación**
Usar una lista blanca de rutas exactas del panel o validar con una expresión que acepte solo `^/admin(?:/[A-Za-z0-9/_-]*)?(?:\?[A-Za-z0-9=&_-]*)?$` y rechace barras invertidas o `//`.

**Esfuerzo:** Bajo (30 min).

---

### A-21 · Descuento de stock con lectura-escritura no atómica — 🟡 Medio

**Evidencia**
- `src/pages/api/admin/orders/update.ts:59-96` — `decrementStock` lee `product_variants.stock`, calcula `nextStock` en JavaScript y hace `update`.
- El comentario de `update.ts:54-58` afirma que `.neq('payment_status','approved')` evita dobles descuentos por clics simultáneos.

**Impacto**
La transición a `approved` sí está protegida, pero el descuento posterior no es atómico: dos aprobaciones de pedidos distintos que se solapen pueden leer el mismo stock inicial y sobrescribirse, perdiendo un descuento. El webhook usa en cambio `confirm_order()` en SQL, que sí es atómico (`db/schema.sql:259-263`).

**Recomendación**
Reutilizar un único `RPC` de SQL (por ejemplo extender `confirm_order` o crear `decrement_stock_for_order`) que haga `update ... set stock = greatest(stock - q, 0)` en una sola sentencia, y llamarlo desde el panel y desde el webhook. Añadir una restricción o movimiento de stock por pedido para garantizar idempotencia.

**Esfuerzo:** Medio (3–4 h).

---

## Roadmap de remediación

### Oleada A — Bloqueantes de seguridad (antes de publicar)
| Orden | Hallazgo | Acción clave |
|---|---|---|
| 1 | A-01 | Fail-closed del modo demo en middleware + bandera explícita de dev |
| 2 | A-02 | `REVOKE`/`GRANT` dentro de `schema.sql` y `setup.sql`; verificación de privilegios |
| 3 | A-03 | Configuración de Wompi desde runtime de Cloudflare |
| 4 | A-04 | Rate limiting + idempotencia en checkout; Turnstile/honeypot en formularios |

**Criterio de salida:** no existe ruta para acceder a `/admin` sin sesión válida; `confirm_order` solo lo ejecuta `service_role`; el webhook responde distinto de `503` con secretos de runtime; el checkout rechaza solicitudes excesivas.

### Oleada B — Funcional y configuración
A-05, A-06, A-07, A-08, A-09, A-10, A-21.
**Criterio de salida:** firma verificada de forma segura y con validación de montos; un `admin` no puede volverse `owner`; bindings desplegados en staging; errores de checkout comunicados correctamente; stock descontado de forma atómica.

### Oleada C — Calidad, accesibilidad y SEO
A-11, A-12, A-13, A-14, A-15, A-16, A-17, A-18, A-19, A-20.
**Criterio de salida:** CI verde con tests de pricing/firma; headers de seguridad presentes; foco visible y nombres accesibles en carrito y modales; dominio definitivo configurado.

---

## Notas finales

- No se han aplicado cambios. Las correcciones requieren aprobación y una fase de implementación separada.
- Después de la Oleada A, repetir la verificación de build (`astro check` + build) y ejecutar axe-core sobre un despliegue de staging para cubrir los hallazgos de accesibilidad con evidencia automatizada.
