export type KeywordCSVRow = {
    locale: string;
    keyword: string;
    popularity?: number;
    difficulty?: number;
};
export type KeywordCandidate = {
    keyword: string;
    popularity?: number;
    difficulty?: number;
};
export type AsoKeywordImportRow = {
    locale: string;
    keyword: string;
    popularity?: number;
    difficulty?: number;
    isPreferred?: boolean;
};
export type AsoKeywordImportResult = {
    rows: AsoKeywordImportRow[];
    errors: string[];
    skippedRows?: Array<{
        rowNumber: number;
        reason: 'unmapped_locale';
        localeRaw: string;
        keyword: string;
    }>;
};
export type AsoKeywordRowMappingOptions = {
    localeResolver?: (value: string) => string;
    allowUnmappedLocales?: boolean;
};
export declare const ASO_KEYWORD_IMPORT_FIELDS: readonly ["locale", "keyword", "popularity", "difficulty", "isPreferred"];
export type AsoKeywordImportField = (typeof ASO_KEYWORD_IMPORT_FIELDS)[number];
export type AsoKeywordColumnMapping = Record<AsoKeywordImportField, number | null>;
export type ParsedCsvTable = {
    header: string[];
    rows: string[][];
};
export declare function parseKeywordList(input: string): string[];
export declare function parseCsvRows(input: string): string[][];
export declare function parseCsvTable(csv: string): ParsedCsvTable;
export declare function suggestAsoKeywordColumnMapping(header: string[]): AsoKeywordColumnMapping;
export declare function mapCsvTableToAsoKeywordRows(table: ParsedCsvTable, mapping: AsoKeywordColumnMapping, options?: AsoKeywordRowMappingOptions): AsoKeywordImportResult;
export declare function parseKeywordCSV(csv: string): KeywordCSVRow[];
export declare function groupKeywordsByLocale(rows: KeywordCSVRow[]): Record<string, KeywordCandidate[]>;
export declare function parseAsoKeywordCSV(csv: string): AsoKeywordImportResult;
//# sourceMappingURL=keywords.d.ts.map