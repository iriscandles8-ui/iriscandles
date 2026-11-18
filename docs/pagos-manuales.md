# Pagos manuales · Cómo funciona y qué falta conectar

Los pagos de Iris Candles se confirman **a mano** por ahora: nadie cobra
automáticamente. El checkout guarda el pedido en Supabase y deja al cliente
con un resumen y un enlace directo a WhatsApp para coordinar el pago.

## Flujo del cliente

1. Agrega productos al carrito y entra a `/checkout`.
2. Llena sus datos y elige un método de pago (Nequi, Daviplata, transferencia,
   PSE o tarjeta).
3. Al enviar, el pedido se guarda en Supabase con:
   - `status = 'pending'`
   - `payment_status = 'pending'`
   - un número de pedido `IRIS-…`
4. La pantalla final muestra el número de pedido y dos caminos:
   - **WhatsApp** con el resumen ya escrito.
   - **Correo** con el mismo resumen.
5. Iris responde con los datos de pago (Nequi, cuenta, etc.) y confirma cuando
   el dinero llegue.

Si el guardado falla por un error del servidor, el checkout muestra el resumen
y deja los enlaces de WhatsApp/correo para no perder la venta.

## Flujo del panel

En `/admin/pedidos` → **Ver**:

| Acción | Qué cambia en la base de datos |
| --- | --- |
| Estado del pago → **Pagado** | `payment_status = 'approved'`, `paid_at`, y `status = 'paid'` si estaba pendiente. Descuenta stock **una sola vez**. |
| Estado del pedido → **En proceso** | `status = 'processing'` |
| Estado del pedido → **Enviado** + guía | `status = 'shipped'`, `shipped_at`, `tracking_number`, `carrier` |
| Estado del pedido → **Entregado** | `status = 'delivered'` |
| Estado del pedido → **Cancelado** | `status = 'cancelled'` |
| Notas internas | `internal_notes` |

Los cambios pasan por `POST /api/admin/orders/update`, que:

1. Valida la sesión y el permiso `orders.write`.
2. Actualiza solo los campos enviados.
3. Descuenta stock en la **primera** transición a `approved`
   (protegido con `.neq('payment_status', 'approved')`).
4. Registra el cambio en `audit_log`.
5. Crea movimientos en `stock_movements`.

Si el pago se devuelve o se anula, usa `voided` o `refunded`; el stock **no**
se devuelve automáticamente. Ajústalo desde `/admin/inventario`.

También puedes crear pedidos manuales (eventos, ventas por WhatsApp) con
**Crear pedido**. El precio se lee del catálogo en el servidor, nunca del
navegador.

## Estados disponibles

`orders.status`:
`pending` → `paid` → `processing` → `shipped` → `delivered`
(o `cancelled` / `refunded`).

`orders.payment_status`:
`pending` · `approved` · `declined` · `voided` · `error`.

Etiquetas del panel:

| Base de datos | Panel |
| --- | --- |
| `payment_status = 'pending'` | En proceso de pago |
| `payment_status = 'approved'` | Pagado |
| `status = 'cancelled'` | Cancelado |

## Seguridad: ejecutar una vez

Después de `db/schema.sql` y `db/admin.sql`, ejecuta en **SQL Editor**:

```text
db/manual-payments.sql
```

Cierra `confirm_order()` al público. Sin ese paso, cualquier visitante podría
llamar a la función y marcar pedidos ajenos como pagados (es `security definer`
y Postgres le da `EXECUTE` a `PUBLIC` por defecto). El script deja la función
solo para `service_role`, que es el rol del servidor.

## Qué falta conectar

### 1. Wompi (cuando la cuenta esté aprobada)

El código ya está preparado, pero **no se usa** mientras los pagos sean
manuales.

1. Crear cuenta de comercio en <https://wompi.com> y completar la validación
   (RUT, cámara de comercio, cuenta bancaria).
