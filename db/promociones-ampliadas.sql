-- ============================================================
-- Promociones ampliadas: cupones, descuentos especiales,
-- cumpleaños y Puntos Iris.
-- Ejecutar en el SQL Editor de Supabase después de setup.sql.
-- ============================================================

-- 1) Los cupones guardan sus condiciones nuevas en `promotions.metadata`:
--    {
--      "uses": 12,                       -- usos globales acumulados
--      "max_uses": 50,                   -- cantidad máxima de usos (null = sin límite)
--      "max_uses_per_customer": 2,       -- usos por cliente (null = sin límite)
--      "usage_history": [                -- historial de utilización
--        { "id": "u-1", "date": "2026-11-10T15:12:00",
--          "customer": "Camila Restrepo", "order": "IRI-1039", "discount": 32850 }
--      ]
--    }
--    `starts_at` (fecha de inicio) ya existe como columna. No se requiere
--    alter table: jsonb acepta las claves nuevas sin migración de esquema.

comment on column public.promotions.starts_at is 'Fecha de inicio de vigencia del cupón o descuento.';
comment on column public.promotions.ends_at is 'Fecha de vencimiento del cupón o descuento.';
comment on column public.promotions.metadata is
  'Condiciones del cupón: uses, max_uses, max_uses_per_customer y usage_history.';

-- 2) Reglas ampliadas de cumpleaños y Puntos Iris.
--    birthday_validity_days: vigencia del beneficio desde el cumpleaños.
--    birthday_once_per_birthday: un solo uso por año/cumpleaños.
--    birthday_email_enabled: envío automático del aviso por correo.
insert into public.settings (key, value) values
  ('loyalty', '{
    "enabled": true,
    "points_per_1000": 1,
    "point_value_cop": 100,
    "birthday_discount_percent": 15,
    "birthday_only_registered": true,
    "birthday_days_ahead": 3,
    "birthday_validity_days": 7,
    "birthday_once_per_birthday": true,
    "birthday_email_enabled": true,
    "points_expire_months": 12,
    "points_min_redeem": 500,
    "points_earn_on": "approved_orders"
  }'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 3) Campañas automáticas de la herramienta independiente.
--    type = percent | fixed; application = store | collection | product;
--    targets = slugs de colección o SKUs; state = enabled | paused.
--    El estado programada/activa/finalizada se deriva de startsAt/endsAt en
--    src/lib/promotions.ts; la clave anterior `promotions.special_discounts`
--    se migra automáticamente al leer (getCampaigns) y puede eliminarse.
insert into public.settings (key, value) values
  ('promotions.campaigns', '[
    {"id":"cmp-1","name":"Navidad","type":"percent","value":15,"application":"store","targets":[],"minTotalCop":0,"startsAt":"2026-12-01T00:00","endsAt":"2026-12-31T23:59","usageLimit":null,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-20T09:00:00"},
    {"id":"cmp-2","name":"San Valentín","type":"percent","value":20,"application":"collection","targets":["esencia-del-valle"],"minTotalCop":120000,"startsAt":"2027-02-01T00:00","endsAt":"2027-02-14T23:59","usageLimit":200,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-22T11:30:00"},
    {"id":"cmp-3","name":"Día de la Madre","type":"percent","value":15,"application":"product","targets":["IRIS-LUZ-120","IRIS-LUZ-220"],"minTotalCop":0,"startsAt":"2027-05-01T00:00","endsAt":"2027-05-09T23:59","usageLimit":150,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-25T16:15:00"},
    {"id":"cmp-4","name":"Temporada especial de otoño","type":"fixed","value":12000,"application":"store","targets":[],"minTotalCop":180000,"startsAt":"2026-09-01T00:00","endsAt":"2026-11-30T23:59","usageLimit":100,"uses":64,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-08-28T10:00:00"},
    {"id":"cmp-5","name":"Preventa colección Ámbar","type":"percent","value":10,"application":"collection","targets":["otono-dorado"],"minTotalCop":0,"startsAt":"2026-10-01T00:00","endsAt":"2026-10-31T23:59","usageLimit":null,"uses":37,"customers":"selected","customerIds":["cus-1","cus-3","cus-7"],"state":"paused","createdAt":"2026-09-20T14:45:00"}
  ]'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

delete from public.settings where key = 'promotions.special_discounts';

-- 4) índice para consultas rápidas de cupones activos por vigencia.
create index if not exists promotions_active_vigency_idx
  on public.promotions (is_active, starts_at, ends_at);
