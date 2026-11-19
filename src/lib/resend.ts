/**
 * Cliente de Resend · emails transaccionales.
 *
 * Se lee del runtime de Cloudflare (`wrangler secret put RESEND_API_KEY`)
 * y, como respaldo en desarrollo local, de `import.meta.env` (.env).
 *
 * Sin configurar, `sendEmail` devuelve false y no lanza errores: el flujo
 * de compra o de administración nunca depende de que el correo salga.
 */

type EnvBag = Record<string, string | undefined>;

async function runtimeEnv(): Promise<EnvBag> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env ?? {}) as EnvBag;
  } catch {
    return {};
  }
}

export async function getResendConfig(): Promise<{ apiKey: string; fromEmail: string }> {
  const env = await runtimeEnv();
  return {
    apiKey: env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY || '',
    fromEmail: env.RESEND_FROM_EMAIL || import.meta.env.RESEND_FROM_EMAIL || '',
  };
}

export async function isResendConfigured(): Promise<boolean> {
  const { apiKey, fromEmail } = await getResendConfig();
  return Boolean(apiKey && fromEmail);
}

const REQUEST_TIMEOUT_MS = 8000;

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Cambia el remitente solo para este correo (debe estar en el dominio verificado). */
  replyTo?: string;
};

/** Envía un correo. Devuelve false si no está configurado o si Resend falla. */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput): Promise<boolean> {
  if (!to || !subject) return false;

  const { apiKey, fromEmail } = await getResendConfig();
  if (!apiKey || !fromEmail) {
    console.warn('[resend] No configurado: RESEND_API_KEY / RESEND_FROM_EMAIL vacíos.');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Iris Candles <${fromEmail}>`,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[resend] Error ${response.status}: ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[resend] No se pudo enviar:', error instanceof Error ? error.message : error);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                                Plantillas                                  */
/* -------------------------------------------------------------------------- */

const COLORS = {
  jade: '#064b3b',
  cream: '#fbf7ee',
  ink: '#1d2a26',
  muted: '#5c6b66',
  line: '#e6ded1',
  terracotta: '#b85e37',
};

export const formatCop = (value: number): string =>
  `$${Math.round(value).toLocaleString('es-CO')} COP`;

const layout = (title: string, body: string): string => `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${COLORS.cream};font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.line};">
          <tr><td style="background:${COLORS.jade};padding:22px 28px;">
            <p style="margin:0;color:${COLORS.cream};font-size:13px;letter-spacing:.28em;text-transform:uppercase;">Iris Candles</p>
            <h1 style="margin:8px 0 0;color:${COLORS.cream};font-size:22px;font-weight:normal;">${title}</h1>
          </td></tr>
          <tr><td style="padding:28px;color:${COLORS.ink};font-size:15px;line-height:1.65;">
            ${body}
          </td></tr>
          <tr><td style="padding:18px 28px;border-top:1px solid ${COLORS.line};color:${COLORS.muted};font-size:12px;line-height:1.6;">
            Velas artesanales hechas a mano en Colombia.<br/>
            ¿Preguntas? Escríbenos a hola@iriscandles.com o por WhatsApp.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

export type OrderEmailData = {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ productName: string; sizeLabel: string; quantity: number; subtotalCop: number }>;
  subtotalCop: number;
  discountCop?: number;
  couponCode?: string;
  shippingCop: number;
  totalCop: number;
  paymentMethod: string;
  city?: string;
  department?: string;
  reference?: string;
};

