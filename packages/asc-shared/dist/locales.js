import { APP_STORE_LOCALES, ASC_LOCALE_ALIASES } from './constants.js';
export const ASC_LOCALES = [
    'ar-SA',
    'ca',
    'cs',
    'da',
    'de-DE',
    'el',
    'en-AU',
    'en-CA',
    'en-GB',
    'en-US',
    'es-ES',
    'es-MX',
    'fi',
    'fr-CA',
    'fr-FR',
    'he',
    'hi',
    'hr',
    'hu',
    'id',
    'it',
    'ja',
    'ko',
    'ms',
    'nl-NL',
    'no',
    'pl',
    'pt-BR',
    'pt-PT',
    'ro',
    'ru',
    'sk',
    'sv',
    'th',
    'tr',
    'uk',
    'vi',
    'zh-Hans',
    'zh-Hant',
];
export const LOCALE_LABELS = {
    'ar-SA': 'Arabic (Saudi Arabia)',
    ca: 'Catalan',
    cs: 'Czech',
    da: 'Danish',
    'de-DE': 'German (Germany)',
    el: 'Greek',
    'en-AU': 'English (Australia)',
    'en-CA': 'English (Canada)',
    'en-GB': 'English (UK)',
    'en-US': 'English (US)',
    'es-ES': 'Spanish (Spain)',
    'es-MX': 'Spanish (Mexico)',
    fi: 'Finnish',
    'fr-CA': 'French (Canada)',
    'fr-FR': 'French (France)',
    he: 'Hebrew',
    hi: 'Hindi',
    hr: 'Croatian',
    hu: 'Hungarian',
    id: 'Indonesian',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    ms: 'Malay',
    'nl-NL': 'Dutch',
    no: 'Norwegian',
    pl: 'Polish',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    ro: 'Romanian',
    ru: 'Russian',
    sk: 'Slovak',
    sv: 'Swedish',
    th: 'Thai',
    tr: 'Turkish',
    uk: 'Ukrainian',
    vi: 'Vietnamese',
    'zh-Hans': 'Chinese (Simplified)',
    'zh-Hant': 'Chinese (Traditional)',
};
export function normalizeLocale(input) {
    const trimmed = input.trim().replace(/_/g, '-');
    if (!trimmed)
        return trimmed;
    const parts = trimmed.split('-').filter(Boolean);
    if (!parts.length)
        return trimmed;
    const normalized = [];
    const lang = parts[0]?.toLowerCase();
    if (lang)
        normalized.push(lang);
    for (let i = 1; i < parts.length; i += 1) {
        const part = parts[i] ?? '';
        if (!part)
            continue;
        if (part.length === 4) {
            normalized.push(part[0].toUpperCase() + part.slice(1).toLowerCase());
        }
        else {
            normalized.push(part.toUpperCase());
        }
    }
    return normalized.join('-');
}
export function normalizeAscLocale(input) {
    const normalized = normalizeLocale(input);
    return ASC_LOCALE_ALIASES[normalized] ?? normalized;
}
const APP_STORE_LABELS = new Map(APP_STORE_LOCALES.map((entry) => [normalizeLocale(entry.code), entry.name]));
export function localeLabel(locale) {
    const normalized = normalizeLocale(locale);
    return LOCALE_LABELS[locale] ?? APP_STORE_LABELS.get(normalized) ?? locale;
}
export function sortLocales(locales) {
    return [...locales].sort((a, b) => a.localeCompare(b));
}
export function sortLocalesWithPriority(locales, priority = ['en-US']) {
    return [...locales].sort((a, b) => {
        for (const code of priority) {
            if (a === code)
                return -1;
            if (b === code)
                return 1;
        }
        return a.localeCompare(b);
    });
}
const APP_STORE_LOCALE_SET = new Set(APP_STORE_LOCALES.map((locale) => normalizeLocale(locale.code)));
const ASC_LOCALE_SET = new Set(ASC_LOCALES.map((locale) => normalizeLocale(locale)));
const KNOWN_LOCALE_SET = new Set([...APP_STORE_LOCALE_SET, ...ASC_LOCALE_SET]);
const LANGUAGE_DEFAULT_LOCALES = {
    ar: 'ar-SA',
    ca: 'ca',
    cs: 'cs',
    da: 'da',
    de: 'de-DE',
    el: 'el',
    en: 'en-US',
    es: 'es-ES',
    fi: 'fi',
    fr: 'fr-FR',
    he: 'he',
    hi: 'hi',
    hr: 'hr',
    hu: 'hu',
    id: 'id',
    it: 'it',
    ja: 'ja',
    ko: 'ko',
    ms: 'ms',
    nl: 'nl-NL',
    no: 'no',
    pl: 'pl',
    pt: 'pt-PT',
    ro: 'ro',
    ru: 'ru',
    sk: 'sk',
    sv: 'sv',
    th: 'th',
    tr: 'tr',
    uk: 'uk',
    vi: 'vi',
    zh: 'zh-Hans',
};
const COUNTRY_DEFAULT_LOCALES = {
    us: 'en-US',
    gb: 'en-GB',
    uk: 'en-GB',
    au: 'en-AU',
    ca: 'en-CA',
    fr: 'fr-FR',
    de: 'de-DE',
    es: 'es-ES',
    mx: 'es-MX',
    br: 'pt-BR',
    pt: 'pt-PT',
    nl: 'nl-NL',
    it: 'it',
    jp: 'ja',
    kr: 'ko',
    cn: 'zh-Hans',
    tw: 'zh-Hant',
    hk: 'zh-Hant',
    sa: 'ar-SA',
    se: 'sv',
    no: 'no',
    dk: 'da',
    fi: 'fi',
    pl: 'pl',
    ro: 'ro',
    ru: 'ru',
    tr: 'tr',
    in: 'hi',
    id: 'id',
    th: 'th',
    vn: 'vi',
    il: 'he',
    cz: 'cs',
    gr: 'el',
    hu: 'hu',
    sk: 'sk',
    ua: 'uk',
    hr: 'hr',
    my: 'ms',
};
const COUNTRY_NAME_DEFAULT_LOCALES = {
    australia: 'en-AU',
    brazil: 'pt-BR',
    canada: 'en-CA',
    china: 'zh-Hans',
    croatia: 'hr',
    czechia: 'cs',
    czechrepublic: 'cs',
    denmark: 'da',
    finland: 'fi',
    france: 'fr-FR',
    germany: 'de-DE',
    greece: 'el',
    hongkong: 'zh-Hant',
    hungary: 'hu',
    india: 'hi',
    indonesia: 'id',
    israel: 'he',
    italy: 'it',
    japan: 'ja',
    korea: 'ko',
    malaysia: 'ms',
    mexico: 'es-MX',
    netherlands: 'nl-NL',
    norway: 'no',
    poland: 'pl',
    portugal: 'pt-PT',
    romania: 'ro',
    russia: 'ru',
    saudiarabia: 'ar-SA',
    slovakia: 'sk',
    southkorea: 'ko',
    spain: 'es-ES',
    sweden: 'sv',
    taiwan: 'zh-Hant',
    thailand: 'th',
    turkey: 'tr',
    ukraine: 'uk',
    unitedkingdom: 'en-GB',
    unitedstates: 'en-US',
    usa: 'en-US',
    vietnam: 'vi',
};
const REGIONAL_INDICATOR_A = 0x1f1e6;
const REGIONAL_INDICATOR_Z = 0x1f1ff;
const REGIONAL_INDICATOR_OFFSET = 127397;
function resolveLocaleFromToken(token) {
    const tokenNormalized = normalizeAscLocale(token);
    if (KNOWN_LOCALE_SET.has(tokenNormalized))
        return tokenNormalized;
    const lower = tokenNormalized.toLowerCase();
    if (LANGUAGE_DEFAULT_LOCALES[lower]) {
        return LANGUAGE_DEFAULT_LOCALES[lower];
    }
    if (COUNTRY_DEFAULT_LOCALES[lower]) {
        return COUNTRY_DEFAULT_LOCALES[lower];
    }
    const compact = lower.replace(/[^a-z]/g, '');
    if (COUNTRY_NAME_DEFAULT_LOCALES[compact]) {
        return COUNTRY_NAME_DEFAULT_LOCALES[compact];
    }
    return '';
}
function resolveLocaleFromFlagEmoji(input) {
    const chars = [...input];
    for (let i = 0; i < chars.length - 1; i += 1) {
        const first = chars[i]?.codePointAt(0);
        const second = chars[i + 1]?.codePointAt(0);
        if (first === undefined ||
            second === undefined ||
            first < REGIONAL_INDICATOR_A ||
            first > REGIONAL_INDICATOR_Z ||
            second < REGIONAL_INDICATOR_A ||
            second > REGIONAL_INDICATOR_Z) {
            continue;
        }
        const countryCode = String.fromCharCode(first - REGIONAL_INDICATOR_OFFSET, second - REGIONAL_INDICATOR_OFFSET).toLowerCase();
        return COUNTRY_DEFAULT_LOCALES[countryCode] ?? '';
    }
    return '';
}
export function resolveStoreLocale(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return '';
    const normalized = normalizeAscLocale(trimmed);
    if (KNOWN_LOCALE_SET.has(normalized))
        return normalized;
    const byFlag = resolveLocaleFromFlagEmoji(trimmed);
    if (byFlag)
        return byFlag;
    const compact = trimmed.toLowerCase().replace(/[^a-z]/g, '');
    if (compact && COUNTRY_NAME_DEFAULT_LOCALES[compact]) {
        return COUNTRY_NAME_DEFAULT_LOCALES[compact];
    }
    const tokens = trimmed
        .split(/[^A-Za-z-]+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 2 && value.length <= 32);
    for (const token of tokens) {
        const resolved = resolveLocaleFromToken(token);
        if (resolved)
            return resolved;
    }
    return '';
}
