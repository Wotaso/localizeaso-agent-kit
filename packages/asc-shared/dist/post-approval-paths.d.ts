import type { LocalizeAsoAgentPassPackagingDecision } from './monetization-boundary.js';
export type LocalizeAsoPostApprovalCredentialMode = 'not_required' | 'local_human' | 'external_human_upload' | 'localizeaso_connected';
export type LocalizeAsoPostApprovalMonetizationBoundary = {
    requiresLocalizeAsoPass: true;
    requiredLocalizeAsoCapabilities: ReadonlyArray<'byoAgent' | 'reviewHistory' | 'figmaPlugin' | 'pricingReview' | 'appStoreSubmit'>;
    requiresHostedAi: false;
    requiresHostedSubmitPass: boolean;
    appStoreConnectCredentialMode: LocalizeAsoPostApprovalCredentialMode;
    revenueBoundary: 'paid_review_handoff' | 'paid_figma_apply_handoff' | 'hosted_submit_convenience';
    packageLabel?: string;
    packageGuidance?: string;
    packagingDecision?: LocalizeAsoAgentPassPackagingDecision;
    notes: string[];
};
export type LocalizeAsoApplyPlanFingerprintRequirement = {
    required: true;
    source: 'apply_plan_export' | 'approval_receipt';
    sourceCommand: string;
    flag: '--expected-apply-plan-fingerprint';
    protectedCommandsPreferred: true;
    includedInCommands: boolean;
    applyPlanFingerprint?: string;
    note: string;
};
export declare const LOCALIZEASO_APPROVAL_PROTECTED_ACTION_BOUNDARY = "Approval only locks this reviewed proposal. Figma apply, metadata/keyword apply, pricing export or scheduling, App Store upload/submit, and applied/submitted status changes still require a separate explicit human post-approval action. Review rejection is a separate human-only review action with explicit rejection consent.";
export declare const LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY = "Approval only locks this reviewed proposal. Figma apply, metadata/keyword apply, pricing export or scheduling, App Store upload/submit, and applied/submitted status changes require a separate explicit human post-approval action. Review rejection uses explicit human rejection consent instead.";
export declare const LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY = "Review rejection is a separate human-only review action. It requires explicit human rejection consent after reviewing the proposal context and does not approve, apply, export, schedule, submit, or mark approved changes.";
export declare const LOCALIZEASO_DIRECT_ASC_MUTATION_PROTECTED_ACTION_BOUNDARY = "Direct App Store Connect mutations outside a fingerprinted LocalizeASO review handoff require explicit human direct-mutation consent after reviewing the final payload. Review rejection is a separate human-only review action with explicit rejection consent.";
export declare function postApprovalPathModeGuidance(mode?: string | null): "Use when App Store Connect credentials should stay local; inspect the approved export or CSV, verify the approved apply-plan fingerprint, and run asc from the human workstation after explicit human post-approval consent." | "Use to update LocalizeASO draft state or review history after approval; require explicit human post-approval consent plus the approved apply-plan fingerprint, and use another path for hosted App Store submit." | "Use only when the pass includes hosted submit and App Store Connect is connected; LocalizeASO performs the submit step only after human approval, explicit post-approval consent, and the approved apply-plan fingerprint." | "Use to update the LocalizeASO keyword inventory after approval with explicit human post-approval consent and the approved apply-plan fingerprint; keyword-store reviews do not submit anything to App Store Connect." | "Use inside the Figma plugin only after explicit human post-approval consent and after the approved apply preview matches the app, file, proposal version, apply-plan fingerprint, layer count, and skipped targets." | "Use after approved screenshots were uploaded by a human-run workflow. The status command only records that the external upload finished; hosted LocalizeASO upload or reorder requires the concrete applied/submitted screenshot review job ID, approved proposal ID/version, and the approved apply-plan fingerprint, while local asc, Transporter, or web UI uploads can keep App Store Connect credentials local." | "Use only to record the result of an external human-run post-approval step.";
//# sourceMappingURL=post-approval-paths.d.ts.map