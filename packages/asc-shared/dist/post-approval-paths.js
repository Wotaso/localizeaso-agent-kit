export const LOCALIZEASO_APPROVAL_PROTECTED_ACTION_BOUNDARY = 'Approval only locks this reviewed proposal. Figma apply, metadata/keyword apply, pricing export or scheduling, App Store upload/submit, and applied/submitted status changes still require a separate explicit human post-approval action. Review rejection is a separate human-only review action with explicit rejection consent.';
export const LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY = 'Approval only locks this reviewed proposal. Figma apply, metadata/keyword apply, pricing export or scheduling, App Store upload/submit, and applied/submitted status changes require a separate explicit human post-approval action. Review rejection uses explicit human rejection consent instead.';
export const LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY = 'Review rejection is a separate human-only review action. It requires explicit human rejection consent after reviewing the proposal context and does not approve, apply, export, schedule, submit, or mark approved changes.';
export const LOCALIZEASO_DIRECT_ASC_MUTATION_PROTECTED_ACTION_BOUNDARY = 'Direct App Store Connect mutations outside a fingerprinted LocalizeASO review handoff require explicit human direct-mutation consent after reviewing the final payload. Review rejection is a separate human-only review action with explicit rejection consent.';
export function postApprovalPathModeGuidance(mode) {
    if (mode === 'local_asc' || mode === 'local_asc_export') {
        return 'Use when App Store Connect credentials should stay local; inspect the approved export or CSV, verify the approved apply-plan fingerprint, and run asc from the human workstation after explicit human post-approval consent.';
    }
    if (mode === 'localizeaso_draft') {
        return 'Use to update LocalizeASO draft state or review history after approval; require explicit human post-approval consent plus the approved apply-plan fingerprint, and use another path for hosted App Store submit.';
    }
    if (mode === 'hosted_submit') {
        return 'Use only when the pass includes hosted submit and App Store Connect is connected; LocalizeASO performs the submit step only after human approval, explicit post-approval consent, and the approved apply-plan fingerprint.';
    }
    if (mode === 'keyword_store') {
        return 'Use to update the LocalizeASO keyword inventory after approval with explicit human post-approval consent and the approved apply-plan fingerprint; keyword-store reviews do not submit anything to App Store Connect.';
    }
    if (mode === 'figma_apply') {
        return 'Use inside the Figma plugin only after explicit human post-approval consent and after the approved apply preview matches the app, file, proposal version, apply-plan fingerprint, layer count, and skipped targets.';
    }
    if (mode === 'app_store_upload') {
        return 'Use after approved screenshots were uploaded by a human-run workflow. The status command only records that the external upload finished; hosted LocalizeASO upload or reorder requires the concrete applied/submitted screenshot review job ID, approved proposal ID/version, and the approved apply-plan fingerprint, while local asc, Transporter, or web UI uploads can keep App Store Connect credentials local.';
    }
    return 'Use only to record the result of an external human-run post-approval step.';
}
