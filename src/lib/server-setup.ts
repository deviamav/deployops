/**
 * Утиліти для роботи з ServerSetup-шаблонами шляхів.
 * Шаблон `webRootTemplate` підтримує плейсхолдер `{domain}`.
 */

export function renderWebRoot(template: string, domain: string): string {
  return template
    .replaceAll("{domain}", domain)
    .replaceAll("{DOMAIN}", domain)
    .replace(/\/+$/, "");
}

export const DEFAULT_SETUP_KEY = "default";
export const DEFAULT_WEB_ROOT_TEMPLATE = "/var/www/{domain}";
