import type { AppStoreFieldReviewProposal, AppStoreFieldReviewTarget } from './app-store-review.js';
import type { ScreenshotReviewProposalPayload } from './screenshot-review.js';
export type ReviewSignalAuditSummary = {
    totalTargets: number;
    keywordMappingNotApplicableCount: number;
    missingKeywordMappingCount: number;
    missingRationaleCount: number;
    noWarningsReportedCount: number;
    targetsNeedingAttentionCount: number;
    allTargetsHaveReviewSignals: boolean;
};
export type ReviewSignalGapSummaryLineInput = {
    keywordMappingNotApplicableCount?: number | null;
    missingKeywordMappingCount?: number | null;
    missingRationaleCount?: number | null;
    noWarningsReportedCount?: number | null;
    screenshotEvidenceGapCount?: number | null;
};
export declare function formatReviewSignalGapSummaryLine(input: ReviewSignalGapSummaryLineInput, options?: {
    keywordMappingNotApplicable?: boolean;
    includeNoGaps?: boolean;
}): string;
export type ReviewSignalAuditInput = {
    assignedKeywords?: string[] | null;
    unassignedKeywords?: string[] | null;
    warnings?: string[] | null;
    rationale?: string | null;
    keywordMappingNotApplicable?: boolean | null;
};
export type ReviewSignalContract = {
    kind: 'localizeaso_review_signal_contract';
    requiredPerTarget: Array<'assignedKeywords' | 'unassignedKeywords' | 'warnings' | 'rationale'>;
    requiredPerTargetLabels?: string[];
    requiredReviewContext?: string[];
    requiredReviewContextLabels?: string[];
    targetLevels: string[];
    emptySignalsMeanConsidered: true;
    qualityGates: {
        missingKeywordMapping: string;
        missingRationale: string;
        noWarningsReported: string;
    };
    agentInstruction: string;
    humanReviewInstruction: string;
};
export declare function normalizeReviewSignalList(values: string[] | undefined | null): string[];
export declare function reviewSignalCount(values: string[] | undefined | null): number;
export declare function uniqueReviewSignalCount(values: Array<string[] | undefined | null>): number;
export declare function hasReviewSignals(values: string[] | undefined | null): boolean;
export declare function reviewSignalAudit(input: ReviewSignalAuditInput): {
    hasAssignedKeywords: boolean;
    hasUnassignedKeywords: boolean;
    keywordMappingNotApplicable: boolean;
    hasKeywordMapping: boolean;
    hasWarnings: boolean;
    hasRationale: boolean;
    missingReviewSignals: string[];
    noWarningsReported: boolean;
    needsReviewerAttention: boolean;
};
export declare function reviewSignalAuditSummary(inputs: ReviewSignalAuditInput[]): ReviewSignalAuditSummary;
export declare function screenshotReviewSignalAuditInputs(payload: ScreenshotReviewProposalPayload): ReviewSignalAuditInput[];
export declare function screenshotReviewSignalAuditSummary(payload: ScreenshotReviewProposalPayload): ReviewSignalAuditSummary;
export declare function fieldReviewSignalAuditInputs(proposal: AppStoreFieldReviewProposal): ReviewSignalAuditInput[];
export declare function fieldReviewSignalAuditSummary(proposal: AppStoreFieldReviewProposal): ReviewSignalAuditSummary;
export type ReviewGateSummary = {
    kind: 'localizeaso_review_readiness_gate';
    reviewKind: 'screenshots' | 'field';
    ready: boolean;
    humanDecisionGate: 'complete' | 'pending';
    signalGate: 'complete' | 'attention_required' | 'unknown';
    pendingTargetCount: number;
    targetsNeedingAttentionCount: number;
    keywordMappingNotApplicableCount: number;
    missingKeywordMappingCount: number;
    missingRationaleCount: number;
    noWarningsReportedCount: number;
    screenshotEvidenceGapCount?: number;
    screenshotMissingTargetCount?: number;
    screenshotFallbackOnlyTargetCount?: number;
    screenshotContextOnlyTargetCount?: number;
    screenshotStrongEvidenceTargetCount?: number;
    screenshotWeakEvidenceTargetCount?: number;
    warnings: string[];
    agentInstruction: string;
};
export type ReviewReadinessBoundary = {
    kind: 'localizeaso_readiness_boundary';
    reviewKind: ReviewGateSummary['reviewKind'];
    readOnly: true;
    mutatesReviewData: false;
    mutatesAppStoreConnect: false;
    approvalGranted: false;
    postApprovalActionAllowed: false;
    requiresHumanApprovalConsent: true;
    requiresHumanPostApprovalConsentForApplySubmit: true;
    protectedActions: string[];
    nextHumanAction: string;
    agentInstruction: string;
};
export type FieldReviewFinalValueBlockingIssue = {
    target: AppStoreFieldReviewTarget;
    code: 'INVALID_PRICING_FINAL_VALUE' | 'INVALID_METADATA_FINAL_VALUE' | 'INVALID_KEYWORD_FINAL_VALUE';
    message: string;
};
export type FieldReviewFinalValueGate = {
    kind: 'localizeaso_field_final_value_gate';
    ready: boolean;
    status: 'clear' | 'blocked';
    blockingIssueCount: number;
    warnings: string[];
    agentInstruction: string;
};
export type ReadinessReviewGate = {
    kind: 'localizeaso_readiness_review_gate';
    phase: 'readiness_inspection';
    reviewKind: ReviewGateSummary['reviewKind'];
    ready: boolean;
    humanReviewRequired: true;
    readOnly: boolean;
    approvalGranted: boolean;
    postApprovalActionAllowed: boolean;
    pendingTargetCount?: number;
    humanDecisionGate?: ReviewGateSummary['humanDecisionGate'];
    signalGate?: ReviewGateSummary['signalGate'];
    keywordMappingNotApplicableCount?: number;
    screenshotEvidenceGapCount?: number;
    screenshotMissingTargetCount?: number;
    screenshotFallbackOnlyTargetCount?: number;
    screenshotContextOnlyTargetCount?: number;
    screenshotStrongEvidenceTargetCount?: number;
    screenshotWeakEvidenceTargetCount?: number;
    finalValueGateStatus?: FieldReviewFinalValueGate['status'];
    finalValueBlockingIssueCount?: number;
    warnings: string[];
    nextHumanAction: string;
    agentInstruction: string;
};
export declare function buildReviewGateSummary(params: {
    reviewKind: ReviewGateSummary['reviewKind'];
    ready: boolean;
    pendingTargetCount: number;
    signalAudit?: ReviewSignalAuditSummary | null;
    screenshotEvidence?: {
        missingTargetCount?: number | null;
        fallbackOnlyTargetCount?: number | null;
        contextOnlyTargetCount?: number | null;
        strongEvidenceTargetCount?: number | null;
        weakEvidenceTargetCount?: number | null;
    } | null;
}): ReviewGateSummary;
export declare function buildReviewReadinessBoundary(params: {
    reviewKind: ReviewGateSummary['reviewKind'];
    ready: boolean;
}): ReviewReadinessBoundary;
export declare function summarizeFieldReviewFinalValueBlockingIssue(issue: FieldReviewFinalValueBlockingIssue | unknown, index?: number): string;
export declare function buildFieldReviewFinalValueGate(blockingIssues: FieldReviewFinalValueBlockingIssue[]): FieldReviewFinalValueGate;
export declare function buildReadinessReviewGate(params: {
    reviewKind: ReviewGateSummary['reviewKind'];
    ready?: boolean;
    reviewGateSummary?: ReviewGateSummary | null;
    readinessBoundary?: ReviewReadinessBoundary | null;
    finalValueGate?: FieldReviewFinalValueGate | null;
    pendingTargetCount?: number;
}): ReadinessReviewGate;
//# sourceMappingURL=review-gate-summary.d.ts.map