const itemsTable = (items: OrderEmailData['items']): string => {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};">
            ${item.productName}<br/>
            <span style="color:${COLORS.muted};font-size:13px;">${item.sizeLabel} · ×${item.quantity}</span>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid ${COLORS.line};white-space:nowrap;">
            ${formatCop(item.subtotalCop)}
          </td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;font-size:14px;">
      ${rows}
    </table>`;
};

const totalsBlock = (data: OrderEmailData): string => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:4px;">
    <tr>
      <td style="padding:4px 0;color:${COLORS.muted};">Subtotal</td>
      <td align="right" style="padding:4px 0;">${formatCop(data.subtotalCop)}</td>
    </tr>
    ${data.discountCop ? `<tr>
      <td style="padding:4px 0;color:${COLORS.jade};">Descuento${data.couponCode ? ` (${data.couponCode})` : ''}</td>
      <td align="right" style="padding:4px 0;color:${COLORS.jade};">−${formatCop(data.discountCop)}</td>
    </tr>` : ''}
    <tr>
      <td style="padding:4px 0;color:${COLORS.muted};">Envío</td>
      <td align="right" style="padding:4px 0;">${data.shippingCop > 0 ? formatCop(data.shippingCop) : 'Gratis'}</td>
    </tr>
    <tr>
      <td style="padding:10px 0;border-top:1px solid ${COLORS.line};font-size:16px;">Total</td>
      <td align="right" style="padding:10px 0;border-top:1px solid ${COLORS.line};font-size:16px;color:${COLORS.jade};">
        ${formatCop(data.totalCop)}
      </td>
    </tr>
  </table>`;

/** Correo al cliente cuando el pedido queda registrado. */
export function orderConfirmationEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const destination = [data.city, data.department].filter(Boolean).join(', ');
  const body = `
    <p>Hola ${data.customerName || ''},</p>
    <p>Recibimos tu pedido <strong>${data.orderNumber}</strong>. Ya lo estamos preparando a mano.</p>
    ${itemsTable(data.items)}
    ${totalsBlock(data)}
    <p style="margin-top:22px;">
      <strong>Medio de pago:</strong> ${data.paymentMethod}${data.reference ? ` · Referencia <strong>${data.reference}</strong>` : ''}
    </p>
    ${destination ? `<p style="color:${COLORS.muted};font-size:14px;">Entrega en ${destination}.</p>` : ''}
    <p style="color:${COLORS.muted};font-size:14px;">
      Te avisaremos por correo en cuanto confirmemos el pago y cuando el pedido salga hacia tu casa.
    </p>`;

  return {
    subject: `Pedido ${data.orderNumber} recibido · Iris Candles`,
    html: layout('Pedido recibido', body),
    text: [
      `Hola ${data.customerName || ''},`,
      `Recibimos tu pedido ${data.orderNumber}.`,
      ...data.items.map((i) => `- ${i.productName} (${i.sizeLabel}) x${i.quantity}: ${formatCop(i.subtotalCop)}`),
      `Subtotal: ${formatCop(data.subtotalCop)}`,
      ...(data.discountCop ? [`Descuento${data.couponCode ? ` (${data.couponCode})` : ''}: −${formatCop(data.discountCop)}`] : []),
      `Envío: ${data.shippingCop > 0 ? formatCop(data.shippingCop) : 'Gratis'}`,
      `Total: ${formatCop(data.totalCop)}`,
      `Medio de pago: ${data.paymentMethod}${data.reference ? ` (ref. ${data.reference})` : ''}`,
      destination ? `Entrega en ${destination}.` : '',
      'Te avisaremos en cuanto confirmemos el pago.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/** Correo al cliente cuando el pago queda confirmado (manual o por Wompi). */
export function paymentConfirmedEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
  const body = `
    <p>Hola ${data.customerName || ''},</p>
    <p>¡Confirmamos el pago de tu pedido <strong>${data.orderNumber}</strong>! 🎉</p>
    ${itemsTable(data.items)}
    ${totalsBlock(data)}
    <p style="margin-top:22px;">Tu pedido pasa a preparación. En cuanto salga del taller te enviamos el número de guía.</p>`;

  return {
    subject: `Pago confirmado · Pedido ${data.orderNumber}`,
    html: layout('Pago confirmado', body),
    text: [
      `Hola ${data.customerName || ''},`,
      `Confirmamos el pago de tu pedido ${data.orderNumber}.`,
      `Total: ${formatCop(data.totalCop)}`,
      'Tu pedido pasa a preparación. Te enviaremos la guía en cuanto salga del taller.',
    ].join('\n'),
  };
}
