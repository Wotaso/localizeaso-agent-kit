export const DEFAULT_IGNORED_DUPLICATE_KEYWORDS = [
    "a",
    "an",
    "and",
    "or",
    "the",
    "to",
    "for",
    "of",
    "in",
    "on",
    "with",
    "der",
    "die",
    "das",
    "und",
    "mit",
    "fur",
    "fuer",
    "de",
    "la",
    "le",
    "les",
    "et",
    "el",
    "los",
    "las",
    "y",
    "en",
    "para",
    "con",
    "por",
    "il",
    "lo",
    "gli",
    "e",
    "di",
    "per",
    "com",
];
export function normalizeKeywordToken(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
        .toLowerCase();
}
export function tokenizeText(value) {
    return value
        .split(/[,\s]+/)
        .map((token) => normalizeKeywordToken(token))
        .filter(Boolean);
}
export function tokenizeKeywordField(value) {
    return value
        .split(",")
        .map((token) => normalizeKeywordToken(token))
        .filter(Boolean);
}
export function findDuplicateKeywords(fields, options) {
    const ignored = new Set(DEFAULT_IGNORED_DUPLICATE_KEYWORDS.map((keyword) => normalizeKeywordToken(keyword)));
    if (options?.ignoreKeywords) {
        for (const keyword of options.ignoreKeywords) {
            const normalized = normalizeKeywordToken(keyword);
            if (normalized)
                ignored.add(normalized);
        }
    }
    const map = new Map();
    if (fields.title) {
        for (const token of tokenizeText(fields.title)) {
            if (ignored.has(token))
                continue;
            if (!map.has(token))
                map.set(token, new Set());
            map.get(token)?.add("title");
        }
    }
    if (fields.subtitle) {
        for (const token of tokenizeText(fields.subtitle)) {
            if (ignored.has(token))
                continue;
            if (!map.has(token))
                map.set(token, new Set());
            map.get(token)?.add("subtitle");
        }
    }
    if (fields.keywords) {
        for (const token of tokenizeKeywordField(fields.keywords)) {
            if (ignored.has(token))
                continue;
            if (!map.has(token))
                map.set(token, new Set());
            map.get(token)?.add("keywords");
        }
    }
    const duplicates = [];
    for (const [keyword, set] of map.entries()) {
        if (set.size <= 1)
            continue;
        duplicates.push({ keyword, fields: Array.from(set) });
    }
    return duplicates;
}
