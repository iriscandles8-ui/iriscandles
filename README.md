# iriscandles

Tienda de velas artesanales Iris Candles: sitio público, panel de administración y pedidos con **confirmación manual de pago** (sin cobro en línea por ahora).

## Stack

- **Astro 7** + Tailwind 4 + adapter de Cloudflare
- **Supabase**: base de datos, Auth, Storage y RLS
- **Wompi**: preparado pero desactivado; se conectará en el futuro
- **Resend**: opcional para correos transaccionales

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:4321
npm run check    # chequeo de tipos
npm run build    # genera dist/
```

Copia `.env.example` a `.env` y completa las variables. La clave `SUPABASE_SERVICE_ROLE_KEY` solo se usa en el servidor y nunca debe llegar al navegador.

## Base de datos

Ejecuta en el SQL Editor de Supabase, en este orden:

1. `db/setup.sql` (o `db/schema.sql` y `db/admin.sql`)
2. `db/collections.sql` — colecciones gestionables y bucket `collection-images`
3. `db/manual-payments.sql` — cierra `confirm_order()` al público y la deja solo para `service_role`
4. `db/media-library.sql` — biblioteca multimedia (`media_assets` y políticas de Storage)

## Flujo de pedidos

1. El cliente hace el pedido en `/checkout`; se guarda en `orders` con `payment_status = 'pending'`.
2. El panel `/admin/pedidos` permite confirmar el pago, cambiar estados, registrar guía y notas.
3. Al pasar a **Pagado** (`approved`) se descuenta el stock una sola vez y se registra en `audit_log`.
4. Si falla el guardado, el checkout muestra el resumen y enlaces de WhatsApp/correo para no perder la venta.

Guía completa: [`docs/pagos-manuales.md`](docs/pagos-manuales.md) y [`docs/admin-setup.md`](docs/admin-setup.md).

## Biblioteca multimedia

`/admin/medios` (Catálogo → Biblioteca) centraliza las fotografías en los buckets ya existentes de Supabase Storage (`product-images` y `collection-images`). Permite subir, previsualizar antes de guardar, buscar por nombre, reemplazar, reutilizar la misma imagen en productos/colecciones, ver dónde se usa y borrar solo archivos sin referencias.

Reemplazar un archivo conserva su URL pública, así que las referencias de productos y colecciones no se rompen al editarlos. Guía: [`docs/biblioteca-multimedia.md`](docs/biblioteca-multimedia.md).

Para comprobar la instalación: `npm run verify:media` (solo lectura) o `npm run verify:media:write` (incluye una prueba real de subida y reemplazo con limpieza automática).

## Despliegue

El repositorio está listo para Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`
- Variables de entorno: las mismas de `.env.example`, cargadas en Cloudflare Pages.

Dominio provisional: `https://iriscandles.com` (cambiar en `astro.config.mjs` y `SITE_URL` al comprar el definitivo).
