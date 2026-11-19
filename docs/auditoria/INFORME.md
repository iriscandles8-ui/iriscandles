# Auditoría de Iris Candles — Informe Ejecutivo

**Fecha:** 2026-11-18
**Tipo:** auditoría de solo lectura (diagnóstico). No se ha modificado código, datos ni configuración.
**Alcance:** `src/**`, `db/**`, `public/**`, `docs/**`, `.env.example`, `astro.config.mjs`, `package.json`.
**Detalle de hallazgos:** [HALLAZGOS.md](./HALLAZGOS.md)

---

## 1. Resumen ejecutivo

Iris Candles es una tienda Astro 7 sobre Cloudflare Workers con Supabase (RLS + service role) y Wompi en modo manual. La base del proyecto es **sólida**: las claves privadas no tienen prefijo `PUBLIC_`, `.gitignore` excluye `.env`, `astro check` pasa sin errores y el build de producción completa correctamente. La lógica de precios se recalcula en servidor (`src/lib/order-pricing.ts`) en lugar de confiar en el navegador, y el webhook usa una función SQL atómica para confirmar pedidos.

Sin embargo, existen **dos riesgos bloqueantes** que impedirían publicar el sitio tal cual:

1. **Panel de administración abierto sin autenticación** si faltan las variables de Supabase (`src/middleware.ts:29-32`). El modo demo otorga una sesión con rol `owner` y el login acepta cualquier credencial. En producción, un error de configuración deja `/admin` accesible para cualquier visitante.
2. **`confirm_order()` queda ejecutable por cualquiera** si se instala únicamente `db/setup.sql`, que se presenta como "instalación completa" pero no incluye el `REVOKE` de `db/manual-payments.sql` (`db/setup.sql:1-5`, `db/manual-payments.sql:19-26`). Cualquier visitante autenticado —o anónimo con la clave anónima— podría aprobar pedidos ajenos y descontar stock.

Además, la configuración de secretos de Wompi es **incoherente con el despliegue en Cloudflare**: `src/lib/wompi.ts:18-23` lee `import.meta.env` (valores inyectados en build), mientras que el resto del backend lee el runtime de Cloudflare. Si los secretos se registran con `wrangler secret put`, el webhook responderá `503` de forma permanente y ningún pago se confirmará.

### Conteo por severidad

| Severidad | Cantidad | IDs |
|---|---|---|
| Crítico | 2 | A-01, A-02 |
| Alto | 2 | A-03, A-04 |
| Medio | 8 | A-05 … A-11, A-21 |
| Bajo | 9 | A-12 … A-20 |

**Veredicto:** Oleada A **implementada en código**; ver [REMEDIACION-OLEADA-A.md](./REMEDIACION-OLEADA-A.md). Antes de publicar faltan tres pasos externos al repo: ejecutar `db/hardening-2026-11.sql` en Supabase, configurar los secretos de Wompi en Cloudflare y verificar el despliegue. Las oleadas B y C siguen pendientes.

---

## 2. Metodología y verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npm.cmd run check` (`astro check`) | ✅ 58 archivos, 0 errores, 0 advertencias, 0 sugerencias |
| `npm.cmd run build -- --outDir <temp>` | ✅ build completado (no se tocó `dist/`); se generaron sitemap y 16 rutas pre-renderizadas |
| `npm.cmd audit` | ❌ 13 vulnerabilidades `high` (picomatch ReDoS, GHSA-fc5q-39xc-vjpf), transmitidas por Astro/Vite. El "fix" sugiere bajar a Astro 5.3.0 (breaking change) |
| Nombres de variables en `.env` | ✅ coincide con `.env.example`; secretos sin prefijo `PUBLIC_` |
| Secretos hardcodeados en `src/**` | ✅ no se encontraron llaves reales (`prv_`, `pub_live_`, JWTs) |
| Historial Git | ⚠️ no verificable: el CLI `git` no está disponible en el entorno (aunque existe carpeta `.git`) |
| Pruebas E2E en navegador | ⚠️ no realizada: no se proporcionó URL desplegada ni alcance de writing |

