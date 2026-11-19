# Panel de administración · Guía de conexión

Esta guía deja el panel de Iris Candles funcionando con datos reales. El **modo demostración**
solo existe en desarrollo (`npm run dev`) y debe habilitarse de forma explícita con
`ALLOW_DEMO_MODE=true` en `.env`. Sin Supabase y sin esa bandera, el panel permanece cerrado:
un error de configuración nunca abre el acceso.

## Arquitectura

| Pieza | Servicio | Plan |
| --- | --- | --- |
| Sitio público + panel | Astro estático en Cloudflare Pages | Gratis |
| Base de datos, Auth, Storage | Supabase | Gratis |
| Pagos | Wompi Web Checkout (PSE, Nequi, Daviplata, tarjetas) | Comisión por transacción |
| Correos | Resend | Gratis hasta 3.000/mes |

El panel es una página estática. La seguridad **no** depende de ocultar la interfaz:
Supabase Auth identifica a la persona y las políticas RLS deciden qué puede leer o escribir.
La clave `service_role` nunca debe llegar al navegador.

## 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com> y crea un proyecto gratuito.
2. Guarda la contraseña de la base de datos en un lugar seguro.
3. Espera a que termine el aprovisionamiento (2–3 minutos).
4. En **Project Settings → API** copia:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon public key` → `PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → solo para tareas de servidor, nunca en el frontend.

## 2. Ejecutar el esquema

En **SQL Editor → New query**, puedes ejecutar un solo archivo:

1. `db/setup.sql` — contiene `schema.sql` + `admin.sql` en orden, **incluido el cierre de
   `confirm_order()` al público**. Esta es la opción recomendada.

Si prefieres hacerlo por partes:

1. `db/schema.sql` — catálogo, pedidos, clientes, reseñas, envíos, cupones, RLS pública y
   los `REVOKE`/`GRANT` que dejan `confirm_order()` solo para `service_role`.
2. `db/admin.sql` — personal autorizado, inventario, materias primas, promociones, puntos,
   configuración, auditoría y vistas de estadísticas.
3. `db/manual-payments.sql` — versión independiente de ese mismo endurecimiento. Útil para
   instalaciones anteriores: vuelve a ejecutarlo si alguna vez instalaste solo el esquema
   original. Necesario para que nadie pueda aprobar pedidos desde el navegador.

Los tres scripts son idempotentes (`if not exists`, `drop policy if exists`), así que puedes
volver a ejecutarlos si actualizas el repositorio.

Verifica que existan las tablas principales:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

## 3. Crear la primera propietaria

1. Ve a **Authentication → Users → Add user**.
2. Crea el usuario con el correo de Iris y una contraseña segura.
3. Confirma el correo si Supabase lo solicita.
4. Copia el UUID del usuario y ejecuta:

```sql
insert into admin_users (user_id, role)
values ('<UUID-DEL-USUARIO>', 'owner')
on conflict (user_id) do update
set role = 'owner', is_active = true;
```

Sin esta fila, el login funciona pero el panel redirige a
`/admin/login?error=unauthorized`.

### Invitar al equipo

Crea cada persona en **Authentication → Users** y asígnala en `admin_users`:

```sql
insert into admin_users (user_id, role, permissions)
values ('<UUID>', 'manager', '{"orders":{"read":true,"write":true},"inventory":{"read":true,"write":true}}')
on conflict (user_id) do update
set role = excluded.role, permissions = excluded.permissions, is_active = true;
```

Roles disponibles:

| Rol | Alcance |
| --- | --- |
| `owner` | Todo, incluida la gestión del equipo y la configuración. |
| `admin` | Todo el catálogo y la operación; no cambia propietarias. |
| `manager` | Permisos finos por módulo (`permissions`). |
| `viewer` | Solo lectura. |

## 4. Variables de entorno

Copia `.env.example` a `.env` y completa:

```env
PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_EVENTS_SECRET=

RESEND_API_KEY=
RESEND_FROM_EMAIL=hola@iriscandles.com
```

Reglas:

- Solo las variables con prefijo `PUBLIC_` se incluyen en el bundle del navegador.
- `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_PRIVATE_KEY` y `WOMPI_EVENTS_SECRET` son de servidor.
- Reinicia `npm run dev` después de cambiar `.env`.
- En Cloudflare Pages, carga las mismas variables en **Settings → Environment variables**.

