export type KeywordField = "title" | "subtitle" | "keywords";
export type DuplicateEntry = {
    keyword: string;
    fields: KeywordField[];
};
export declare const DEFAULT_IGNORED_DUPLICATE_KEYWORDS: readonly ["a", "an", "and", "or", "the", "to", "for", "of", "in", "on", "with", "der", "die", "das", "und", "mit", "fur", "fuer", "de", "la", "le", "les", "et", "el", "los", "las", "y", "en", "para", "con", "por", "il", "lo", "gli", "e", "di", "per", "com"];
export declare function normalizeKeywordToken(value: string): string;
export declare function tokenizeText(value: string): string[];
export declare function tokenizeKeywordField(value: string): string[];
export declare function findDuplicateKeywords(fields: {
    title?: string;
    subtitle?: string;
    keywords?: string;
}, options?: {
    ignoreKeywords?: Iterable<string>;
}): DuplicateEntry[];
//# sourceMappingURL=dedupe.d.ts.map