import { ASC_LOCALES, normalizeAscLocale } from './locales.js';
export const CROSS_LOCALIZATION_TIER_WEIGHT = {
    primary_exact: 1200,
    primary_language: 1050,
    target_exact: 900,
    target_language: 760,
    cross_exact: 560,
    cross_language: 420,
};
// Cross-localization locale graph derived from the ASO reference matrix:
// https://aso.dev/metadata/cross-localization/
// The graph encodes locale-to-locale indexing relationships (default/additional).
const RAW_CROSS_LOCALE_GRAPH = {
    'ar-SA': ['en-GB', 'en-US', 'fr-FR', 'zh-Hans', 'zh-Hant', 'vi'],
    ca: ['es-ES', 'en-GB'],
    cs: ['en-GB'],
    da: ['en-GB'],
    'de-DE': ['en-GB', 'fr-FR', 'it'],
    el: ['en-GB'],
    'en-AU': ['ar-SA', 'zh-Hans', 'zh-Hant', 'vi', 'en-GB'],
    'en-CA': ['fr-CA', 'en-US', 'en-GB'],
    'en-GB': ASC_LOCALES.filter((locale) => locale !== 'en-GB'),
    'en-US': ['ar-SA', 'zh-Hans', 'zh-Hant', 'fr-FR', 'ko', 'pt-BR', 'ru', 'es-MX', 'vi', 'ja'],
    'es-ES': ['ca', 'en-GB'],
    'es-MX': ['en-GB', 'en-US', 'pt-BR', 'fr-FR'],
    fi: ['en-GB'],
    'fr-CA': ['en-CA', 'en-US', 'en-GB'],
    'fr-FR': [
        'en-GB',
        'ar-SA',
        'de-DE',
        'it',
        'ja',
        'ko',
        'pt-BR',
        'ru',
        'zh-Hans',
        'es-MX',
        'zh-Hant',
        'vi',
        'nl-NL',
    ],
    he: ['en-GB'],
    hi: ['en-GB'],
    hr: ['en-GB'],
    hu: ['en-GB'],
    id: ['en-GB'],
    it: ['en-GB', 'de-DE', 'fr-FR'],
    ja: ['en-US', 'en-GB', 'fr-FR'],
    ko: ['en-US', 'en-GB', 'fr-FR'],
    ms: ['en-GB'],
    'nl-NL': ['en-GB', 'fr-FR'],
    no: ['en-GB'],
    pl: ['en-GB'],
    'pt-BR': ['en-US', 'en-GB', 'es-MX', 'fr-FR'],
    'pt-PT': ['en-GB'],
    ro: ['en-GB'],
    ru: ['en-US', 'en-GB', 'fr-FR'],
    sk: ['en-GB'],
    sv: ['en-GB'],
    th: ['en-GB'],
    tr: ['en-GB'],
    uk: ['en-GB'],
    vi: ['en-US', 'en-AU', 'en-GB', 'fr-FR'],
    'zh-Hans': ['en-US', 'en-GB', 'fr-FR', 'zh-Hant'],
    'zh-Hant': ['en-US', 'en-GB', 'fr-FR', 'zh-Hans'],
};
const ASC_LOCALE_SET = new Set(ASC_LOCALES.map((locale) => normalizeAscLocale(locale)));
function localeLanguage(locale) {
    return normalizeAscLocale(locale).split('-')[0] ?? '';
}
function isLanguageOnly(locale) {
    const normalized = normalizeAscLocale(locale);
    return normalized.length > 0 && !normalized.includes('-');
}
function normalizeGraph(graph) {
    const normalized = {};
    for (const locale of ASC_LOCALES) {
        const normalizedLocale = normalizeAscLocale(locale);
        normalized[normalizedLocale] = new Set();
    }
    for (const [source, targets] of Object.entries(graph)) {
        const sourceLocale = normalizeAscLocale(source);
        if (!sourceLocale || !ASC_LOCALE_SET.has(sourceLocale))
            continue;
        for (const rawTarget of targets) {
            const targetLocale = normalizeAscLocale(rawTarget);
            if (!targetLocale || !ASC_LOCALE_SET.has(targetLocale))
                continue;
            normalized[sourceLocale]?.add(targetLocale);
            normalized[targetLocale]?.add(sourceLocale);
        }
    }
    return Object.fromEntries(Object.entries(normalized).map(([locale, connected]) => [locale, Array.from(connected)]));
}
const CROSS_LOCALE_GRAPH = normalizeGraph(RAW_CROSS_LOCALE_GRAPH);
function getSameLanguageLocales(locale) {
    const language = localeLanguage(locale);
    if (!language)
        return new Set();
    return new Set(ASC_LOCALES.map((entry) => normalizeAscLocale(entry)).filter((entry) => localeLanguage(entry) === language));
}
export function resolveCrossLocalizedLocales(args) {
    const targetLocale = normalizeAscLocale(args.targetLocale);
    if (!targetLocale) {
        return {
            primaryLocale: '',
            targetLocale: '',
            crossExactLocales: new Set(),
            crossLanguageCodes: new Set(),
        };
    }
    const primaryLocale = normalizeAscLocale(args.primaryLocale ?? '');
    const crossExactLocales = new Set();
    for (const candidate of CROSS_LOCALE_GRAPH[targetLocale] ?? []) {
        crossExactLocales.add(candidate);
    }
    for (const candidate of getSameLanguageLocales(targetLocale)) {
        if (candidate !== targetLocale)
            crossExactLocales.add(candidate);
    }
    if (primaryLocale && primaryLocale !== targetLocale) {
        crossExactLocales.add(primaryLocale);
    }
    const crossLanguageCodes = new Set();
    for (const locale of crossExactLocales) {
        const language = localeLanguage(locale);
        if (language)
            crossLanguageCodes.add(language);
    }
    return { primaryLocale, targetLocale, crossExactLocales, crossLanguageCodes };
}
export function resolveCrossLocalizationTier(args) {
    const keywordLocale = normalizeAscLocale(args.keywordLocale);
    const includeCrossLocalization = args.includeCrossLocalization !== false;
    const { primaryLocale, targetLocale, crossExactLocales, crossLanguageCodes } = resolveCrossLocalizedLocales({
        targetLocale: args.targetLocale,
        primaryLocale: args.primaryLocale,
    });
    if (!keywordLocale || !targetLocale)
        return null;
    if (keywordLocale === targetLocale)
        return 'target_exact';
    const keywordLanguage = localeLanguage(keywordLocale);
    if (!keywordLanguage)
        return null;
    if (!includeCrossLocalization) {
        if (isLanguageOnly(keywordLocale) && keywordLanguage === localeLanguage(targetLocale)) {
            return 'target_language';
        }
        return null;
    }
    if (primaryLocale && keywordLocale === primaryLocale)
        return 'primary_exact';
    if (primaryLocale && isLanguageOnly(keywordLocale) && keywordLanguage === localeLanguage(primaryLocale)) {
        return 'primary_language';
    }
    if (isLanguageOnly(keywordLocale) && keywordLanguage === localeLanguage(targetLocale)) {
        return 'target_language';
    }
    if (crossExactLocales.has(keywordLocale))
        return 'cross_exact';
    if (isLanguageOnly(keywordLocale) && crossLanguageCodes.has(keywordLanguage)) {
        return 'cross_language';
    }
    return null;
}
export function selectCrossLocalizedRows(rows, args) {
    if (!rows?.length)
        return [];
    const selected = [];
    for (const row of rows) {
        const tier = resolveCrossLocalizationTier({
            keywordLocale: row.locale,
            targetLocale: args.targetLocale,
            primaryLocale: args.primaryLocale,
            includeCrossLocalization: args.includeCrossLocalization,
        });
        if (!tier)
            continue;
        selected.push({
            row,
            tier,
            weight: CROSS_LOCALIZATION_TIER_WEIGHT[tier],
        });
    }
    selected.sort((left, right) => right.weight - left.weight);
    return selected;
}