## 5. Storage

Crea dos buckets en **Storage**:

| Bucket | Uso | Acceso |
| --- | --- | --- |
| `product-images` | Fotos de producto y colecciones | Lectura pública |
| `brand` | Logotipo y recursos de marca | Lectura pública |

Las imágenes del catálogo deben ser JPG o WebP, 1600 × 2000 px, fondo neutro y menos de 2 MB.
El logotipo funciona bien en PNG de 800 × 800 px.

## 6. Wompi

1. Crea la cuenta de comercio en <https://comercios.wompi.co>.
2. Ten a mano RUT, cuenta bancaria a nombre del titular y cámara de comercio si aplica.
3. En **Desarrolladores** copia las llaves de sandbox y producción.
4. Configura la URL de eventos (webhook) apuntando a la función que confirma pedidos.
5. Prueba el flujo completo en sandbox antes de pasar a producción.

Flujo esperado:

1. El checkout crea la orden en estado `pending`.
2. Wompi procesa el pago (PSE, Nequi, Daviplata o tarjeta).
3. El webhook firmado cambia el pago a `approved`.
4. Se ejecuta `confirm_order()` y se descuenta el stock de cada variante.
5. Resend envía la confirmación al cliente.

La comisión de Wompi es aproximadamente **2,65% + $700 + IVA** por transacción. PSE es un
método de pago, no una pasarela independiente.

## 7. Resend

1. Crea una cuenta en <https://resend.com>.
2. Verifica el dominio `iriscandles.com` con los registros DNS que indique Resend.
3. Crea una API key y guárdala en `RESEND_API_KEY`.
4. Usa `RESEND_FROM_EMAIL` con un remitente del dominio verificado.

Mientras el dominio no esté verificado, solo podrás enviar al correo de la cuenta.

## 8. Cloudflare Pages

1. Sube el repositorio a GitHub.
2. En Cloudflare Pages crea un proyecto conectado al repositorio.
3. Configura:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node version: 22 o superior
4. Agrega las variables de entorno de producción.
5. Conecta el dominio y actualiza `site` en `astro.config.mjs`.

El sitio es estático; no requiere adaptador de servidor. Las rutas del panel son
`/admin`, `/admin/pedidos`, `/admin/productos`, `/admin/inventario`, `/admin/clientes`,
`/admin/resenas`, `/admin/estadisticas`, `/admin/promociones` y `/admin/configuracion`.

## 9. Verificación

Con el proyecto conectado:

```bash
npm run check
npm run build
```

Luego entra a `/admin/login`, inicia sesión y comprueba:

- [ ] El panel muestra tu nombre y rol reales.
- [ ] Desaparece el aviso de “Modo demostración”.
- [ ] Los pedidos, productos y clientes vienen de Supabase.
- [ ] Un usuario sin fila en `admin_users` no puede entrar.
- [ ] Un `viewer` no ve botones de escritura (además de que RLS lo bloquea).
- [ ] Crear un producto y recargar conserva el cambio.
- [ ] Un movimiento de inventario queda en `stock_movements`.

## 10. Seguridad

- RLS es la frontera real. Revisa que todas las tablas tengan `enable row level security`.
- Nunca desactives RLS para “probar rápido” en producción.
- La clave anónima puede ser pública; la `service_role` no.
- El panel usa `noindex, nofollow`.
- Los cambios sensibles se registran en `audit_log`.
- Supabase gratuito pausa proyectos inactivos; entra al panel al menos una vez por semana
  o programa una consulta periódica.

## Problemas comunes

**El login dice que la cuenta no está autorizada.**
Falta la fila en `admin_users` o `is_active = false`.

**El panel sigue en modo demo.**
`.env` no existe, las variables están vacías o el servidor no se reinició.

**No se pueden leer pedidos con la sesión iniciada.**
Revisa las políticas RLS de `orders` y que `is_staff()` devuelva `true`:

```sql
select public.is_staff(), public.is_owner(), auth.uid();
```

**Los cambios no se guardan.**
El panel todavía usa `src/data/admin-demo.ts`. Las consultas reales a Supabase se conectan
en la siguiente fase; esta guía deja la infraestructura y la autenticación listas.

**El correo de recuperación no llega.**
Configura el dominio en Resend y revisa la carpeta de spam. En desarrollo, Supabase puede
limitar los envíos.
