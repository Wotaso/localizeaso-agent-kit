import { normalizeLocale, resolveStoreLocale } from './locales.js';
export const ASO_KEYWORD_IMPORT_FIELDS = [
    'locale',
    'keyword',
    'popularity',
    'difficulty',
    'isPreferred',
];
const REQUIRED_ASO_KEYWORD_FIELDS = ['locale', 'keyword'];
const ASO_HEADER_CANDIDATES = {
    locale: [
        'locale',
        'locales',
        'storedomain',
        'storelocale',
        'store',
        'storefront',
        'country',
        'market',
        'territory',
        'lang',
        'language',
        'languagecode',
        'localecode',
        'localecode',
    ],
    localeHighPriority: [
        'store',
        'storefront',
        'storelocale',
        'country',
        'market',
        'territory',
        'storedomain',
    ],
    keyword: [
        'keyword',
        'keywords',
        'keywordname',
        'term',
        'terms',
        'searchterm',
        'searchterms',
        'query',
        'queries',
        'phrase',
        'searchquery',
    ],
    popularity: [
        'popularity',
        'pop',
        'searchvolume',
        'volume',
        'traffic',
        'score',
        'rank',
        'impressions',
    ],
    difficulty: ['difficulty', 'competition', 'hardness', 'comp', 'kd', 'diff'],
    isPreferred: ['preferred', 'ispreferred', 'favorite', 'favourite', 'primary', 'main'],
};
export function parseKeywordList(input) {
    return input
        .split(/[,\n]+/)
        .map((value) => value.trim())
        .filter(Boolean);
}
export function parseCsvRows(input) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const pushField = () => {
        row.push(field);
        field = '';
    };
    const pushRow = () => {
        if (row.length > 0 || field.length > 0) {
            pushField();
            rows.push(row.map((value) => value.trim()));
            row = [];
        }
    };
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (inQuotes) {
            if (char === '"') {
                const next = input[i + 1];
                if (next === '"') {
                    field += '"';
                    i += 1;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += char;
            }
            continue;
        }
        if (char === '"') {
            inQuotes = true;
            continue;
        }
        if (char === ',') {
            pushField();
            continue;
        }
        if (char === '\n') {
            pushRow();
            continue;
        }
        if (char === '\r') {
            if (input[i + 1] === '\n')
                i += 1;
            pushRow();
            continue;
        }
        field += char;
    }
    pushRow();
    return rows.filter((r) => r.some((cell) => cell.length > 0));
}
export function parseCsvTable(csv) {
    const rows = parseCsvRows(csv);
    if (!rows.length) {
        return { header: [], rows: [] };
    }
    const [header, ...bodyRows] = rows;
    return {
        header: header.map((value) => value.trim()),
        rows: bodyRows,
    };
}
function normalizeHeader(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function findHeaderIndex(header, candidates) {
    const normalizedHeader = header.map((value) => normalizeHeader(value));
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeHeader(candidate);
        if (!normalizedCandidate)
            continue;
        const index = normalizedHeader.findIndex((value) => value === normalizedCandidate);
        if (index >= 0)
            return index;
    }
    return -1;
}
function parseOptionalNumeric(value) {
    let trimmed = value.trim();
    if (!trimmed)
        return undefined;
    trimmed = trimmed
        .replace(/[%\s]/g, '')
        .replace(/^[^\d+-.]+/, '')
        .replace(/[^\d,.-]+$/, '');
    if (!trimmed)
        return undefined;
    const hasComma = trimmed.includes(',');
    const hasDot = trimmed.includes('.');
    if (hasComma && hasDot) {
        const lastComma = trimmed.lastIndexOf(',');
        const lastDot = trimmed.lastIndexOf('.');
        trimmed =
            lastComma > lastDot
                ? trimmed.replace(/\./g, '').replace(',', '.')
                : trimmed.replace(/,/g, '');
    }
    else if (hasComma) {
        const parts = trimmed.split(',');
        const last = parts.at(-1) ?? '';
        trimmed =
            parts.length > 2 || last.length === 3
                ? parts.join('')
                : trimmed.replace(',', '.');
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function parseOptionalBoolean(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed)
        return undefined;
    if (['true', '1', 'yes', 'y'].includes(trimmed))
        return true;
    if (['false', '0', 'no', 'n'].includes(trimmed))
        return false;
    return undefined;
}
function asCell(row, index) {
    if (index === null || index < 0)
        return '';
    return String(row[index] ?? '').trim();
}
function mapAsoColumnsFromHeader(header) {
    const normalizeIndex = (index) => (index >= 0 ? index : null);
    // Explicitly check for high-priority locale headers first (country/storefront)
    let localeIndex = findHeaderIndex(header, ASO_HEADER_CANDIDATES.localeHighPriority);
    if (localeIndex === -1) {
        localeIndex = findHeaderIndex(header, ASO_HEADER_CANDIDATES.locale);
    }
    return {
        locale: normalizeIndex(localeIndex),
        keyword: normalizeIndex(findHeaderIndex(header, ASO_HEADER_CANDIDATES.keyword)),
        popularity: normalizeIndex(findHeaderIndex(header, ASO_HEADER_CANDIDATES.popularity)),
        difficulty: normalizeIndex(findHeaderIndex(header, ASO_HEADER_CANDIDATES.difficulty)),
        isPreferred: normalizeIndex(findHeaderIndex(header, ASO_HEADER_CANDIDATES.isPreferred)),
    };
}
export function suggestAsoKeywordColumnMapping(header) {
    const direct = mapAsoColumnsFromHeader(header);
    const used = new Set();
    const next = {
        locale: null,
        keyword: null,
        popularity: null,
        difficulty: null,
        isPreferred: null,
    };
    const findBestAvailable = (field) => {
        const existing = direct[field];
        if (existing !== null && !used.has(existing)) {
            return existing;
        }
        const candidates = ASO_HEADER_CANDIDATES[field].map(normalizeHeader);
        let bestIndex = null;
        let bestScore = -1;
        for (let index = 0; index < header.length; index += 1) {
            if (used.has(index))
                continue;
            const normalized = normalizeHeader(header[index] ?? '');
            if (!normalized)
                continue;
            let score = -1;
            for (const candidate of candidates) {
                if (!candidate)
                    continue;
                if (normalized === candidate) {
                    score = Math.max(score, 1000);
                    continue;
                }
                if (normalized.startsWith(candidate) || candidate.startsWith(normalized)) {
                    score = Math.max(score, 700);
                    continue;
                }
                if (normalized.includes(candidate) || candidate.includes(normalized)) {
                    score = Math.max(score, 500);
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }
        if (bestScore < 0)
            return null;
        return bestIndex;
    };
    for (const field of ['locale', 'keyword', 'popularity', 'difficulty', 'isPreferred']) {
        const index = findBestAvailable(field);
        if (index === null) {
            next[field] = null;
            continue;
        }
        used.add(index);
        next[field] = index;
    }
    return next;
}
export function mapCsvTableToAsoKeywordRows(table, mapping, options) {
    const errors = [];
    const results = [];
    const skippedRows = [];
    const resolveLocale = options?.localeResolver ?? resolveStoreLocale;
    const allowUnmappedLocales = options?.allowUnmappedLocales === true;
    for (const field of REQUIRED_ASO_KEYWORD_FIELDS) {
        const index = mapping[field];
        if (index === null || index < 0 || index >= table.header.length) {
            if (field === 'keyword') {
                errors.push('Missing keyword column.');
            }
            else {
                errors.push("Missing locale column. Include header like 'locale' or 'store domain'.");
            }
        }
    }
    if (errors.length > 0) {
        return { rows: [], errors };
    }
    for (const [rowIndex, row] of table.rows.entries()) {
        const keyword = asCell(row, mapping.keyword);
        if (!keyword)
            continue;
        const localeRaw = asCell(row, mapping.locale);
        const locale = localeRaw ? resolveLocale(localeRaw) : '';
        if (!locale) {
            if (allowUnmappedLocales) {
                skippedRows.push({
                    rowNumber: rowIndex + 2,
                    reason: 'unmapped_locale',
                    localeRaw,
                    keyword,
                });
            }
            else {
                errors.push(`Row ${rowIndex + 2}: Unable to map locale "${localeRaw}".`);
            }
            continue;
        }
        const popularity = parseOptionalNumeric(asCell(row, mapping.popularity));
        const difficulty = parseOptionalNumeric(asCell(row, mapping.difficulty));
        const isPreferred = parseOptionalBoolean(asCell(row, mapping.isPreferred));
        results.push({
            locale: normalizeLocale(locale),
            keyword,
            popularity,
            difficulty,
            isPreferred,
        });
    }
    return { rows: results, errors, ...(skippedRows.length ? { skippedRows } : {}) };
}
export function parseKeywordCSV(csv) {
    const rows = parseCsvRows(csv);
    if (!rows.length)
        return [];
    const header = rows[0].map((value) => value.toLowerCase());
    const localeIndex = header.indexOf('locale');
    const keywordIndex = header.indexOf('keyword');
    const popularityIndex = header.indexOf('popularity');
    const difficultyIndex = header.indexOf('difficulty');
    if (keywordIndex === -1)
        return [];
    const results = [];
    for (const row of rows.slice(1)) {
        const keyword = row[keywordIndex]?.trim();
        if (!keyword)
            continue;
        const localeValue = localeIndex >= 0 ? row[localeIndex] : '';
        const locale = localeValue ? normalizeLocale(localeValue) : '';
        const popularityRaw = popularityIndex >= 0 ? row[popularityIndex] : '';
        const difficultyRaw = difficultyIndex >= 0 ? row[difficultyIndex] : '';
        const popularity = parseOptionalNumeric(popularityRaw);
        const difficulty = parseOptionalNumeric(difficultyRaw);
        results.push({
            locale,
            keyword,
            popularity,
            difficulty,
        });
    }
    return results;
}
export function groupKeywordsByLocale(rows) {
    const grouped = {};
    for (const row of rows) {
        const locale = row.locale || '*';
        if (!grouped[locale])
            grouped[locale] = [];
        grouped[locale].push({
            keyword: row.keyword,
            popularity: row.popularity,
            difficulty: row.difficulty,
        });
    }
    return grouped;
}
export function parseAsoKeywordCSV(csv) {
    const table = parseCsvTable(csv);
    if (!table.header.length)
        return { rows: [], errors: [] };
    const mapping = mapAsoColumnsFromHeader(table.header);
    return mapCsvTableToAsoKeywordRows(table, mapping);
}