**Nota sobre el build:** `/admin/login` y `/admin/recuperar` se pre-renderizan. El resto de `/admin/*` se renderiza en servidor y queda detrás del middleware. La pre-renderización refuerza el hallazgo A-03: los valores de `import.meta.env` quedan fijados en el artefacto de build.

---

## 3. Lo que está bien (no requiere acción inmediata)

- **Secretos:** `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` y `RESEND_API_KEY` no usan prefijo `PUBLIC_` (`src/env.d.ts`, `.env.example:4-17`) y no se importan en código cliente.
- **Middleware coherente:** valida `getUser()`, pertenencia a `admin_users`, `is_active` y redirige a login (`src/middleware.ts:34-55`). Los endpoints `/api/admin/*` validan sesión y permisos por separado (`src/lib/admin-auth.ts:20-47`).
- **Precios del lado del servidor:** `src/lib/order-pricing.ts:63-133` ignora montos del navegador, limita cantidades y calcula envío.
- **Idempotencia de pagos:** `confirm_order()` solo transiciona cuando `payment_status = 'pending'` (`db/schema.sql:241-265`), y el panel usa `.neq('payment_status','approved')` (`src/pages/api/admin/orders/update.ts:176-191`).
- **RLS bien pensada:** catálogo público solo activo, dueños sobre sus datos, vistas con `security_invoker = true`, `search_path` fijo en las funciones `security definer`.
- **Accesibilidad base:** `lang="es-CO"`, skip-link, `header/nav/main/footer`, `aria-live` en estados, `aria-expanded` en el menú móvil, `role="dialog"` + `aria-modal` en los modales del panel.
- **SEO:** `canonical`, OG, JSON-LD, `sitemap` que excluye `/admin`, `/carrito` y `/checkout` (`astro.config.mjs:11-15`, `src/layouts/Base.astro:26-70`).

---

## 4. Top 3 antes de cualquier despliegue

1. **A-01 — Fail-closed del modo demo.** El modo demo debe estar restringido a desarrollo explícito (`import.meta.env.DEV` bandera `ALLOW_DEMO_MODE`), nunca deducido de "no hay Supabase".
2. **A-02 — Endurecer `confirm_order()` dentro del script principal.** Integrar los `REVOKE`/`GRANT` en `db/schema.sql` y `db/setup.sql`, y verificar los privilegios tras la instalación.
3. **A-03 — Leer secretos de Wompi desde el runtime de Cloudflare.** Unificar con el patrón de `src/lib/supabase-admin.ts:19-33` y mover la configuración a una función por petición.

---

## 5. Roadmap resumido

| Oleada | Objetivo | Hallazgos | Estimación |
|---|---|---|---|
| **A — Bloqueantes de seguridad** | Cerrar acceso no autenticado, asegurar RPC de pagos, arreglar secretos y abuso de endpoints | A-01, A-02, A-03, A-04 | 1–2 días |
| **B — Funcional y configuración** | Firma timing-safe, permisos DB, dependencias, bindings de Cloudflare, flujo de checkout, stock atómico | A-05 … A-10, A-21 | 2–3 días |
| **C — Calidad, UX y SEO** | Tests/CI, headers, accesibilidad fina, metadata, deuda de documentación | A-11 … A-20 | 2–3 días |

El detalle de cada hallazgo, con evidencia `archivo:línea`, impacto, recomendación y esfuerzo, está en [HALLAZGOS.md](./HALLAZGOS.md).

---

## 6. Limitaciones

- No se validó el comportamiento en una instancia real de Supabase/Cloudflare; el análisis es estático.
- No se ejecutaron pruebas de penetración ni se enviaron peticiones a endpoints en vivo.
- El historial de Git no se pudo revisar por ausencia del CLI; no se puede descartar un secreto filtrado en commits antiguos.
- No se evaluó contraste de color con herramienta automatizada (axe-core) ni Core Web Vitals en producción.
