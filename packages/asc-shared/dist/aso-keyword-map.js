function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeLocaleKey(value) {
    return value.trim().replace(/_/g, '-');
}
function normalizeKeyword(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function finiteRoundedNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}
function normalizeKeywordContext(value) {
    if (!isRecord(value))
        return { sources: [], keywords: {}, rows: [] };
    const sources = Array.isArray(value.sources)
        ? Array.from(new Set(value.sources.map(cleanString).filter(Boolean)))
        : [];
    const keywords = {};
    if (isRecord(value.keywords)) {
        for (const [locale, rawKeywords] of Object.entries(value.keywords)) {
            if (!Array.isArray(rawKeywords))
                continue;
            const normalizedLocale = normalizeLocaleKey(locale);
            keywords[normalizedLocale] = Array.from(new Set(rawKeywords.map(cleanString).filter(Boolean)));
        }
    }
    const rows = [];
    if (Array.isArray(value.rows)) {
        for (const row of value.rows) {
            if (!isRecord(row))
                continue;
            const locale = normalizeLocaleKey(cleanString(row.locale));
            const keyword = cleanString(row.keyword);
            if (!locale || !keyword)
                continue;
            rows.push({
                locale,
                keyword,
                normalizedKeyword: normalizeKeyword(keyword),
                popularity: finiteRoundedNumber(row.popularity),
                difficulty: finiteRoundedNumber(row.difficulty),
                isPreferred: typeof row.isPreferred === 'boolean' ? row.isPreferred : undefined,
                source: cleanString(row.source) || undefined,
            });
        }
    }
    for (const [locale, localeKeywords] of Object.entries(keywords)) {
        for (const keyword of localeKeywords) {
            const normalizedKeyword = normalizeKeyword(keyword);
            if (rows.some((row) => row.locale === locale && row.normalizedKeyword === normalizedKeyword)) {
                continue;
            }
            rows.push({ locale, keyword, normalizedKeyword });
        }
    }
    return { sources, keywords, rows };
}
function fieldIndexedForAppleSearch(field) {
    const normalizedField = field.toLowerCase();
    return ['name', 'title', 'subtitle', 'keywords', 'keyword', 'keywordfield', 'screenshotcaption'].includes(normalizedField.replace(/[^a-z]/g, ''));
}
function indexedFieldNote(field) {
    return fieldIndexedForAppleSearch(field)
        ? 'Indexed by Apple search signals.'
        : 'Not a primary Apple search keyword field; use as conversion/context signal.';
}
function matchKeywordInValue(value, keyword) {
    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword)
        return [];
    const normalizedValue = normalizeKeyword(value);
    const positions = [];
    let fromIndex = 0;
    while (fromIndex < normalizedValue.length) {
        const matchIndex = normalizedValue.indexOf(normalizedKeyword, fromIndex);
        if (matchIndex === -1)
            break;
        positions.push({
            start: matchIndex,
            end: matchIndex + normalizedKeyword.length,
            text: value.slice(matchIndex, matchIndex + normalizedKeyword.length),
        });
        fromIndex = matchIndex + Math.max(1, normalizedKeyword.length);
    }
    return positions;
}
function issue(params) {
    return {
        severity: params.severity ?? 'warning',
        code: params.code,
        message: params.message,
        locale: params.locale,
        field: params.field,
        keyword: params.keyword,
    };
}
export function buildAsoKeywordDetectionReport(input) {
    const keywordContext = normalizeKeywordContext(input.keywordContext);
    const locales = Array.from(new Set([
        ...Object.keys(input.metadataByLocale).map(normalizeLocaleKey),
        ...keywordContext.rows.map((row) => row.locale),
        ...Object.keys(keywordContext.keywords).map(normalizeLocaleKey),
    ]))
        .filter(Boolean)
        .sort();
    const globalWarnings = [];
    const globalErrors = [];
    if (!keywordContext.rows.length) {
        globalWarnings.push(issue({
            code: 'keyword_context_missing',
            message: 'No keyword context rows are attached; ASO keyword detection can only report metadata fields.',
        }));
    }
    const localeReports = locales.map((locale) => {
        const metadataFields = input.metadataByLocale[locale] ?? {};
        const keywords = keywordContext.rows.filter((row) => row.locale === locale);
        const fieldReports = [];
        const warnings = [];
        const errors = [];
        if (!Object.keys(metadataFields).length) {
            errors.push(issue({
                severity: 'error',
                code: 'metadata_snapshot_missing',
                message: `No metadata snapshot fields were found for ${locale}.`,
                locale,
            }));
        }
        if (!keywords.length) {
            warnings.push(issue({
                code: 'locale_keyword_context_missing',
                message: `No ASO keyword rows were found for ${locale}.`,
                locale,
            }));
        }
        for (const [field, rawValue] of Object.entries(metadataFields).sort(([a], [b]) => a.localeCompare(b))) {
            const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
            const fieldWarnings = [];
            const matches = [];
            for (const keyword of keywords) {
                const positions = matchKeywordInValue(value, keyword.keyword);
                if (!positions.length)
                    continue;
                matches.push({
                    ...keyword,
                    matchCount: positions.length,
                    positions,
                });
                if (positions.length > 1) {
                    fieldWarnings.push(issue({
                        code: 'keyword_repeated_in_field',
                        message: `Keyword "${keyword.keyword}" appears ${positions.length} times in ${field}.`,
                        locale,
                        field,
                        keyword: keyword.keyword,
                    }));
                }
            }
            if (!fieldIndexedForAppleSearch(field) && matches.length) {
                fieldWarnings.push(issue({
                    severity: 'info',
                    code: 'non_indexed_field_keyword_match',
                    message: `${field} contains matched keyword context but is not a primary Apple indexed metadata field.`,
                    locale,
                    field,
                }));
            }
            fieldReports.push({
                field,
                value,
                indexedForAppleSearch: fieldIndexedForAppleSearch(field),
                notes: [indexedFieldNote(field)],
                matches,
                warnings: fieldWarnings,
            });
            warnings.push(...fieldWarnings.filter((warning) => warning.severity !== 'info'));
        }
        const coverage = keywords.map((keyword) => {
            const fields = fieldReports
                .map((field) => {
                const match = field.matches.find((candidate) => candidate.normalizedKeyword === keyword.normalizedKeyword);
                return match
                    ? { field: field.field, matchCount: match.matchCount, positions: match.positions }
                    : null;
            })
                .filter((field) => Boolean(field));
            const keywordWarnings = [];
            if (!fields.length) {
                keywordWarnings.push(issue({
                    code: 'keyword_not_detected',
                    message: `Keyword "${keyword.keyword}" is not detected in any metadata field for ${locale}.`,
                    locale,
                    keyword: keyword.keyword,
                }));
            }
            if (fields.length > 1) {
                keywordWarnings.push(issue({
                    code: 'keyword_detected_in_multiple_fields',
                    message: `Keyword "${keyword.keyword}" appears in ${fields.length} metadata fields for ${locale}.`,
                    locale,
                    keyword: keyword.keyword,
                }));
            }
            if (typeof keyword.difficulty === 'number' && keyword.difficulty >= 70) {
                keywordWarnings.push(issue({
                    severity: 'info',
                    code: 'high_difficulty_keyword',
                    message: `Keyword "${keyword.keyword}" has high difficulty (${keyword.difficulty}).`,
                    locale,
                    keyword: keyword.keyword,
                }));
            }
            if (typeof keyword.popularity === 'number' && keyword.popularity <= 20) {
                keywordWarnings.push(issue({
                    severity: 'info',
                    code: 'low_popularity_keyword',
                    message: `Keyword "${keyword.keyword}" has low popularity (${keyword.popularity}).`,
                    locale,
                    keyword: keyword.keyword,
                }));
            }
            warnings.push(...keywordWarnings.filter((warning) => warning.severity !== 'info'));
            return {
                ...keyword,
                detected: fields.length > 0,
                fields,
                warnings: keywordWarnings,
            };
        });
        return {
            locale,
            fields: fieldReports,
            keywordCoverage: coverage,
            unassignedKeywords: coverage.filter((keyword) => !keyword.detected),
            warnings,
            errors,
        };
    });
    const allWarnings = [
        ...globalWarnings,
        ...localeReports.flatMap((locale) => locale.warnings),
    ];
    const allErrors = [
        ...globalErrors,
        ...localeReports.flatMap((locale) => locale.errors),
    ];
    const fieldCount = localeReports.reduce((sum, locale) => sum + locale.fields.length, 0);
    const keywordKeys = new Set(localeReports.flatMap((locale) => locale.keywordCoverage.map((keyword) => `${locale.locale}|${keyword.normalizedKeyword}`)));
    const detectedKeywordCount = localeReports.reduce((sum, locale) => sum + locale.keywordCoverage.filter((keyword) => keyword.detected).length, 0);
    const unassignedKeywordCount = localeReports.reduce((sum, locale) => sum + locale.unassignedKeywords.length, 0);
    return {
        kind: 'localizeaso_aso_keyword_detection_report',
        version: 1,
        surface: input.surface,
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        agentCompatibility: {
            audience: 'any_coding_agent',
            protocol: 'provider_neutral_json',
            requiresHumanApprovalBeforeApply: true,
            notes: [
                'Any coding agent can consume this report; it is not tied to a specific agent vendor or hosted LocalizeASO model.',
                'Use keywordCoverage, fields.matches, unassignedKeywords, warnings, and errors as proposal context only.',
                'The report is read-only and never grants approval, apply, publish, or App Store Connect submit permission.',
            ],
        },
        agents: input.agents ?? ['any-coding-agent'],
        source: {
            metadataSnapshotKeys: input.metadataSnapshotKeys ?? [],
            keywordContextSources: keywordContext.sources,
        },
        summary: {
            localeCount: localeReports.length,
            fieldCount,
            keywordCount: keywordKeys.size,
            detectedKeywordCount,
            unassignedKeywordCount,
            warningCount: allWarnings.length,
            errorCount: allErrors.length,
        },
        locales: localeReports,
        warnings: allWarnings,
        errors: allErrors,
    };
}
