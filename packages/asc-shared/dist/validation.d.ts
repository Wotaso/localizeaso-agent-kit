import { type DuplicateEntry } from './dedupe.js';
export declare function normalizeScreenshotApplyPlanFingerprint(value: string | null | undefined): string;
export declare function normalizeFieldApplyPlanFingerprint(value: string | null | undefined): string;
export declare function isScreenshotApplyPlanFingerprint(value: string | null | undefined): boolean;
export declare function isFieldApplyPlanFingerprint(value: string | null | undefined): boolean;
export declare function expectedApplyPlanFingerprintFromCommand(value: string | null | undefined): string;
export declare function hasValidExpectedApplyPlanFingerprint(value: string | null | undefined): boolean;
export declare function hasExpectedApplyPlanFingerprintForCommandFamily(value: string | null | undefined): boolean;
export type MetadataFields = {
    title?: string;
    subtitle?: string;
    keywords?: string;
    promotionalText?: string;
    description?: string;
    whatsNew?: string;
    releaseNotes?: string;
};
export type ValidationError = {
    locale: string;
    field: keyof MetadataFields | 'keywords';
    code: 'required' | 'limit' | 'duplicate' | 'banned';
    severity: 'error' | 'warning';
    message: string;
    limit?: number;
    length?: number;
    duplicates?: string[];
    duplicateDetails?: DuplicateEntry[];
};
export type ValidationResult = {
    ok: boolean;
    errors: ValidationError[];
};
export declare function validateLocaleFields(locale: string, fields: MetadataFields, options?: {
    requiredFields?: Array<keyof MetadataFields>;
}): ValidationResult;
export declare function validateAllLocales(locales: Record<string, MetadataFields>, options?: {
    requiredFields?: Array<keyof MetadataFields>;
}): {
    ok: boolean;
    errors: ValidationError[];
};
//# sourceMappingURL=validation.d.ts.map