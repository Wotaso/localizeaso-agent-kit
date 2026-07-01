export declare const ASC_LOCALES: readonly ["ar-SA", "ca", "cs", "da", "de-DE", "el", "en-AU", "en-CA", "en-GB", "en-US", "es-ES", "es-MX", "fi", "fr-CA", "fr-FR", "he", "hi", "hr", "hu", "id", "it", "ja", "ko", "ms", "nl-NL", "no", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sv", "th", "tr", "uk", "vi", "zh-Hans", "zh-Hant"];
export type AscLocale = (typeof ASC_LOCALES)[number];
export declare const LOCALE_LABELS: Record<string, string>;
export declare function normalizeLocale(input: string): string;
export declare function normalizeAscLocale(input: string): string;
export declare function localeLabel(locale: string): string;
export declare function sortLocales(locales: string[]): string[];
export declare function sortLocalesWithPriority(locales: string[], priority?: string[]): string[];
export declare function resolveStoreLocale(input: string): string;
//# sourceMappingURL=locales.d.ts.map