2. En **Desarrolladores** copiar:
   - `WOMPI_PUBLIC_KEY` → `pub_test_…` o `pub_prod_…`
   - `WOMPI_PRIVATE_KEY` → `prv_test_…`
   - `WOMPI_INTEGRITY_SECRET`
   - `WOMPI_EVENTS_SECRET`
3. Agregar las variables al `.env` local y a Cloudflare Pages
   (**Settings → Environment variables**).
4. Registrar el webhook en el panel de Wompi:
   `https://iriscandles.com/api/webhooks/wompi`
   (o el dominio real cuando se compre).
5. Ajustar el checkout para que, en lugar de mostrar el resumen, redirija a
   `buildWompiCheckoutUrl()` (`src/lib/wompi.ts`). La referencia del pedido ya
   se guarda en `wompi_reference`.
6. Probar en modo sandbox con las tarjetas de prueba de Wompi antes de pasar a
   producción.

Al recibir `APPROVED`, el webhook `src/pages/api/webhooks/wompi.ts` llama a
`confirm_order()` y el pedido pasa a pagado con stock descontado. Eventos
`DECLINED`, `VOIDED` y `ERROR` actualizan `payment_status` sin tocar el stock.

### 2. Correos transaccionales (Resend)

Hoy el cliente recibe el resumen en pantalla y por WhatsApp. Para enviar
correos automáticos de confirmación/estado:

1. Crear cuenta en <https://resend.com> y verificar el dominio
   (`iriscandles.com`).
2. Agregar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` al entorno.
3. Crear las plantillas (pedido creado, pago confirmado, enviado) y llamarlas
   desde `/api/checkout` y `/api/admin/orders/update`.
4. El botón **Reenviar correo** del detalle queda listo para esa integración;
   hoy solo muestra un aviso.

Alternativa sin costo inmediato: configurar SMTP propio en Supabase Auth
(Gmail/Resend) para superar el límite de 2 correos/hora del SMTP integrado.

### 3. Dominio y despliegue

1. Comprar el dominio y apuntarlo a Cloudflare Pages.
2. Actualizar `site` en `astro.config.mjs` y `SITE_URL` en el `.env`.
3. En Supabase → **Authentication → URL Configuration** agregar
   `https://iriscandles.com/**` y el dominio de preview.
4. Configurar las variables de entorno en Cloudflare Pages.

### 4. Contenido pendiente

- Precios definitivos (hoy: 120 g = $89.000, 220 g = $139.000 COP).
- Fotos y descripciones reales del catálogo.
- Datos de pago que se comparten por WhatsApp (Nequi, cuenta bancaria, etc.).
- Política de envíos y devoluciones revisada por la propietaria.

## Variables de entorno

```dotenv
# Públicas
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=

# Solo servidor
SUPABASE_SERVICE_ROLE_KEY=
SITE_URL=https://iriscandles.com

# Wompi (opcional hasta activar pagos en línea)
WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_INTEGRITY_SECRET=
WOMPI_EVENTS_SECRET=

# Correos (opcional)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Pruebas rápidas

Con el servidor levantado (`npm run dev`) y sesión de propietaria:

```bash
# El checkout debe crear un pedido y devolver orderNumber
curl -X POST http://localhost:4321/api/checkout \
  -H "Content-Type: application/json" \
  --data '{"customer":{"name":"Prueba","email":"prueba@correo.com","phone":"3000000000"},"shipping":{"department":"Cundinamarca","city":"Bogotá","address":"Calle 1 # 2-3"},"payment":"Nequi","items":[{"sku":"IRIS-OTONO-120","qty":1}]}'

# El panel debe rechazar la petición sin sesión (401)
curl -i -X POST http://localhost:4321/api/admin/orders/update \
  -H "Content-Type: application/json" \
  --data '{"orderId":"00000000-0000-4000-8000-000000000000","status":"paid"}'
```

El webhook de Wompi responde `503 Wompi no está configurado` mientras falten
las llaves; eso es lo esperado.
