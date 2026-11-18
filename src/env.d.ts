/// <reference types="astro/client" />

type AdminSession = import('./lib/admin').AdminSession;

declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>;
}

declare namespace App {
  interface Locals {
    adminSession?: AdminSession;
  }
}
