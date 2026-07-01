export type AsoKeywordMapSurface = 'metadata' | 'keywords';
export type AsoKeywordMapAgent = 'any-coding-agent' | string;
export type AsoKeywordMapAgentCompatibility = {
    audience: 'any_coding_agent';
    protocol: 'provider_neutral_json';
    requiresHumanApprovalBeforeApply: true;
    notes: string[];
};
export type AsoKeywordMapSeverity = 'info' | 'warning' | 'error';
export type AsoKeywordMapIssue = {
    severity: AsoKeywordMapSeverity;
    code: string;
    message: string;
    locale?: string;
    field?: string;
    keyword?: string;
};
export type AsoKeywordMapMetric = {
    locale: string;
    keyword: string;
    normalizedKeyword: string;
    popularity?: number;
    difficulty?: number;
    isPreferred?: boolean;
    source?: string;
};
export type AsoKeywordMapMatchPosition = {
    start: number;
    end: number;
    text: string;
};
export type AsoKeywordMapFieldMatch = AsoKeywordMapMetric & {
    matchCount: number;
    positions: AsoKeywordMapMatchPosition[];
};
export type AsoKeywordMapField = {
    field: string;
    value: string;
    indexedForAppleSearch: boolean;
    notes: string[];
    matches: AsoKeywordMapFieldMatch[];
    warnings: AsoKeywordMapIssue[];
};
export type AsoKeywordMapKeywordCoverage = AsoKeywordMapMetric & {
    detected: boolean;
    fields: Array<{
        field: string;
        matchCount: number;
        positions: AsoKeywordMapMatchPosition[];
    }>;
    warnings: AsoKeywordMapIssue[];
};
export type AsoKeywordMapLocale = {
    locale: string;
    fields: AsoKeywordMapField[];
    keywordCoverage: AsoKeywordMapKeywordCoverage[];
    unassignedKeywords: AsoKeywordMapKeywordCoverage[];
    warnings: AsoKeywordMapIssue[];
    errors: AsoKeywordMapIssue[];
};
export type AsoKeywordDetectionReport = {
    kind: 'localizeaso_aso_keyword_detection_report';
    version: 1;
    surface: AsoKeywordMapSurface;
    generatedAt: string;
    agentCompatibility: AsoKeywordMapAgentCompatibility;
    agents: AsoKeywordMapAgent[];
    source: {
        metadataSnapshotKeys: string[];
        keywordContextSources: string[];
    };
    summary: {
        localeCount: number;
        fieldCount: number;
        keywordCount: number;
        detectedKeywordCount: number;
        unassignedKeywordCount: number;
        warningCount: number;
        errorCount: number;
    };
    locales: AsoKeywordMapLocale[];
    warnings: AsoKeywordMapIssue[];
    errors: AsoKeywordMapIssue[];
};
export type AsoKeywordDetectionReportInput = {
    surface: AsoKeywordMapSurface;
    metadataByLocale: Record<string, Record<string, unknown>>;
    keywordContext?: unknown;
    agents?: AsoKeywordMapAgent[];
    generatedAt?: string;
    metadataSnapshotKeys?: string[];
};
export declare function buildAsoKeywordDetectionReport(input: AsoKeywordDetectionReportInput): AsoKeywordDetectionReport;
//# sourceMappingURL=aso-keyword-map.d.ts.map