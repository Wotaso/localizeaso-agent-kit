import { FIELD_LIMITS } from './limits.js';
import { findDuplicateKeywords } from './dedupe.js';
const SCREENSHOT_APPLY_PLAN_FINGERPRINT_RE = /^screenshot-apply-plan-v1:[a-f0-9]{16}:\d+$/;
const FIELD_APPLY_PLAN_FINGERPRINT_RE = /^field-apply-plan-v1:[a-f0-9]{16}:\d+$/;
const EXPECTED_APPLY_PLAN_FINGERPRINT_RE = /\s--expected-apply-plan-fingerprint(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/;
export function normalizeScreenshotApplyPlanFingerprint(value) {
    const fingerprint = typeof value === 'string' ? value.trim() : '';
    return SCREENSHOT_APPLY_PLAN_FINGERPRINT_RE.test(fingerprint) ? fingerprint : '';
}
export function normalizeFieldApplyPlanFingerprint(value) {
    const fingerprint = typeof value === 'string' ? value.trim() : '';
    return FIELD_APPLY_PLAN_FINGERPRINT_RE.test(fingerprint) ? fingerprint : '';
}
export function isScreenshotApplyPlanFingerprint(value) {
    return normalizeScreenshotApplyPlanFingerprint(value).length > 0;
}
export function isFieldApplyPlanFingerprint(value) {
    return normalizeFieldApplyPlanFingerprint(value).length > 0;
}
export function expectedApplyPlanFingerprintFromCommand(value) {
    const command = typeof value === 'string' ? value.trim() : '';
    const match = command.match(EXPECTED_APPLY_PLAN_FINGERPRINT_RE);
    return match ? (match[1] || match[2] || match[3] || '').trim() : '';
}
export function hasValidExpectedApplyPlanFingerprint(value) {
    const fingerprint = expectedApplyPlanFingerprintFromCommand(value);
    return isFieldApplyPlanFingerprint(fingerprint) || isScreenshotApplyPlanFingerprint(fingerprint);
}
const FIELD_POST_APPROVAL_MUTATION_COMMAND_RE = /\b(?:field-apply-drafts|field-apply-keywords|field-metadata-files|field-pricing-payload|field-submit-metadata|field-submit-pricing)\b/;
const STATUS_COMMAND_RE = /\b(?:status|field-status)\b/;
const FIELD_STATUS_COMMAND_RE = /\bfield-status\b/;
const APPLIED_OR_SUBMITTED_STATUS_RE = /\s--status(?:=|\s+)(?:applied|submitted)\b/;
export function hasExpectedApplyPlanFingerprintForCommandFamily(value) {
    const command = typeof value === 'string' ? value.trim() : '';
    if (!command)
        return false;
    const fingerprint = expectedApplyPlanFingerprintFromCommand(command);
    if (FIELD_POST_APPROVAL_MUTATION_COMMAND_RE.test(command)) {
        return isFieldApplyPlanFingerprint(fingerprint);
    }
    if (FIELD_STATUS_COMMAND_RE.test(command) && APPLIED_OR_SUBMITTED_STATUS_RE.test(command)) {
        return isFieldApplyPlanFingerprint(fingerprint);
    }
    if (STATUS_COMMAND_RE.test(command) && APPLIED_OR_SUBMITTED_STATUS_RE.test(command)) {
        return isScreenshotApplyPlanFingerprint(fingerprint);
    }
    return false;
}
const DEFAULT_REQUIRED_FIELDS = [
    'title',
    'subtitle',
    'keywords',
    'description',
];
export function validateLocaleFields(locale, fields, options) {
    const errors = [];
    const requiredFields = options?.requiredFields ?? DEFAULT_REQUIRED_FIELDS;
    for (const field of requiredFields) {
        const value = fields[field];
        if (!value || value.trim().length === 0) {
            errors.push({
                locale,
                field,
                code: 'required',
                severity: 'error',
                message: `${field} is required`,
            });
        }
    }
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
        const typedField = field;
        const value = fields[typedField];
        if (!value)
            continue;
        const length = value.length;
        if (length > limit) {
            errors.push({
                locale,
                field: typedField,
                code: 'limit',
                severity: 'error',
                message: `${field} exceeds ${limit} characters`,
                limit,
                length,
            });
        }
    }
    const duplicates = findDuplicateKeywords({
        title: fields.title,
        subtitle: fields.subtitle,
        keywords: fields.keywords,
    });
    if (duplicates.length) {
        errors.push({
            locale,
            field: 'keywords',
            code: 'duplicate',
            severity: 'warning',
            message: 'Duplicate keywords across title/subtitle/keywords',
            duplicates: duplicates.map((entry) => entry.keyword),
            duplicateDetails: duplicates,
        });
    }
    return { ok: errors.filter((e) => e.severity === 'error').length === 0, errors };
}
export function validateAllLocales(locales, options) {
    const errors = [];
    for (const [locale, fields] of Object.entries(locales)) {
        const result = validateLocaleFields(locale, fields, options);
        errors.push(...result.errors);
    }
    return { ok: errors.filter((error) => error.severity === 'error').length === 0, errors };
}
