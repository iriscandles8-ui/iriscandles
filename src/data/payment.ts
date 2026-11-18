/**
 * Métodos de pago que la tienda ofrece como *preferencia*.
 * Hoy no se hace ningún cobro en línea: el pedido queda en proceso de pago
 * y la propietaria lo confirma manualmente desde el panel.
 */
export const PAYMENT_METHODS = [
  { id: 'pse', label: 'PSE', hint: 'Transferencia desde tu banco' },
  { id: 'nequi', label: 'Nequi', hint: 'Pago desde la app' },
  { id: 'daviplata', label: 'Daviplata', hint: 'Billetera digital' },
  { id: 'tarjeta', label: 'Tarjeta', hint: 'Crédito o débito' },
] as const;

export type PaymentMethodLabel = (typeof PAYMENT_METHODS)[number]['label'];

export const isPaymentMethodLabel = (value: string): value is PaymentMethodLabel =>
  PAYMENT_METHODS.some((method) => method.label === value);
