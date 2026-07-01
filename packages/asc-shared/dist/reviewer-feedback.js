const REVIEWER_FEEDBACK_PREFIX = /^\s*(?:[-*]\s*)?(?:>\s*)?Reviewer feedback:\s*/i;
const RELATED_PROPOSAL_PREFIX = /^\s*(?:[-*]\s*)?(?:>\s*)?Related proposal:\s*/i;
const SCOPE_PREFIX = /^\s*(?:[-*]\s*)?(?:>\s*)?Scope:\s*/i;
const CONTEXT_SNAPSHOT_PREFIX = /^\s*(?:[-*]\s*)?(?:>\s*)?Context snapshot:\s*/i;
export const REVIEWER_FEEDBACK_CONTEXT_SNAPSHOT_MAX_LENGTH = 12000;
const TRUNCATED_CONTEXT_SNAPSHOT_SUFFIX = '\n[LocalizeASO truncated reviewer context snapshot; copy a narrower locale/field/frame selection if more detail is needed.]';
export function normalizeReviewerFeedbackInstructions(value) {
    return value.replace(/\s+/g, ' ').trim();
}
export function normalizeReviewerFeedbackContextSnapshot(value) {
    const normalized = value
        ?.replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim() ?? '';
    if (normalized.length <= REVIEWER_FEEDBACK_CONTEXT_SNAPSHOT_MAX_LENGTH)
        return normalized;
    const maxBodyLength = Math.max(0, REVIEWER_FEEDBACK_CONTEXT_SNAPSHOT_MAX_LENGTH - TRUNCATED_CONTEXT_SNAPSHOT_SUFFIX.length);
    return `${normalized.slice(0, maxBodyLength).trimEnd()}${TRUNCATED_CONTEXT_SNAPSHOT_SUFFIX}`;
}
export function formatReviewerFeedbackContextSnapshotLine(value) {
    const normalized = normalizeReviewerFeedbackContextSnapshot(value);
    if (!normalized)
        return null;
    return `Context snapshot: ${JSON.stringify(normalized)}`;
}
function parseContextSnapshotLine(line) {
    const rawValue = line.replace(CONTEXT_SNAPSHOT_PREFIX, '').trim();
    if (!rawValue)
        return null;
    try {
        const parsed = JSON.parse(rawValue);
        if (typeof parsed === 'string')
            return normalizeReviewerFeedbackContextSnapshot(parsed);
    }
    catch {
        // Backward-compatible fallback for unquoted context snapshot lines.
    }
    return normalizeReviewerFeedbackContextSnapshot(rawValue);
}
export function reviewerFeedbackScopeDisplay(scope) {
    const summaryPrefix = 'Summary:';
    const values = (scope ?? []).map((item) => item.trim()).filter(Boolean);
    const summary = values.find((item) => item.startsWith(summaryPrefix))?.slice(summaryPrefix.length).trim() ?? null;
    const details = values.filter((item) => !item.startsWith(summaryPrefix));
    return { summary, details };
}
export function parseReviewerFeedbackRequests(value) {
    if (!value?.trim())
        return [];
    return value
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => REVIEWER_FEEDBACK_PREFIX.test(block))
        .map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const instructionLines = [];
        const scope = [];
        let proposalId;
        let contextSnapshot;
        for (const [lineIndex, line] of lines.entries()) {
            if (lineIndex === 0) {
                instructionLines.push(line.replace(REVIEWER_FEEDBACK_PREFIX, '').trim());
                continue;
            }
            if (RELATED_PROPOSAL_PREFIX.test(line)) {
                proposalId = line.replace(RELATED_PROPOSAL_PREFIX, '').trim() || null;
                continue;
            }
            if (SCOPE_PREFIX.test(line)) {
                scope.push(line.replace(SCOPE_PREFIX, '').trim());
                continue;
            }
            if (CONTEXT_SNAPSHOT_PREFIX.test(line)) {
                contextSnapshot = parseContextSnapshotLine(line);
                continue;
            }
            instructionLines.push(line);
        }
        return {
            index,
            instructions: instructionLines.join('\n').trim(),
            proposalId,
            scope,
            ...(contextSnapshot ? { contextSnapshot } : {}),
            raw: block,
        };
    })
        .filter((request) => request.instructions.length > 0);
}
export function latestReviewerFeedbackRequest(value) {
    const requests = parseReviewerFeedbackRequests(value);
    return requests.length ? requests[requests.length - 1] : null;
}
