export type LocalizeAsoAgentPassPackagingDecision = {
    defaultPaidPlan: 'agent';
    defaultPaidPlanLabel: 'Agent Pass';
    freeToolRole: 'acquisition_and_trust';
    recommendedFreeTool: 'pricing_parity_cli';
    pricingParityCliRole: string;
    openSourceBoundary: string;
    primaryRevenueSurface: string;
    freeToolIncludes: ReadonlyArray<string>;
    byoPaidIncludes: ReadonlyArray<string>;
    hostedUpsellIncludes: ReadonlyArray<string>;
    defaultPricingModel: 'one_time_or_lifetime_byo_agent_pass';
    recommendedOneTimePrices: Readonly<Record<'agent' | 'submit' | 'launch' | 'global' | 'portfolio', string>>;
    avoidPositioning: ReadonlyArray<string>;
};
export type LocalizeAsoMonetizationPackage = {
    id: 'free_local_cli' | 'agent_pass' | 'submit_pass' | 'hosted_ai_pass' | 'hosted_full_pass' | 'portfolio_pass';
    label: string;
    distribution: 'free' | 'paid';
    purchaseModel: 'free_preview' | 'one_time_or_lifetime' | 'one_time_hosted_submit_credit_or_subscription' | 'one_time_hosted_ai_credit_or_subscription' | 'one_time_hosted_credit_or_subscription';
    priceAnchor?: string;
    aiCostOwner: 'none' | 'customer' | 'localizeaso';
    appStoreConnectCredentialMode: 'not_required' | 'local_human_after_approval' | 'hosted_after_approval';
    persistentReviewJobs: boolean;
    reviewHistory: boolean;
    figmaApplyPlans: boolean;
    appSlotsIncluded: boolean;
    appSlotLimit: number | null;
    hostedAi: boolean;
    hostedSubmit: boolean;
    localAscHandoffAfterApproval: boolean;
    includes: string[];
    excludes: string[];
    bestFor: string;
};
export type LocalizeAsoMonetizationValueLedger = {
    byoAgentOneTime: {
        purchaseModel: 'cheap_one_time_or_lifetime';
        aiCostOwner: 'customer';
        includes: ReadonlyArray<string>;
        excludes: ReadonlyArray<string>;
    };
    hostedConvenience: {
        purchaseModel: 'paid_hosted_credit_or_subscription';
        aiCostOwner: 'localizeaso_or_customer_for_submit_only';
        includes: ReadonlyArray<string>;
        excludes: ReadonlyArray<string>;
    };
    approvalGate: {
        appliesBefore: 'figma_apply_or_app_store_connect_submit';
        required: true;
        agentCanBypass: false;
        notes: ReadonlyArray<string>;
    };
};
export type LocalizeAsoMonetizationBoundary = {
    kind: 'localizeaso_monetization_boundary';
    reviewKind: 'screenshots' | 'field' | 'workspace';
    reviewSurface?: 'metadata' | 'keywords' | 'pricing';
    freeLocalDistribution: {
        purpose: string;
        recommendedFreeTool: LocalizeAsoAgentPassPackagingDecision['recommendedFreeTool'];
        pricingParityCliRole: string;
        openSourceBoundary: string;
        includes: string[];
        excludes: string[];
    };
    localAgentSafe: string[];
    passRequired: {
        reviewJobs: string;
        reviewHistory: string;
        figmaPlugin: string;
        pricingReview: string;
        appSlots: string;
        hostedAi: string;
        hostedSubmit: string;
    };
    agentPass: {
        purchaseModel: 'one_time_or_lifetime';
        aiCostOwner: 'customer';
        hostedAiIncluded: false;
        submitMode: 'local_asc_handoff_after_human_approval';
        bestFor: string;
    };
    hostedPass: {
        purchaseModel: 'one_time_hosted_credit_or_subscription';
        aiCostOwner: 'localizeaso';
        hostedAiIncluded: true;
        submitMode: 'hosted_submit_after_human_approval';
        bestFor: string;
    };
    hostedSubmitPass: {
        purchaseModel: 'one_time_hosted_submit_credit_or_subscription';
        aiCostOwner: 'customer';
        hostedAiIncluded: false;
        submitMode: 'hosted_submit_after_human_approval';
        bestFor: string;
    };
    hostedAiPass: {
        purchaseModel: 'one_time_hosted_ai_credit_or_subscription';
        aiCostOwner: 'localizeaso';
        hostedAiIncluded: true;
        submitMode: 'local_asc_or_hosted_submit_after_human_approval';
        bestFor: string;
    };
    revenueModel: {
        defaultMotion: string;
        freeSurface: string;
        paidSurface: string;
        primaryRevenueSurface: string;
        recommendedDefaultPlan: 'agent';
        upsellTriggers: string[];
        avoid: string[];
    };
    packageMatrix: LocalizeAsoMonetizationPackage[];
    valueLedger: LocalizeAsoMonetizationValueLedger;
    packagingDecision: LocalizeAsoAgentPassPackagingDecision;
    recommendedOneTimePrices: LocalizeAsoAgentPassPackagingDecision['recommendedOneTimePrices'];
    pricingGuidance: string;
    appStoreConnectCredentials: string;
    agentInstruction: string;
};
export declare const LOCALIZEASO_AGENT_PASS_PACKAGING_DECISION: {
    readonly defaultPaidPlan: "agent";
    readonly defaultPaidPlanLabel: "Agent Pass";
    readonly freeToolRole: "acquisition_and_trust";
    readonly recommendedFreeTool: "pricing_parity_cli";
    readonly pricingParityCliRole: "Use pricing parity, Astro CSV import, keyword-context conversion, proposal templates, and one-app BYO agent onboarding as the useful free/OSS CLI wedge; charge when the user creates a persistent LocalizeASO review job with consent UI, history, Figma/apply handoffs, more app slots, or hosted submit.";
    readonly openSourceBoundary: "Open-source local setup, keyword conversion, pricing-parity manifests, prompt/template generation, one-app BYO agent onboarding, and already-approved local asc handoff helpers. Keep backend persistence, review history, consent screens, Figma apply plans, hosted AI, additional app slots, and hosted submit in paid LocalizeASO passes.";
    readonly primaryRevenueSurface: "Human review/consent screens with current/proposed/final diffs, keyword evidence, warnings, approval receipts, review history, Figma apply plans, app slots, local asc handoffs after approval, and optional hosted AI or hosted submit convenience.";
    readonly freeToolIncludes: readonly ["local setup", "Astro/CSV keyword conversion", "prompt/template generation", "one-app BYO agent onboarding", "pricing parity manifests"];
    readonly byoPaidIncludes: readonly ["persistent review jobs", "human review/consent screens with diffs and signal evidence", "review history", "approval receipts", "reviewer feedback", "Figma apply plans", "app slots", "local asc handoffs after human approval"];
    readonly hostedUpsellIncludes: readonly ["hosted submit-only pass for BYO/Codex proposals after human approval", "LocalizeASO-hosted AI proposal generation", "hosted App Store Connect upload/submit convenience after human approval", "larger app or team coverage"];
    readonly defaultPricingModel: "one_time_or_lifetime_byo_agent_pass";
    readonly recommendedOneTimePrices: {
        readonly agent: "$49";
        readonly submit: "$49";
        readonly launch: "$99";
        readonly global: "$249";
        readonly portfolio: "$499";
    };
    readonly avoidPositioning: readonly ["usage-based LocalizeASO AI pricing for BYO Codex/AI runs", "promising hosted submit inside Agent Pass", "requiring App Store Connect credentials for proposal review"];
};
export declare function localizeAsoAgentPassPackagingDecision(): LocalizeAsoAgentPassPackagingDecision;
export declare function buildLocalizeAsoMonetizationBoundary(reviewKind: 'screenshots' | 'field' | 'workspace', options?: {
    reviewSurface?: 'metadata' | 'keywords' | 'pricing';
}): LocalizeAsoMonetizationBoundary;
//# sourceMappingURL=monetization-boundary.d.ts.map