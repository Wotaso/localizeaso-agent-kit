export const APP_STORE_REVIEW_SURFACE_VALUES = ['metadata', 'keywords', 'screenshots', 'pricing'];
export const APP_STORE_FIELD_REVIEW_SURFACE_VALUES = ['metadata', 'keywords', 'pricing'];
export const APP_STORE_FIELD_REVIEW_DECISION_VALUES = [
    'pending',
    'accepted',
    'edited',
    'rejected',
];
export function approvalSignalPreviewAudit(preview, options) {
    if (!preview)
        return null;
    if (options?.reviewSurface === 'pricing') {
        const missingGroups = [];
        const hasAssignedKeywords = Object.prototype.hasOwnProperty.call(preview, 'assignedKeywords');
        const hasUnassignedKeywords = Object.prototype.hasOwnProperty.call(preview, 'unassignedKeywords');
        if (!hasAssignedKeywords || !hasUnassignedKeywords) {
            missingGroups.push('Keyword mapping not applicable');
        }
        if (!Object.prototype.hasOwnProperty.call(preview, 'warnings')) {
            missingGroups.push('Warnings');
        }
        if (!Object.prototype.hasOwnProperty.call(preview, 'rationales')) {
            missingGroups.push('Rationales');
        }
        if (missingGroups.length) {
            return {
                status: 'missing',
                message: `Approval receipt is missing explicit signal groups: ${missingGroups.join(', ')}.`,
                missingGroups,
            };
        }
        const emptyGroups = [];
        if (!preview.assignedKeywords?.length && !preview.unassignedKeywords?.length) {
            emptyGroups.push('Keyword mapping not applicable');
        }
        if (!preview.warnings?.length)
            emptyGroups.push('Warnings');
        if (!preview.rationales?.length)
            emptyGroups.push('Rationales');
        return {
            status: 'complete',
            message: emptyGroups.length
                ? `All approval signal groups were captured; empty groups were explicitly reviewed: ${emptyGroups.join(', ')}.`
                : 'All approval signal groups were captured with visible agent-review evidence.',
            missingGroups: [],
        };
    }
    const groups = [
        ['Used keywords', 'assignedKeywords'],
        ['Unassigned keywords', 'unassignedKeywords'],
        ['Warnings', 'warnings'],
        ['Rationales', 'rationales'],
    ];
    const missingGroups = groups
        .filter(([, key]) => !Object.prototype.hasOwnProperty.call(preview, key))
        .map(([label]) => label);
    if (missingGroups.length) {
        return {
            status: 'missing',
            message: `Approval receipt is missing explicit signal groups: ${missingGroups.join(', ')}.`,
            missingGroups,
        };
    }
    const emptyGroups = groups
        .filter(([, key]) => !preview[key]?.length)
        .map(([label]) => label);
    return {
        status: 'complete',
        message: emptyGroups.length
            ? `All approval signal groups were captured; empty groups were explicitly reviewed: ${emptyGroups.join(', ')}.`
            : 'All approval signal groups were captured with visible agent-review evidence.',
        missingGroups: [],
    };
}
export function buildReviewHumanReviewEvidence(input) {
    const isPricingReview = input.reviewSurface === 'pricing';
    const isScreenshotReview = input.reviewSurface === 'screenshots';
    const hasScreenshotEvidenceReview = typeof input.reviewGateSummary?.screenshotEvidenceGapCount === 'number';
    const visibleBeforeApproval = isPricingReview
        ? [
            'current pricing values',
            'agent proposal pricing values',
            'human final pricing values',
            'diffs',
            'pricing evidence',
            'pricing territory context',
            'pricing schedule warnings',
            'keyword mapping marked not applicable',
            'warnings',
            'rationales',
        ]
        : [
            'current values',
            'agent proposal values',
            'human final values',
            'diffs',
            ...(isScreenshotReview ? ['frame/layer refs'] : []),
            'assigned keywords',
            'unassigned keywords',
            'warnings',
            'rationales',
        ];
    if (hasScreenshotEvidenceReview) {
        visibleBeforeApproval.push('screenshot evidence');
    }
    const reviewContextLabels = reviewContextLabelsFromVisibleEvidence(visibleBeforeApproval);
    return {
        visibleBeforeApproval,
        reviewContextLabels,
        reviewContextComplete: reviewContextLabels.length === 4,
        signalGroupsRequired: isPricingReview
            ? [
                'keywordMappingNotApplicable',
                'warnings',
                'rationales',
            ]
            : [
                'assignedKeywords',
                'unassignedKeywords',
                'warnings',
                'rationales',
                ...(hasScreenshotEvidenceReview ? ['screenshotEvidence'] : []),
            ],
        signalGroupLabels: isPricingReview
            ? ['keyword mapping n/a', 'warnings', 'rationale']
            : [
                'assigned keywords',
                'unassigned keywords',
                'warnings',
                'rationale',
                ...(hasScreenshotEvidenceReview ? ['screenshot evidence'] : []),
            ],
        screenshotEvidenceRequired: hasScreenshotEvidenceReview,
        screenshotEvidenceVisible: hasScreenshotEvidenceReview,
        ...(isPricingReview
            ? {
                pricingEvidenceRequired: true,
                pricingEvidenceVisible: true,
            }
            : {}),
        signalPreviewAudit: approvalSignalPreviewAudit(input.signalPreview, {
            reviewSurface: input.reviewSurface,
        }),
        reviewGateSummary: input.reviewGateSummary ?? null,
        signalAudit: input.signalAudit,
        signalGapSummary: buildReviewSignalGapSummary({
            signalAudit: input.signalAudit,
            reviewGateSummary: input.reviewGateSummary ?? null,
        }),
        signalGapConsent: buildReviewSignalGapConsentEvidence({
            signalAudit: input.signalAudit,
            reviewGateSummary: input.reviewGateSummary ?? null,
            granted: input.signalGapConsentGranted,
        }),
        postApprovalHumanOnly: true,
        protectedActionsRemainHumanOnly: true,
        consentRequiredBeforeExternalMutation: true,
    };
}
function reviewContextLabelsFromVisibleEvidence(values) {
    const visible = new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
    const labels = [];
    if (visible.has('current values') ||
        visible.has('current value') ||
        visible.has('current pricing values') ||
        visible.has('source screenshot copy') ||
        visible.has('current screenshot text')) {
        labels.push('current content');
    }
    if (visible.has('agent proposal values') ||
        visible.has('agent proposal value') ||
        visible.has('agent proposal pricing values') ||
        visible.has('agent proposal')) {
        labels.push('agent proposal');
    }
    if (visible.has('human final values') ||
        visible.has('human final value') ||
        visible.has('human final pricing values') ||
        visible.has('final value') ||
        visible.has('final screenshot copy')) {
        labels.push('human final');
    }
    if (visible.has('diffs') || visible.has('diff') || visible.has('current-agent-final diffs')) {
        labels.push('diff');
    }
    return labels;
}
export function buildReviewSignalGapSummary(input) {
    return {
        keywordMappingNotApplicableCount: input.signalAudit.keywordMappingNotApplicableCount,
        missingKeywordMappingCount: input.signalAudit.missingKeywordMappingCount,
        missingRationaleCount: input.signalAudit.missingRationaleCount,
        noWarningsReportedCount: input.signalAudit.noWarningsReportedCount,
        screenshotEvidenceGapCount: input.reviewGateSummary?.screenshotEvidenceGapCount ?? 0,
        ...(typeof input.reviewGateSummary?.screenshotMissingTargetCount === 'number'
            ? { screenshotMissingTargetCount: input.reviewGateSummary.screenshotMissingTargetCount }
            : {}),
        ...(typeof input.reviewGateSummary?.screenshotFallbackOnlyTargetCount === 'number'
            ? { screenshotFallbackOnlyTargetCount: input.reviewGateSummary.screenshotFallbackOnlyTargetCount }
            : {}),
        ...(typeof input.reviewGateSummary?.screenshotContextOnlyTargetCount === 'number'
            ? { screenshotContextOnlyTargetCount: input.reviewGateSummary.screenshotContextOnlyTargetCount }
            : {}),
        ...(typeof input.reviewGateSummary?.screenshotStrongEvidenceTargetCount === 'number'
            ? { screenshotStrongEvidenceTargetCount: input.reviewGateSummary.screenshotStrongEvidenceTargetCount }
            : {}),
        ...(typeof input.reviewGateSummary?.screenshotWeakEvidenceTargetCount === 'number'
            ? { screenshotWeakEvidenceTargetCount: input.reviewGateSummary.screenshotWeakEvidenceTargetCount }
            : {}),
        targetsNeedingAttentionCount: input.signalAudit.targetsNeedingAttentionCount,
        allTargetsHaveReviewSignals: input.signalAudit.allTargetsHaveReviewSignals,
    };
}
export function buildReviewSignalGapConsentEvidence(input) {
    const reasons = [
        input.signalAudit.missingKeywordMappingCount > 0
            ? `${input.signalAudit.missingKeywordMappingCount} target${input.signalAudit.missingKeywordMappingCount === 1 ? '' : 's'} missing keyword mapping`
            : null,
        input.signalAudit.missingRationaleCount > 0
            ? `${input.signalAudit.missingRationaleCount} target${input.signalAudit.missingRationaleCount === 1 ? '' : 's'} missing rationale`
            : null,
        input.signalAudit.noWarningsReportedCount > 0
            ? `${input.signalAudit.noWarningsReportedCount} target${input.signalAudit.noWarningsReportedCount === 1 ? '' : 's'} with no warnings reported`
            : null,
        (input.reviewGateSummary?.screenshotEvidenceGapCount ?? 0) > 0
            ? `${input.reviewGateSummary?.screenshotEvidenceGapCount} target${input.reviewGateSummary?.screenshotEvidenceGapCount === 1 ? '' : 's'} with missing, fallback-only, context-only, or weak screenshot evidence`
            : null,
    ].filter((reason) => Boolean(reason));
    return {
        required: reasons.length > 0,
        granted: reasons.length > 0 && input.granted !== false,
        humanOnly: true,
        consentField: 'humanSignalGapConsent',
        cliFlag: '--human-signal-gap-consent',
        reasons,
        signalAudit: input.signalAudit,
        reviewGateSummary: input.reviewGateSummary ?? null,
        agentInstruction: reasons.length > 0
            ? 'A human explicitly accepted these signal gaps during approval. Autonomous agents must not set this consent marker.'
            : 'No signal-gap consent was required for this approval.',
    };
}
