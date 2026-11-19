/**
 * Utilidades de Wompi · listas para conectar cuando la cuenta esté aprobada.
 *
 * Hoy NO se usan en el flujo de compra: los pagos se confirman manualmente
 * desde el panel. Este archivo deja resuelto lo que suele romperse al integrar:
 * la firma de integridad del checkout y la verificación del webhook.
 *
 * Llaves necesarias (panel de Wompi → Desarrolladores):
 *   WOMPI_PUBLIC_KEY        pub_test_... / pub_prod_...  (pública)
 *   WOMPI_PRIVATE_KEY       prv_test_... / prv_prod_...  (secreta)
 *   WOMPI_INTEGRITY_SECRET  secreto de integridad        (secreto)
 *   WOMPI_EVENTS_SECRET     secreto de eventos (webhook) (secreto)
 *
 * IMPORTANTE: en Cloudflare los secretos se configuran en RUNTIME
 * (`wrangler secret put ...`), no en variables de build. Por eso la
 * configuración se lee del binding `cloudflare:workers` en cada petición,
 * con `import.meta.env` únicamente como respaldo para desarrollo local.
 */

export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';
export const WOMPI_CURRENCY = 'COP';

export type WompiConfig = {
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  eventsSecret: string;
};

type EnvBag = Record<string, string | undefined>;

async function runtimeEnv(): Promise<EnvBag> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env ?? {}) as EnvBag;
  } catch {
    return {};
  }
}

/** Devuelve la configuración vigente. Nunca cachear secretos en el módulo. */
export async function getWompiConfig(): Promise<WompiConfig> {
  const env = await runtimeEnv();
  return {
    publicKey: env.WOMPI_PUBLIC_KEY || import.meta.env.WOMPI_PUBLIC_KEY || '',
    privateKey: env.WOMPI_PRIVATE_KEY || import.meta.env.WOMPI_PRIVATE_KEY || '',
    integritySecret: env.WOMPI_INTEGRITY_SECRET || import.meta.env.WOMPI_INTEGRITY_SECRET || '',
    eventsSecret: env.WOMPI_EVENTS_SECRET || import.meta.env.WOMPI_EVENTS_SECRET || '',
  };
}

/** Async porque los secretos pueden vivir solo en el runtime de Cloudflare. */
export async function isWompiConfigured(): Promise<boolean> {
  const config = await getWompiConfig();
  return Boolean(config.publicKey && config.integritySecret && config.eventsSecret);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Firma de integridad exigida por Web Checkout:
 * SHA-256(referencia + monto_en_centavos + moneda + secreto_integridad).
 */
export async function integritySignature(
  reference: string,
  amountInCents: number,
  currency: string = WOMPI_CURRENCY,
): Promise<string> {
  const config = await getWompiConfig();
  if (!config.integritySecret) {
    throw new Error('Falta WOMPI_INTEGRITY_SECRET.');
  }
  return sha256Hex(`${reference}${amountInCents}${currency}${config.integritySecret}`);
}

type CheckoutParams = {
  reference: string;
  amountCop: number;
  redirectUrl: string;
  customerEmail?: string;
  customerName?: string;
};

/** Construye la URL de Web Checkout. Wompi recibe el cobro, no nuestra web. */
export async function buildWompiCheckoutUrl({
  reference,
  amountCop,
  redirectUrl,
  customerEmail,
  customerName,
}: CheckoutParams): Promise<string> {
  const config = await getWompiConfig();
  if (!config.publicKey) throw new Error('Falta WOMPI_PUBLIC_KEY.');

  const amountInCents = Math.round(amountCop * 100);
  const signature = await integritySignature(reference, amountInCents);

  const params = new URLSearchParams({
    'public-key': config.publicKey,
    currency: WOMPI_CURRENCY,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': signature,
    'redirect-url': redirectUrl,
  });

  if (customerEmail) params.set('customer-data:email', customerEmail);
  if (customerName) params.set('customer-data:full-name', customerName);

  return `${WOMPI_CHECKOUT_URL}?${params.toString()}`;
}

type WompiEvent = {
  event?: string;
  data?: { transaction?: Record<string, unknown> };
  signature?: { properties?: unknown; checksum?: unknown };
  timestamp?: unknown;
};

function valueAtPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

/**
 * Verifica el checksum del evento de Wompi:
 * SHA-256(valores de signature.properties + timestamp + secreto_eventos).
 */
export async function verifyWompiEvent(body: unknown): Promise<boolean> {
  const config = await getWompiConfig();
  if (!config.eventsSecret) return false;

  const event = body as WompiEvent;
  const properties = event?.signature?.properties;
  const checksum = event?.signature?.checksum;

  if (!Array.isArray(properties) || typeof checksum !== 'string') return false;

  const components = properties.map((property) =>
    String(valueAtPath(event.data, String(property)) ?? ''),
  );
  const raw = `${components.join('')}${String(event.timestamp ?? '')}${config.eventsSecret}`;
  const expected = await sha256Hex(raw);

  return expected.toLowerCase() === checksum.toLowerCase();
}
