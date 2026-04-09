export interface ExtraModule {
  id: string;
  label: string;
  description: string;
  config: Record<string, string>;
}

export interface BaseModuleFixed {
  readonly id: string;
  readonly label: string;
  readonly fixed: true;
}

export interface BaseModuleToggleable {
  readonly id: string;
  readonly label: string;
}

export function isValidGoogleSheetsUrl(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(url.trim());
}
