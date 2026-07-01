export type ReviewerFeedbackRequest = {
    index: number;
    instructions: string;
    proposalId?: string | null;
    scope: string[];
    contextSnapshot?: string | null;
    raw: string;
};
export declare const REVIEWER_FEEDBACK_CONTEXT_SNAPSHOT_MAX_LENGTH = 12000;
export declare function normalizeReviewerFeedbackInstructions(value: string): string;
export declare function normalizeReviewerFeedbackContextSnapshot(value?: string | null): string;
export declare function formatReviewerFeedbackContextSnapshotLine(value?: string | null): string | null;
export declare function reviewerFeedbackScopeDisplay(scope: string[] | undefined | null): {
    summary: string | null;
    details: string[];
};
export declare function parseReviewerFeedbackRequests(value?: string | null): ReviewerFeedbackRequest[];
export declare function latestReviewerFeedbackRequest(value?: string | null): ReviewerFeedbackRequest | null;
//# sourceMappingURL=reviewer-feedback.d.ts.map