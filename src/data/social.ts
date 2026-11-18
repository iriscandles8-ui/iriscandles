export type SocialKey = 'whatsapp' | 'instagram' | 'tiktok';

export interface SocialLink {
  key: SocialKey;
  label: string;
  href: string;
}

/**
 * Enlaces oficiales de Iris Candles.
 * Cambia aquí el número y los usuarios cuando estén confirmados:
 * WhatsApp en formato internacional sin + ni espacios.
 */
export const socialLinks: SocialLink[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    href: 'https://wa.me/573106004894',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/iris_candles_of',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    href: 'https://www.tiktok.com/@iris_candles_of',
  },
];
