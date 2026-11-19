/**
 * Reglas de promociones compartidas (panel y futuro motor de precios).
 * Sin dependencias de DOM ni de Supabase para poder usarse también en servidor.
 */

export type CampaignStatus = 'scheduled' | 'active' | 'paused' | 'finished';
export type CampaignState = 'enabled' | 'paused';

export type CampaignSchedule = {
  startsAt: string;
  endsAt: string;
  state: CampaignState;
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  scheduled: 'Programada',
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Finalizada',
};

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, string> = {
  scheduled: 'blue',
  active: 'jade',
  paused: 'amber',
  finished: 'slate',
};

/**
 * Estado derivado de la vigencia. La pausa manual gana sobre el calendario;
 * fuera de vigencia la campaña se activa/desactiva sola, sin intervención.
 */
export function resolveCampaignStatus(
  campaign: CampaignSchedule,
  now: Date = new Date(),
): CampaignStatus {
  if (campaign.state === 'paused') return 'paused';
  const current = now.getTime();
  const from = Date.parse(campaign.startsAt);
  const to = Date.parse(campaign.endsAt);

  if (Number.isFinite(from) && current < from) return 'scheduled';
  if (Number.isFinite(to) && current > to) return 'finished';
  return 'active';
}

export type CampaignTarget = {
  application: 'store' | 'collection' | 'product';
  targets: string[];
};

export type EligibilityContext = {
  cartSubtotalCop: number;
  customerId?: string | null;
  collectionSlug?: string;
  productSlug?: string;
};

export type EligibleCampaign = CampaignSchedule &
  CampaignTarget & {
    minTotalCop: number;
    customers: 'all' | 'selected';
    customerIds: string[];
    usageLimit: number | null;
    uses: number;
  };

/** Comprueba si una campaña se puede aplicar a un carrito/cliente concreto. */
export function checkCampaignEligibility(
  campaign: EligibleCampaign,
  context: EligibilityContext,
  now: Date = new Date(),
): { ok: boolean; reason: string } {
  const status = resolveCampaignStatus(campaign, now);
  if (status !== 'active') {
    return { ok: false, reason: `La campaña está ${CAMPAIGN_STATUS_LABELS[status].toLowerCase()}.` };
  }
  if (context.cartSubtotalCop < campaign.minTotalCop) {
    return { ok: false, reason: 'No se alcanza la compra mínima.' };
  }
  if (campaign.customers === 'selected' && !campaign.customerIds.includes(context.customerId ?? '')) {
    return { ok: false, reason: 'El cliente no está en la lista seleccionada.' };
  }
  if (campaign.application === 'collection' && !campaign.targets.includes(context.collectionSlug ?? '')) {
    return { ok: false, reason: 'La colección no está incluida.' };
  }
  if (campaign.application === 'product' && !campaign.targets.includes(context.productSlug ?? '')) {
    return { ok: false, reason: 'El producto no está incluido.' };
  }
  if (campaign.usageLimit !== null && campaign.uses >= campaign.usageLimit) {
    return { ok: false, reason: 'Se agotó el límite de usos.' };
  }
  return { ok: true, reason: 'Aplicable' };
}

/* ------------------------------- Cumpleaños ------------------------------- */

export type BirthdayRules = {
  enabled: boolean;
  percent: number;
  notifyDaysBefore: number;
  validityDays: number;
  registeredOnly: boolean;
  oncePerBirthday: boolean;
  emailEnabled: boolean;
};

/** Ventana en la que el beneficio de cumpleaños está disponible para un año. */
export function birthdayBenefitWindow(
  birthDate: string,
  year: number,
  rules: Pick<BirthdayRules, 'notifyDaysBefore' | 'validityDays'>,
): { start: Date; end: Date } | null {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(birthDate);
  if (!match) return null;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  const birth = new Date(year, month, day, 12);
  if (Number.isNaN(birth.getTime())) return null;

  const start = new Date(birth);
  start.setDate(start.getDate() - Math.max(0, rules.notifyDaysBefore));
  const end = new Date(birth);
  end.setDate(end.getDate() + Math.max(0, rules.validityDays));
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export type BirthdayCustomer = {
  id: string;
  name: string;
  email: string;
  birthDate: string;
};

export type BirthdayRedemption = {
  usedYears: number[];
  notifiedYears: number[];
};

/**
 * Impide usos repetidos o indebidos: beneficio desactivado, cliente sin correo
 * (cuando se exige registro), fuera de vigencia o ya usado en ese cumpleaños.
 */
export function checkBirthdayBenefit(
  customer: BirthdayCustomer,
  rules: BirthdayRules,
  redemption: BirthdayRedemption,
  now: Date = new Date(),
): { ok: boolean; reason: string; inWindow: boolean } {
  if (!rules.enabled) return { ok: false, reason: 'Beneficio desactivado.', inWindow: false };
  if (rules.registeredOnly && !customer.email) {
    return { ok: false, reason: 'El cliente no tiene correo registrado.', inWindow: false };
  }

  const year = now.getFullYear();
  const window = birthdayBenefitWindow(customer.birthDate, year, rules);
  if (!window) return { ok: false, reason: 'Fecha de cumpleaños inválida.', inWindow: false };

  const inWindow = now >= window.start && now <= window.end;
  if (!inWindow) return { ok: false, reason: 'El beneficio está fuera de vigencia.', inWindow: false };

  const alreadyUsed = redemption.usedYears.includes(year);
  if (rules.oncePerBirthday && alreadyUsed) {
    return { ok: false, reason: 'El beneficio ya fue usado en este cumpleaños.', inWindow: true };
  }
  return { ok: true, reason: 'Beneficio disponible', inWindow: true };
}

/** Día del mes/año en que se envía el aviso (para programar el correo). */
export function birthdayNotifyDate(
  birthDate: string,
  year: number,
  notifyDaysBefore: number,
): Date | null {
  const window = birthdayBenefitWindow(birthDate, year, { notifyDaysBefore, validityDays: 0 });
  return window?.start ?? null;
}
