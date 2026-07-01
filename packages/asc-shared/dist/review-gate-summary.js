function normalizedReviewSignalGapCount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
export function formatReviewSignalGapSummaryLine(input, options = {}) {
    const missingKeywordMappingCount = normalizedReviewSignalGapCount(input.missingKeywordMappingCount);
    const missingRationaleCount = normalizedReviewSignalGapCount(input.missingRationaleCount);
    const noWarningsReportedCount = normalizedReviewSignalGapCount(input.noWarningsReportedCount);
    const screenshotEvidenceGapCount = normalizedReviewSignalGapCount(input.screenshotEvidenceGapCount);
    const keywordMappingNotApplicable = options.keywordMappingNotApplicable ||
        normalizedReviewSignalGapCount(input.keywordMappingNotApplicableCount) > 0;
    const gapParts = [
        missingKeywordMappingCount
            ? `${missingKeywordMappingCount} missing keyword mapping${missingKeywordMappingCount === 1 ? '' : 's'}`
            : null,
        missingRationaleCount
            ? `${missingRationaleCount} missing rationale${missingRationaleCount === 1 ? '' : 's'}`
            : null,
        noWarningsReportedCount
            ? `${noWarningsReportedCount} target${noWarningsReportedCount === 1 ? '' : 's'} with no warnings reported`
            : null,
        screenshotEvidenceGapCount
            ? `${screenshotEvidenceGapCount} screenshot evidence gap${screenshotEvidenceGapCount === 1 ? '' : 's'}`
            : null,
    ].filter((part) => Boolean(part));
    if (!gapParts.length) {
        if (keywordMappingNotApplicable)
            return 'Signal gaps: none reported; keyword mapping n/a.';
        return options.includeNoGaps === false ? '' : 'Signal gaps: none reported.';
    }
    if (keywordMappingNotApplicable && !missingKeywordMappingCount) {
        return `Signal gaps: ${gapParts.join(', ')}; keyword mapping n/a.`;
    }
    return `Signal gaps: ${gapParts.join(', ')}.`;
}
export function normalizeReviewSignalList(values) {
    if (!values?.length)
        return [];
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
        const item = typeof value === 'string' ? value.trim() : '';
        if (!item)
            continue;
        const key = item.toLocaleLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        normalized.push(item);
    }
    return normalized;
}
export function reviewSignalCount(values) {
    return normalizeReviewSignalList(values).length;
}
export function uniqueReviewSignalCount(values) {
    return normalizeReviewSignalList(values.flatMap((items) => items ?? [])).length;
}
export function hasReviewSignals(values) {
    return reviewSignalCount(values) > 0;
}
export function reviewSignalAudit(input) {
    const hasAssignedKeywords = hasReviewSignals(input.assignedKeywords);
    const hasUnassignedKeywords = hasReviewSignals(input.unassignedKeywords);
    const hasWarnings = hasReviewSignals(input.warnings);
    const hasRationale = Boolean(input.rationale?.trim());
    const keywordMappingNotApplicable = input.keywordMappingNotApplicable === true;
    const hasKeywordMapping = keywordMappingNotApplicable || hasAssignedKeywords || hasUnassignedKeywords;
    const missingReviewSignals = [
        !hasKeywordMapping ? 'keyword mapping' : null,
        !hasRationale ? 'rationale' : null,
    ].filter((value) => Boolean(value));
    return {
        hasAssignedKeywords,
        hasUnassignedKeywords,
        keywordMappingNotApplicable,
        hasKeywordMapping,
        hasWarnings,
        hasRationale,
        missingReviewSignals,
        noWarningsReported: !hasWarnings,
        needsReviewerAttention: missingReviewSignals.length > 0 || !hasWarnings,
    };
}
export function reviewSignalAuditSummary(inputs) {
    let keywordMappingNotApplicableCount = 0;
    let missingKeywordMappingCount = 0;
    let missingRationaleCount = 0;
    let noWarningsReportedCount = 0;
    let targetsNeedingAttentionCount = 0;
    for (const input of inputs) {
        const audit = reviewSignalAudit(input);
        if (audit.keywordMappingNotApplicable)
            keywordMappingNotApplicableCount += 1;
        if (!audit.hasKeywordMapping)
            missingKeywordMappingCount += 1;
        if (!audit.hasRationale)
            missingRationaleCount += 1;
        if (audit.noWarningsReported)
            noWarningsReportedCount += 1;
        if (audit.needsReviewerAttention)
            targetsNeedingAttentionCount += 1;
    }
    return {
        totalTargets: inputs.length,
        keywordMappingNotApplicableCount,
        missingKeywordMappingCount,
        missingRationaleCount,
        noWarningsReportedCount,
        targetsNeedingAttentionCount,
        allTargetsHaveReviewSignals: targetsNeedingAttentionCount === 0,
    };
}
export function screenshotReviewSignalAuditInputs(payload) {
    return payload.locales.flatMap((localeProposal) => localeProposal.frames.flatMap((frame) => frame.layers.map((layer) => ({
        assignedKeywords: [
            ...(localeProposal.assignedKeywords ?? []),
            ...(frame.assignedKeywords ?? []),
            ...(layer.assignedKeywords ?? []),
        ],
        unassignedKeywords: [
            ...(localeProposal.unassignedKeywords ?? []),
            ...(frame.unassignedKeywords ?? []),
            ...(layer.unassignedKeywords ?? []),
        ],
        warnings: [
            ...(localeProposal.warnings ?? []),
            ...(frame.warnings ?? []),
            ...(layer.warnings ?? []),
        ],
        rationale: [localeProposal.rationale, frame.rationale, layer.rationale]
            .filter(Boolean)
            .join(' '),
    }))));
}
export function screenshotReviewSignalAuditSummary(payload) {
    return reviewSignalAuditSummary(screenshotReviewSignalAuditInputs(payload));
}
export function fieldReviewSignalAuditInputs(proposal) {
    return proposal.changes.map((change) => ({
        assignedKeywords: change.assignedKeywords,
        unassignedKeywords: change.unassignedKeywords,
        warnings: change.warnings,
        rationale: change.rationale,
        keywordMappingNotApplicable: change.target.surface === 'pricing',
    }));
}
export function fieldReviewSignalAuditSummary(proposal) {
    return reviewSignalAuditSummary(fieldReviewSignalAuditInputs(proposal));
}
export function buildReviewGateSummary(params) {
    const audit = params.signalAudit ?? undefined;
    const screenshotEvidence = params.screenshotEvidence ?? undefined;
    const warnings = [];
    const screenshotMissingTargetCount = Math.max(0, Number(screenshotEvidence?.missingTargetCount ?? 0));
    const screenshotFallbackOnlyTargetCount = Math.max(0, Number(screenshotEvidence?.fallbackOnlyTargetCount ?? 0));
    const screenshotContextOnlyTargetCount = Math.max(0, Number(screenshotEvidence?.contextOnlyTargetCount ?? 0));
    const screenshotStrongEvidenceTargetCount = Math.max(0, Number(screenshotEvidence?.strongEvidenceTargetCount ?? 0));
    const screenshotWeakEvidenceTargetCount = Math.max(0, Number(screenshotEvidence?.weakEvidenceTargetCount ?? 0));
    const screenshotEvidenceGapCount = screenshotMissingTargetCount +
        screenshotFallbackOnlyTargetCount +
        screenshotContextOnlyTargetCount +
        screenshotWeakEvidenceTargetCount;
    const targetsNeedingAttentionCount = audit?.targetsNeedingAttentionCount ?? 0;
    const signalGate = screenshotEvidenceGapCount > 0 || targetsNeedingAttentionCount > 0
        ? 'attention_required'
        : audit?.allTargetsHaveReviewSignals === true
            ? 'complete'
            : 'unknown';
    if (params.pendingTargetCount > 0) {
        warnings.push(`${params.pendingTargetCount} target${params.pendingTargetCount === 1 ? '' : 's'} still ${params.pendingTargetCount === 1 ? 'needs' : 'need'} human decisions.`);
    }
    if ((audit?.missingKeywordMappingCount ?? 0) > 0) {
        const count = audit?.missingKeywordMappingCount ?? 0;
        warnings.push(`${count} target${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} no keyword mapping.`);
    }
    if ((audit?.missingRationaleCount ?? 0) > 0) {
        const count = audit?.missingRationaleCount ?? 0;
        warnings.push(`${count} target${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} no rationale.`);
    }
    if ((audit?.noWarningsReportedCount ?? 0) > 0) {
        const count = audit?.noWarningsReportedCount ?? 0;
        warnings.push(`${count} target${count === 1 ? '' : 's'} ${count === 1 ? 'has' : 'have'} no warnings reported.`);
    }
    if (screenshotEvidenceGapCount > 0) {
        warnings.push(`${screenshotEvidenceGapCount} field target${screenshotEvidenceGapCount === 1 ? '' : 's'} ${screenshotEvidenceGapCount === 1 ? 'has' : 'have'} missing, fallback-only, context-only, or weak screenshot evidence.`);
    }
    return {
        kind: 'localizeaso_review_readiness_gate',
        reviewKind: params.reviewKind,
        ready: params.ready,
        humanDecisionGate: params.pendingTargetCount === 0 ? 'complete' : 'pending',
        signalGate,
        pendingTargetCount: params.pendingTargetCount,
        targetsNeedingAttentionCount,
        keywordMappingNotApplicableCount: audit?.keywordMappingNotApplicableCount ?? 0,
        missingKeywordMappingCount: audit?.missingKeywordMappingCount ?? 0,
        missingRationaleCount: audit?.missingRationaleCount ?? 0,
        noWarningsReportedCount: audit?.noWarningsReportedCount ?? 0,
        ...(screenshotEvidence
            ? {
                screenshotEvidenceGapCount,
                screenshotMissingTargetCount,
                screenshotFallbackOnlyTargetCount,
                screenshotContextOnlyTargetCount,
                screenshotStrongEvidenceTargetCount,
                screenshotWeakEvidenceTargetCount,
            }
            : {}),
        warnings,
        agentInstruction: 'Readiness only reports review quality and human-decision coverage. It does not approve, apply, mark status, schedule/publish pricing, or publish/submit to App Store Connect.',
    };
}
function readinessProtectedActions(reviewKind) {
    if (reviewKind === 'screenshots') {
        return [
            'human_approval',
            'review_rejection',
            'figma_apply',
            'screenshot_upload',
            'app_store_submit',
            'status_update',
        ];
    }
    return [
        'human_approval',
        'review_rejection',
        'metadata_apply',
        'keyword_apply',
        'pricing_export',
        'pricing_schedule',
        'app_store_submit',
        'status_update',
    ];
}
export function buildReviewReadinessBoundary(params) {
    return {
        kind: 'localizeaso_readiness_boundary',
        reviewKind: params.reviewKind,
        readOnly: true,
        mutatesReviewData: false,
        mutatesAppStoreConnect: false,
        approvalGranted: false,
        postApprovalActionAllowed: false,
        requiresHumanApprovalConsent: true,
        requiresHumanPostApprovalConsentForApplySubmit: true,
        protectedActions: readinessProtectedActions(params.reviewKind),
        nextHumanAction: params.ready
            ? 'Open the human review screen and approve only from the explicit consent workflow.'
            : 'Resolve pending decisions, signal gaps, or final-value blockers before approval.',
        agentInstruction: 'Readiness only reports whether the proposal is approvable. It does not approve, reject, apply, export, schedule, upload, submit, publish, or mark status.',
    };
}
function cleanSummaryString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
export function summarizeFieldReviewFinalValueBlockingIssue(issue, index = 0) {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue))
        return `Blocking issue ${index + 1}.`;
    const record = issue;
    const code = cleanSummaryString(record.code) || 'FIELD_REVIEW_FINAL_VALUE_BLOCKED';
    const message = cleanSummaryString(record.message);
    const target = record.target && typeof record.target === 'object' && !Array.isArray(record.target)
        ? Object.entries(record.target)
            .map(([key, value]) => {
            const text = cleanSummaryString(value);
            return text ? `${key}=${text}` : null;
        })
            .filter(Boolean)
            .join(', ')
        : '';
    return [code, target ? `target ${target}` : '', message].filter(Boolean).join(': ');
}
export function buildFieldReviewFinalValueGate(blockingIssues) {
    return {
        kind: 'localizeaso_field_final_value_gate',
        ready: blockingIssues.length === 0,
        status: blockingIssues.length > 0 ? 'blocked' : 'clear',
        blockingIssueCount: blockingIssues.length,
        warnings: blockingIssues.map((issue, index) => summarizeFieldReviewFinalValueBlockingIssue(issue, index)),
        agentInstruction: blockingIssues.length > 0
            ? 'This field review is not approvable until the human edits the saved decisions or requests a revised proposal that clears every final-value blocker.'
            : 'No field final-value blockers were reported. Readiness still does not approve, apply, schedule/publish pricing, or upload/publish/submit to App Store Connect.',
    };
}
export function buildReadinessReviewGate(params) {
    const reviewReady = params.reviewGateSummary?.ready === true || params.ready === true;
    const finalValueBlocked = params.finalValueGate?.status === 'blocked' ||
        (typeof params.finalValueGate?.blockingIssueCount === 'number' && params.finalValueGate.blockingIssueCount > 0);
    const warnings = [
        ...(params.reviewGateSummary?.warnings ?? []),
        ...(params.finalValueGate?.warnings ?? []),
    ].map(cleanSummaryString).filter(Boolean);
    const pendingTargetCount = typeof params.reviewGateSummary?.pendingTargetCount === 'number'
        ? params.reviewGateSummary.pendingTargetCount
        : typeof params.pendingTargetCount === 'number'
            ? params.pendingTargetCount
            : undefined;
    const agentInstruction = cleanSummaryString(params.finalValueGate?.agentInstruction) ||
        cleanSummaryString(params.readinessBoundary?.agentInstruction) ||
        cleanSummaryString(params.reviewGateSummary?.agentInstruction) ||
        'Readiness is inspection only. It does not approve, apply, export, schedule, submit, or mark status.';
    const screenshotEvidenceGapCount = typeof params.reviewGateSummary?.screenshotEvidenceGapCount === 'number'
        ? params.reviewGateSummary.screenshotEvidenceGapCount
        : undefined;
    const signalGate = screenshotEvidenceGapCount &&
        screenshotEvidenceGapCount > 0 &&
        params.reviewGateSummary?.signalGate !== 'attention_required'
        ? 'attention_required'
        : params.reviewGateSummary?.signalGate;
    return {
        kind: 'localizeaso_readiness_review_gate',
        phase: 'readiness_inspection',
        reviewKind: params.reviewKind,
        ready: reviewReady && !finalValueBlocked,
        humanReviewRequired: true,
        readOnly: true,
        approvalGranted: false,
        postApprovalActionAllowed: false,
        ...(typeof pendingTargetCount === 'number' ? { pendingTargetCount } : {}),
        ...(params.reviewGateSummary?.humanDecisionGate ? { humanDecisionGate: params.reviewGateSummary.humanDecisionGate } : {}),
        ...(signalGate ? { signalGate } : {}),
        ...(typeof params.reviewGateSummary?.keywordMappingNotApplicableCount === 'number'
            ? { keywordMappingNotApplicableCount: params.reviewGateSummary.keywordMappingNotApplicableCount }
            : {}),
        ...(typeof screenshotEvidenceGapCount === 'number' ? { screenshotEvidenceGapCount } : {}),
        ...(typeof params.reviewGateSummary?.screenshotMissingTargetCount === 'number'
            ? { screenshotMissingTargetCount: params.reviewGateSummary.screenshotMissingTargetCount }
            : {}),
        ...(typeof params.reviewGateSummary?.screenshotFallbackOnlyTargetCount === 'number'
            ? { screenshotFallbackOnlyTargetCount: params.reviewGateSummary.screenshotFallbackOnlyTargetCount }
            : {}),
        ...(typeof params.reviewGateSummary?.screenshotContextOnlyTargetCount === 'number'
            ? { screenshotContextOnlyTargetCount: params.reviewGateSummary.screenshotContextOnlyTargetCount }
            : {}),
        ...(typeof params.reviewGateSummary?.screenshotStrongEvidenceTargetCount === 'number'
            ? { screenshotStrongEvidenceTargetCount: params.reviewGateSummary.screenshotStrongEvidenceTargetCount }
            : {}),
        ...(typeof params.reviewGateSummary?.screenshotWeakEvidenceTargetCount === 'number'
            ? { screenshotWeakEvidenceTargetCount: params.reviewGateSummary.screenshotWeakEvidenceTargetCount }
            : {}),
        ...(params.reviewKind === 'field' && params.finalValueGate
            ? {
                finalValueGateStatus: params.finalValueGate.status,
                finalValueBlockingIssueCount: params.finalValueGate.blockingIssueCount,
            }
            : {}),
        warnings,
        nextHumanAction: cleanSummaryString(params.readinessBoundary?.nextHumanAction) ||
            (finalValueBlocked
                ? 'Resolve final-value blockers in the human review UI before approval.'
                : 'Resolve readiness gaps in the human review UI before approval.'),
        agentInstruction,
    };
}
