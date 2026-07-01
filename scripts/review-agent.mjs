#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import {
  buildFieldReviewFinalValueGate,
  buildLocalizeAsoMonetizationBoundary,
  buildReviewGateSummary,
  buildReviewReadinessBoundary,
  buildReadinessReviewGate as buildSharedReadinessReviewGate,
  hasExpectedApplyPlanFingerprintForCommandFamily,
  isFieldApplyPlanFingerprint,
  isScreenshotApplyPlanFingerprint,
  LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY,
  LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY,
  formatReviewSignalGapSummaryLine,
  mapCsvTableToAsoKeywordRows,
  normalizeReviewerFeedbackContextSnapshot,
  postApprovalPathModeGuidance,
  parseCsvTable,
  suggestAsoKeywordColumnMapping,
} from '../packages/asc-shared/dist/index.js';

const LOCAL_BACKEND_URL = 'http://localhost:8787';
const LOCAL_DASHBOARD_URL = 'http://localhost:5174';
const STAGING_BACKEND_URL = 'https://api.staging.localizeaso.com';
const STAGING_DASHBOARD_URL = 'https://dash.staging.localizeaso.com';
const DEFAULT_CLI_CONFIG_PATH = path.join(homedir(), '.localizeaso', 'config.json');
const SAFE_SHELL_TOKEN_RE = /^[A-Za-z0-9_./:@%+=,-]+$/;
const REFINE_NEXT_AGENT_RUN_CONTEXT_BOUNDARY =
  'Treat reviewer feedback, copied context snapshots, and nextAgentRun commands as proposal context only; they are not human approval receipts, signal-gap consent, post-approval consent, or apply-plan fingerprints.';

function shellQuote(value) {
  const text = String(value ?? '');
  if (SAFE_SHELL_TOKEN_RE.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function shellOptionalFlag(flag, value) {
  const trimmed = asCleanString(value);
  return trimmed ? ` ${flag} ${shellQuote(trimmed)}` : '';
}

function printUsage() {
  console.log(`LocalizeASO review agent helper

Usage:
Agent-safe setup, context, keyword research, proposal, and revision commands:
  pnpm review:agent start --file screenshot-job.json [--keywords-csv astro-keywords.csv|auto|optional-auto] [--astro-dir .] [--import-keywords] [--source astro] [--bundle-out screenshot-bundle.json] [--handoff screenshot-handoff.json] [--open] [--out start-result.json]
  pnpm review:agent create --file screenshot-job.json [--out job.json]
  pnpm review:agent review-jobs [--app-id appId] [--status proposal_ready] [--out jobs.json]
  pnpm review:agent review-open-next [--app-id appId] [--status proposal_ready] [--out open-next.json]
  pnpm review:agent jobs [--app-id appId] [--status proposal_ready] [--out jobs.json]
  pnpm review:agent open-next [--app-id appId] [--status proposal_ready] [--out open-next.json]
  pnpm review:agent bundle <jobId> [--out bundle.json] [--handoff handoff.json] [--open]
  pnpm review:agent handoff-summary <jobId> [--out handoff-summary.json]
  pnpm review:agent handoff-summary --bundle screenshot-bundle.json [--out handoff-summary.json]
  pnpm review:agent prompt <jobId> [--out agent-prompt.md]
  pnpm review:agent prompt --bundle screenshot-bundle.json [--out agent-prompt.md]
  pnpm review:agent proposal-template <jobId> [--out screenshot-proposal.json]
  pnpm review:agent proposal-template --bundle screenshot-bundle.json [--out screenshot-proposal.json]
  pnpm review:agent open <jobId>
  pnpm review:agent keyword-brief <jobId> [--out keyword-brief.json]
  pnpm review:agent keyword-brief --bundle screenshot-bundle.json [--out keyword-brief.json]
  pnpm review:agent keyword-automation <jobId> [--out keyword-automation.json]
  pnpm review:agent keyword-automation --bundle screenshot-bundle.json [--out keyword-automation.json]
  pnpm review:agent keyword-prompt <jobId> [--out keyword-agent-prompt.md]
  pnpm review:agent keyword-prompt --bundle screenshot-bundle.json [--out keyword-agent-prompt.md]
  pnpm review:agent keyword-prompt --brief keyword-brief.json [--out keyword-agent-prompt.md]
  pnpm review:agent submit-proposal <jobId> --file proposal.json [--open]
  pnpm review:agent keyword-context <jobId> --file keyword-context.json
  pnpm review:agent keyword-context-from-csv --file astro-keywords.csv|auto|optional-auto [--astro-dir .] [--source astro] [--out keyword-context.json]
  pnpm review:agent keyword-context-from-csv <jobId> --file astro-keywords.csv|auto|optional-auto [--astro-dir .] [--source astro] [--out response.json]
  pnpm review:agent import-aso-keywords-from-csv <appId> --file astro-keywords.csv|auto|optional-auto [--astro-dir .] [--out import-result.json]
    Imports CSV rows into LocalizeASO ASO keyword inventory without hosted AI translation or App Store Connect credentials.
  pnpm review:agent readiness <jobId> --proposal-id <proposalId>
  pnpm review:agent refine-request <jobId> --instructions "reviewer feedback" [--target-locales de-DE,en-US] [--targets '[{"kind":"frame","locale":"de-DE","frameId":"frame-1"}]'] [--context-snapshot-file review-context.md]
  pnpm review:agent field-start --file field-job.json [--sync-keywords] [--keywords-csv astro-keywords.csv|auto|optional-auto] [--astro-dir .] [--import-keywords] [--source astro] [--bundle-out field-bundle.json] [--handoff handoff.json] [--open] [--out start-result.json]
  pnpm review:agent field-create --file field-job.json [--out job.json]
  pnpm review:agent field-jobs [--app-id appId] [--surface metadata|keywords|pricing] [--status proposal_ready] [--out jobs.json]
  pnpm review:agent field-open-next [--app-id appId] [--surface metadata|keywords|pricing] [--status proposal_ready] [--out open-next.json]
  pnpm review:agent field-bundle <jobId> [--out bundle.json] [--handoff handoff.json] [--open]
  pnpm review:agent field-handoff-summary <jobId> [--out handoff-summary.json]
  pnpm review:agent field-handoff-summary --bundle field-bundle.json [--out handoff-summary.json]
  pnpm review:agent field-prompt <jobId> [--out agent-prompt.md]
  pnpm review:agent field-prompt --bundle field-bundle.json [--out agent-prompt.md]
  pnpm review:agent field-proposal-template <jobId> [--out field-proposal.json]
  pnpm review:agent field-proposal-template --bundle field-bundle.json [--out field-proposal.json]
  pnpm review:agent field-open <jobId>
  pnpm review:agent field-keyword-brief <jobId> [--out keyword-brief.json]
  pnpm review:agent field-keyword-brief --bundle field-bundle.json [--out keyword-brief.json]
  pnpm review:agent field-aso-keyword-map <jobId> [--out aso-keyword-map.json]
  pnpm review:agent field-keyword-automation <jobId> [--out keyword-automation.json]
  pnpm review:agent field-keyword-automation --bundle field-bundle.json [--out keyword-automation.json]
  pnpm review:agent field-keyword-prompt <jobId> [--out keyword-agent-prompt.md]
  pnpm review:agent field-keyword-prompt --bundle field-bundle.json [--out keyword-agent-prompt.md]
  pnpm review:agent field-keyword-prompt --brief keyword-brief.json [--out keyword-agent-prompt.md]
  pnpm review:agent field-pricing-brief <jobId> [--out pricing-brief.json]
  pnpm review:agent field-pricing-brief --bundle field-bundle.json [--out pricing-brief.json]
  pnpm review:agent pricing-parity-manifest --app-id appId --file pricing-parity.json [--product-kind subscription|iap] [--product-id productId] [--out pricing-field-job.json]
    Converts a local PPP/pricing-parity plan into a pricing field-review manifest. It does not create jobs, approve reviews, schedule prices, or submit anything.
  pnpm review:agent pricing-parity --app-id appId --file pricing-parity.json [--product-kind subscription|iap] [--product-id productId] [--manifest-out pricing-field-job.json] [--bundle-out field-bundle.json] [--handoff handoff.json] [--open] [--out start-result.json]
    Friendly CLI entry point for pricing parity. Creates the pricing field-review job and returns the human review handoff. Add --open to open the consent screen. It does not approve, schedule prices, or submit anything.
  pnpm review:agent pricing-parity-start --app-id appId --file pricing-parity.json [--product-kind subscription|iap] [--product-id productId] [--manifest-out pricing-field-job.json] [--bundle-out field-bundle.json] [--handoff handoff.json] [--open] [--out start-result.json]
    Converts a local PPP/pricing-parity plan, creates the pricing field-review job, and opens/exports the human review handoff. It does not approve, schedule prices, or submit anything.
  pnpm review:agent field-keyword-context <jobId> --file keyword-context.json
  pnpm review:agent field-keyword-context-from-csv <jobId> --file astro-keywords.csv|auto|optional-auto [--astro-dir .] [--source astro] [--out response.json]
  pnpm review:agent field-sync-keywords <jobId> [--out keyword-context.json]
    Field keyword sync/context commands are metadata/keyword-only; pricing jobs reject keyword inputs and use field-pricing-brief instead.
  pnpm review:agent field-submit-proposal <jobId> --file proposal.json [--open]
  pnpm review:agent field-readiness <jobId> --proposal-id <proposalId>
  pnpm review:agent field-refine-request <jobId> --instructions "reviewer feedback" [--target-locales de-DE,en-US] [--targets '[{"surface":"metadata","locale":"de-DE","field":"subtitle"}]'] [--context-snapshot-file review-context.md]
  pnpm review:agent monetization-boundary [--kind screenshots|field|metadata|keywords|pricing|workspace] [--out boundary.json]
    Prints the local-vs-paid boundary for BYO Agent, hosted AI, App Store Connect credentials, and submit convenience. This is read-only and does not require a backend token.

Human review commands; run from the consent/review UI workflow, not from an autonomous agent pass:
  pnpm review:agent save-decisions <jobId> --proposal-id <proposalId> --file decisions.json --human-review-consent
  pnpm review:agent approve <jobId> --proposal-id <proposalId> --human-approval-consent [--human-signal-gap-consent] [--out approval-receipt.json]
  pnpm review:agent status <jobId> --app-id appId --file-key figmaFileKey --status rejected --human-rejection-consent
  pnpm review:agent field-save-decisions <jobId> --proposal-id <proposalId> --file decisions.json --human-review-consent
  pnpm review:agent field-approve <jobId> --proposal-id <proposalId> --human-approval-consent [--human-signal-gap-consent] [--out approval-receipt.json]
  pnpm review:agent field-status <jobId> [--app-id appId] --status rejected --human-rejection-consent

Human-only post-approval commands; run only after approval and never from MCP/proposal generation:
  pnpm review:agent apply-plan <jobId> [--app-id appId] [--file-key figmaFileKey] [--out apply-plan.json]
  pnpm review:agent status <jobId> --app-id appId --file-key figmaFileKey --status applied|submitted [--approved-screenshot-review-proposal-id id --approved-screenshot-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent
  pnpm review:agent field-apply-plan <jobId> [--app-id appId] [--out apply-plan.json]
  pnpm review:agent field-metadata-files <jobId> [--app-id appId] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent --dir ./metadata [--version 1.2.3] [--platform IOS] [--out metadata-handoff.json]
  pnpm review:agent field-apply-drafts <jobId> [--app-id appId] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent [--out apply-result.json]
  pnpm review:agent field-apply-keywords <jobId> [--app-id appId] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent [--out apply-result.json]
  pnpm review:agent field-pricing-payload <jobId> [--app-id appId] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent [--out pricing-payload.json] [--asc-csv-out pricing-payload.csv]
  pnpm review:agent field-submit-metadata <jobId> [--app-id appId] [--platform IOS] [--dry-run] [--force] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent [--out metadata-submit-result.json]
  pnpm review:agent field-submit-pricing <jobId> [--app-id appId] [--start-date YYYY-MM-DD] [--concurrency 4] [--overwrite-existing-scheduled] [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent [--out pricing-submit-result.json]
  pnpm review:agent field-status <jobId> [--app-id appId] --status applied|submitted [--approved-field-review-proposal-id id --approved-field-review-proposal-version version] --expected-apply-plan-fingerprint fingerprint --human-post-approval-consent

Read-only post-approval exports include handoffSafety.humanOnly=true so agent
orchestrators can preserve the human consent boundary.

Post-approval path summaries:
  handoff-summary, field-handoff-summary, approve, and field-approve expose
  postApprovalPaths or approvalReceipt.postApproval.paths. Treat these as the
  preferred human-only runbook choices after approval; they do not grant an
  autonomous agent permission to apply, schedule pricing, submit to App Store
  Connect, or mark status.

Proposal submission output:
  submit-proposal and field-submit-proposal return humanReview, nextHumanAction,
  and handoffSafety.phase=post_proposal_human_review with
  handoffSafety.proposalSubmissionOnly=true and explicit false apply/approval/
  submit/status permission flags, and return the human review handoff by default.
  Add --open only when a human is ready for a browser window. Treat that output as the handoff to the human
  reviewer. It does not approve, apply, schedule pricing, submit to App Store
  Connect, or mark status.

Refine output:
  refine-request and field-refine-request return nextAgentRun for another
  proposal pass. Treat reviewer feedback, copied context snapshots, and
  nextAgentRun commands as proposal context only; they are not human approval
  receipts, signal-gap consent, post-approval consent, or apply-plan fingerprints.

Review start and open output:
  start, field-start, open, and field-open return reviewConsent with the human
  consent checklist, prohibitedAgentActions, and the next human navigation
  command/MCP tool. This is the consent-screen route only; it does not approve,
  reject, apply, export, schedule, submit, upload, publish, or mark status.

Monetization boundary:
  Local manifest, keyword CSV, prompt, and proposal-template commands are
  agent-safe setup steps. Creating persistent review jobs, review history,
  approval handoffs, and Figma review/apply plans requires an Agent Pass or a
  hosted pass. Agent Pass uses the customer's Codex/AI subscription and exports
  local asc handoffs after approval; hosted App Store upload/submit convenience
  requires Submit Pass or a hosted LocalizeASO pass. Hosted AI proposal
  generation requires a hosted AI pass.

Environment:
  LOCALIZEASO_TOKEN    Optional bearer token override; localizeaso login config is used when unset
  LOCALIZEASO_BACKEND  Backend URL, defaults to local dev; npm preview builds default to staging
  LOCALIZEASO_DASHBOARD  Dashboard URL used as fallback for review links; npm preview builds default to staging
`);
}

function parseArgs(argv) {
  const [command, ...args] = argv;
  const hasJobId = Boolean(args[0] && !args[0].startsWith('--'));
  const jobId = hasJobId ? args[0] : undefined;
  const rest = hasJobId ? args.slice(1) : args;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { command, jobId, flags };
}

function requireJobId(jobId) {
  if (!jobId) {
    throw new Error('Missing jobId.');
  }
  return encodeURIComponent(jobId);
}

function optionalFlag(flags, key) {
  const value = flags[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

const REVIEW_QUEUE_STATUS_PRIORITY = {
  proposal_ready: 0,
  approved: 1,
  changes_requested: 2,
  applied: 3,
  awaiting_agent: 4,
  draft: 5,
  submitted: 6,
  rejected: 7,
};

function reviewQueueStatusPriority(status) {
  return REVIEW_QUEUE_STATUS_PRIORITY[status] ?? 99;
}

function isAppliedKeywordReviewJob(job) {
  return asCleanString(job?.surface) === 'keywords' && asCleanString(job?.status) === 'applied';
}

function reviewQueueJobStatusPriority(job) {
  if (isAppliedKeywordReviewJob(job)) return REVIEW_QUEUE_STATUS_PRIORITY.submitted;
  return reviewQueueStatusPriority(job?.status);
}

function reviewQueueJobNeedsOpenReview(job) {
  const status = asCleanString(job?.status);
  return Boolean(status && status !== 'submitted' && status !== 'rejected' && !isAppliedKeywordReviewJob(job));
}

function reviewQueueTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortReviewQueueJobs(jobs = []) {
  return [...jobs].sort((left, right) => {
    const priorityDelta = reviewQueueJobStatusPriority(left) - reviewQueueJobStatusPriority(right);
    if (priorityDelta !== 0) return priorityDelta;
    return reviewQueueTimestamp(right?.updatedAt ?? right?.createdAt) - reviewQueueTimestamp(left?.updatedAt ?? left?.createdAt);
  });
}

function reviewJobsQuery(flags, options = {}) {
  const params = new URLSearchParams();
  const appId = optionalFlag(flags, 'app-id') || optionalFlag(flags, 'appId');
  const status = optionalFlag(flags, 'status');
  const surface = optionalFlag(flags, 'surface');
  if (appId) params.set('appId', appId);
  if (status) params.set('status', status);
  if (options.includeSurface !== false && surface) params.set('surface', surface);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function reviewQueueDecisionSummary(job) {
  const summary = isRecord(job?.decisionSummary) ? job.decisionSummary : {};
  const gate = isRecord(job?.reviewGateSummary) ? job.reviewGateSummary : {};
  const proposalVersion = Number.isFinite(job?.latestProposalVersion) ? Math.trunc(job.latestProposalVersion) : 0;
  const totalTargets = Number.isFinite(summary.totalTargets) ? Math.max(0, Math.trunc(summary.totalTargets)) : 0;
  const reviewedTargets = Number.isFinite(summary.reviewedTargets) ? Math.max(0, Math.trunc(summary.reviewedTargets)) : 0;
  const pendingTargets =
    Number.isFinite(summary.pendingTargets)
      ? Math.max(0, Math.trunc(summary.pendingTargets))
      : Number.isFinite(gate.pendingTargetCount)
        ? Math.max(0, Math.trunc(gate.pendingTargetCount))
        : 0;
  const savedDecisionCount = Number.isFinite(summary.savedDecisionCount)
    ? Math.max(0, Math.trunc(summary.savedDecisionCount))
    : 0;
  const acceptedCount = Number.isFinite(summary.acceptedCount)
    ? Math.max(0, Math.trunc(summary.acceptedCount))
    : 0;
  const editedCount = Number.isFinite(summary.editedCount)
    ? Math.max(0, Math.trunc(summary.editedCount))
    : 0;
  const rejectedCount = Number.isFinite(summary.rejectedCount)
    ? Math.max(0, Math.trunc(summary.rejectedCount))
    : 0;
  if (
    !proposalVersion &&
    !totalTargets &&
    !pendingTargets &&
    !savedDecisionCount &&
    !acceptedCount &&
    !editedCount &&
    !rejectedCount
  ) return null;
  const result = {
    ...(proposalVersion ? { proposalVersion } : {}),
    ...(totalTargets ? { totalTargets, reviewedTargets } : {}),
    pendingTargets,
    savedDecisionCount,
    acceptedCount,
    editedCount,
    rejectedCount,
  };
  const parts = [];
  if (proposalVersion) parts.push(`Proposal v${proposalVersion}`);
  if (totalTargets) {
    parts.push(`${reviewedTargets}/${totalTargets} reviewed`);
    parts.push(pendingTargets ? `${pendingTargets} pending` : 'ready for approval');
  } else if (pendingTargets) {
    parts.push(`${pendingTargets} pending`);
  }
  if (savedDecisionCount) {
    parts.push(`${savedDecisionCount} saved decision${savedDecisionCount === 1 ? '' : 's'}`);
  }
  if (acceptedCount + editedCount + rejectedCount > 0) {
    parts.push(`${acceptedCount} accepted / ${editedCount} edited / ${rejectedCount} rejected`);
  }
  return parts.length ? { ...result, summaryLine: parts.join(' · ') } : result;
}

function reviewQueueArrayRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function reviewQueueStringArrayHasItems(value) {
  return Array.isArray(value) && value.some((item) => Boolean(asCleanString(item)));
}

function reviewQueueKeywordMapHasItems(value) {
  if (!isRecord(value)) return false;
  return Object.values(value).some((keywords) => reviewQueueStringArrayHasItems(keywords));
}

function reviewQueueKeywordRowsHaveItems(value) {
  return reviewQueueArrayRecords(value).some((row) => asCleanString(row.keyword) || asCleanString(row.value));
}

function reviewQueueHasProviderKeywordContext(value) {
  if (!isRecord(value)) return false;
  return reviewQueueKeywordMapHasItems(value.keywords) || reviewQueueKeywordRowsHaveItems(value.rows);
}

function reviewQueueScreenshotContextFrames(value) {
  if (!isRecord(value)) return [];
  const frames = [];
  for (const key of ['frames', 'screenshotPreviews', 'screenshots', 'previews']) {
    if (Array.isArray(value[key])) frames.push(...value[key]);
  }
  for (const key of ['screenshotContext', 'screenshotReview', 'appStoreScreenshots']) {
    if (isRecord(value[key])) frames.push(...reviewQueueScreenshotContextFrames(value[key]));
  }
  for (const key of ['jobs', 'locales']) {
    if (!Array.isArray(value[key])) continue;
    for (const item of value[key]) {
      if (isRecord(item)) frames.push(...reviewQueueScreenshotContextFrames(item));
    }
  }
  return frames;
}

function reviewQueueScreenshotFrameHasPreview(frame) {
  if (!isRecord(frame)) return false;
  return Boolean(
    asCleanString(frame.previewDataUrl) ||
    asCleanString(frame.previewUrl) ||
    asCleanString(frame.thumbnailUrl) ||
    asCleanString(frame.imageUrl),
  );
}

function reviewQueueScreenshotFrameHasText(frame) {
  if (!isRecord(frame)) return false;
  if (reviewQueueStringArrayHasItems(frame.sourceTexts) || reviewQueueStringArrayHasItems(frame.texts)) return true;
  const layers = Array.isArray(frame.textLayers)
    ? frame.textLayers
    : Array.isArray(frame.layers)
      ? frame.layers
      : [];
  return reviewQueueArrayRecords(layers).some(
    (layer) => asCleanString(layer.text) || asCleanString(layer.sourceText) || asCleanString(layer.name),
  );
}

function reviewQueuePricingRows(context) {
  return [
    ...reviewQueueArrayRecords(context.currentPricing),
    ...reviewQueueArrayRecords(context.draftPricing),
    ...reviewQueueArrayRecords(context.suggestedPricing),
    ...reviewQueueArrayRecords(context.localizedSuggestions),
    ...reviewQueueArrayRecords(context.prices),
  ];
}

function reviewQueuePricingScheduledRows(context) {
  return [
    ...reviewQueueArrayRecords(context.scheduledPricing),
    ...reviewQueueArrayRecords(context.upcomingPriceChanges),
    ...reviewQueueArrayRecords(context.scheduledPrices),
  ];
}

function reviewQueuePricingWarningCount(context) {
  const rowWarnings = [
    ...reviewQueuePricingRows(context),
    ...reviewQueuePricingScheduledRows(context),
  ].filter(
    (row) =>
      asCleanString(row.warning) ||
      asCleanString(row.warningMessage) ||
      asCleanString(row.risk) ||
      reviewQueueStringArrayHasItems(row.warnings),
  ).length;
  const contextWarnings =
    reviewQueueStringArrayHasItems(context.warnings) || reviewQueueStringArrayHasItems(context.pricingWarnings) ? 1 : 0;
  return rowWarnings + contextWarnings;
}

function reviewQueuePositiveInteger(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function reviewQueueProposalSignalHealth(job) {
  const gate = isRecord(job?.reviewGateSummary) ? job.reviewGateSummary : {};
  const audit = isRecord(job?.signalAudit) ? job.signalAudit : {};
  const screenshotEvidenceGapCount = reviewQueuePositiveInteger(gate.screenshotEvidenceGapCount);
  const rawSignalGate =
    asCleanString(gate.signalGate) || (audit.allTargetsHaveReviewSignals === true ? 'complete' : '');
  const signalGate =
    screenshotEvidenceGapCount > 0 && rawSignalGate !== 'attention_required'
      ? 'attention_required'
      : rawSignalGate;
  return {
    missingKeywordMappingCount:
      reviewQueuePositiveInteger(gate.missingKeywordMappingCount) ||
      reviewQueuePositiveInteger(audit.missingKeywordMappingCount),
    missingRationaleCount:
      reviewQueuePositiveInteger(gate.missingRationaleCount) ||
      reviewQueuePositiveInteger(audit.missingRationaleCount),
    noWarningsReportedCount:
      reviewQueuePositiveInteger(gate.noWarningsReportedCount) ||
      reviewQueuePositiveInteger(audit.noWarningsReportedCount),
    pendingTargetCount: reviewQueuePositiveInteger(gate.pendingTargetCount),
    screenshotEvidenceGapCount,
    screenshotMissingTargetCount: reviewQueuePositiveInteger(gate.screenshotMissingTargetCount),
    screenshotFallbackOnlyTargetCount: reviewQueuePositiveInteger(gate.screenshotFallbackOnlyTargetCount),
    screenshotContextOnlyTargetCount: reviewQueuePositiveInteger(gate.screenshotContextOnlyTargetCount),
    screenshotStrongEvidenceTargetCount: reviewQueuePositiveInteger(gate.screenshotStrongEvidenceTargetCount),
    screenshotWeakEvidenceTargetCount: reviewQueuePositiveInteger(gate.screenshotWeakEvidenceTargetCount),
    signalGate,
  };
}

function reviewQueueJobHealth(job, kind) {
  const surface = asCleanString(job?.surface);
  const status = asCleanString(job?.status);
  const context = isRecord(job?.context) ? job.context : {};
  const manifest = isRecord(job?.manifest) ? job.manifest : {};
  const keywordContext = job?.keywordContext ?? context.keywordContext;
  const manifestFrames = Array.isArray(manifest.frames) ? manifest.frames : [];
  const contextFrames = reviewQueueScreenshotContextFrames(context.screenshotContext);
  const screenshotFrames = manifestFrames.length ? manifestFrames : contextFrames;
  const previewCount = screenshotFrames.filter(reviewQueueScreenshotFrameHasPreview).length;
  const seedTextCount = screenshotFrames.filter(reviewQueueScreenshotFrameHasText).length;
  const proposalSignals = reviewQueueProposalSignalHealth(job);
  const badges = [];
  const missingSignals = [];

  if (status === 'proposal_ready') badges.push('human_review_required');
  if (status === 'changes_requested') badges.push('agent_revision_required');
  if (status === 'approved') badges.push('human_only_post_approval');

  const receiptSummary = queueReceiptSummary(job);
  badges.push(...receiptSummary.healthBadges);
  if (receiptSummary.postApprovalFingerprintMismatchCount > 0) {
    missingSignals.push('post-approval fingerprint mismatch');
  }
  if (receiptSummary.postApprovalFingerprintMissingExpectedCount > 0) {
    missingSignals.push('post-approval expected fingerprint');
  }
  if (receiptSummary.postApprovalFingerprintMissingRecordedCount > 0) {
    missingSignals.push('post-approval recorded fingerprint');
  }
  if (receiptSummary.activePostApprovalEvidenceMissingCount > 0) {
    missingSignals.push('post-approval human review evidence');
  }

  if (proposalSignals.pendingTargetCount > 0) {
    badges.push('pending_decisions');
    missingSignals.push('pending decisions');
  }
  if (proposalSignals.missingKeywordMappingCount > 0) {
    badges.push('proposal_keyword_mapping_missing');
    missingSignals.push('proposal keyword mapping');
  }
  if (proposalSignals.missingRationaleCount > 0) {
    badges.push('proposal_rationale_missing');
    missingSignals.push('proposal rationale');
  }
  if (proposalSignals.noWarningsReportedCount > 0) {
    badges.push('proposal_no_warnings_reported');
    missingSignals.push('proposal warnings');
  }
  if (proposalSignals.screenshotEvidenceGapCount > 0) {
    badges.push('proposal_screenshot_evidence_gap');
    missingSignals.push('proposal screenshot evidence');
  }
  if (proposalSignals.screenshotMissingTargetCount > 0) {
    badges.push('proposal_screenshot_missing');
  }
  if (proposalSignals.screenshotFallbackOnlyTargetCount > 0) {
    badges.push('proposal_screenshot_fallback_only');
  }
  if (proposalSignals.screenshotContextOnlyTargetCount > 0) {
    badges.push('proposal_screenshot_context_only');
  }
  if (proposalSignals.screenshotWeakEvidenceTargetCount > 0) {
    badges.push('proposal_screenshot_weak_evidence');
    missingSignals.push('proposal weak screenshot evidence');
  }
  if (proposalSignals.screenshotStrongEvidenceTargetCount > 0) {
    badges.push('proposal_screenshot_strong_evidence');
  }
  if (
    proposalSignals.signalGate === 'complete' &&
    proposalSignals.missingKeywordMappingCount === 0 &&
    proposalSignals.missingRationaleCount === 0 &&
    proposalSignals.noWarningsReportedCount === 0 &&
    proposalSignals.screenshotEvidenceGapCount === 0
  ) {
    badges.push('proposal_signals_complete');
  }

  if (surface === 'pricing') {
    const pricingRows = reviewQueuePricingRows(context);
    const scheduledPricingRows = reviewQueuePricingScheduledRows(context);
    const pricingWarnings = reviewQueuePricingWarningCount(context);
    if (pricingRows.length) {
      badges.push('pricing_context_attached');
    } else {
      badges.push('pricing_context_missing');
      missingSignals.push('pricing context');
    }
    if (scheduledPricingRows.length) {
      badges.push('scheduled_pricing_review');
      missingSignals.push('scheduled price review');
    }
    if (pricingWarnings) {
      badges.push('pricing_warnings');
      missingSignals.push('pricing warnings');
    }
    return {
      badges,
      missingSignals,
      pricingContextRows: pricingRows.length,
      scheduledPricingRows: scheduledPricingRows.length,
      pricingWarnings,
      proposalSignalSummary: proposalSignals,
      actionLine: missingSignals.length
        ? `Check ${missingSignals.join(' and ')} before approval or post-approval handoff.`
        : 'Pricing review context is ready for the current queue stage.',
    };
  }

  const hasKeywords =
    reviewQueueHasProviderKeywordContext(keywordContext) ||
    reviewQueueKeywordMapHasItems(manifest.keywords) ||
    reviewQueueKeywordMapHasItems(context.keywords);
  if (hasKeywords) {
    badges.push('keyword_context_attached');
  } else {
    badges.push('keyword_context_missing');
    missingSignals.push('keyword context');
  }

  const expectsScreenshotEvidence =
    kind === 'screenshots' ||
    manifestFrames.length > 0 ||
    contextFrames.length > 0 ||
    surface === 'metadata' ||
    surface === 'keywords' ||
    !surface;
  if (expectsScreenshotEvidence) {
    if (previewCount) {
      badges.push('screenshot_preview_attached');
    } else {
      badges.push('screenshot_preview_missing');
      missingSignals.push('screenshot preview');
    }
    if (seedTextCount) badges.push('screenshot_seed_text_attached');
  }

  return {
    badges,
    missingSignals,
    keywordContextAttached: hasKeywords,
    screenshotPreviewCount: previewCount,
    screenshotSeedTextCount: seedTextCount,
    proposalSignalSummary: proposalSignals,
    actionLine: missingSignals.length
      ? `Check ${missingSignals.join(' and ')} before ${
          receiptSummary.postApprovalFingerprintIssueCount > 0
            ? 'approval or post-approval handoff'
            : 'approval'
        }.`
      : 'Review context is ready for the current queue stage.',
  };
}

function queueCurrentReceiptMatchesApprovedJob(job, receipt) {
  const approvedProposalId = asCleanString(job?.approvedProposalId);
  if (!approvedProposalId || !isRecord(receipt)) return false;
  return queueReceiptMatchesApprovedJob(job, receipt);
}

function queueReceiptMatchesApprovedJob(job, receipt) {
  const receiptJobId = asCleanString(receipt.jobId);
  const jobId = asCleanString(job?.id);
  const approvedProposalId = asCleanString(job?.approvedProposalId);
  const latestProposalVersion = Number.isFinite(job?.latestProposalVersion)
    ? Math.trunc(job.latestProposalVersion)
    : 0;
  const receiptProposalVersion = Number.isFinite(receipt.proposalVersion)
    ? Math.trunc(receipt.proposalVersion)
    : 0;
  if (latestProposalVersion <= 0 || receiptProposalVersion <= 0) return false;
  if (receiptProposalVersion !== latestProposalVersion) return false;
  return (
    receiptJobId === jobId &&
    asCleanString(receipt.proposalId) === approvedProposalId
  );
}

function queueHasApprovedReceiptIdentity(job) {
  return (
    Boolean(asCleanString(job?.id)) &&
    Boolean(asCleanString(job?.approvedProposalId)) &&
    Number.isFinite(job?.latestProposalVersion) &&
    Math.trunc(job.latestProposalVersion) > 0
  );
}

function queueReceiptRecords(job, historyKey, currentKey) {
  const currentReceipt =
    isRecord(job?.[currentKey]) && queueCurrentReceiptMatchesApprovedJob(job, job[currentKey])
      ? [job[currentKey]]
      : [];
  return [
    ...(Array.isArray(job?.[historyKey]) ? job[historyKey].filter(isRecord) : []),
    ...currentReceipt,
  ];
}

function queueDedupeReceipts(receipts, fallbackPrefix, keyParts) {
  const seen = new Set();
  return receipts.filter((receipt, index) => {
    const key = keyParts.map((part) => part(receipt)).filter(Boolean).join('|') || `${fallbackPrefix}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function queueLatestReceipt(receipts, dateField) {
  return receipts.reduce((latest, receipt) => {
    if (!latest) return receipt;
    const latestTime = reviewQueueTimestamp(asCleanString(latest[dateField]));
    const receiptTime = reviewQueueTimestamp(asCleanString(receipt[dateField]));
    return receiptTime >= latestTime ? receipt : latest;
  }, null);
}

function queueReceiptSummary(job) {
  const approvalReceipts = queueDedupeReceipts(
    queueReceiptRecords(job, 'approvalReceipts', 'approvalReceipt'),
    'approval',
    [
      (receipt) => asCleanString(receipt.jobId),
      (receipt) => asCleanString(receipt.proposalId),
      (receipt) => asCleanString(receipt.approvedAt),
    ],
  );
  const postApprovalReceipts = queueDedupeReceipts(
    queueReceiptRecords(job, 'postApprovalReceipts', 'postApprovalReceipt'),
    'post-approval',
    [
      (receipt) => asCleanString(receipt.jobId),
      (receipt) => asCleanString(receipt.proposalId),
      (receipt) => asCleanString(receipt.status),
      (receipt) => asCleanString(receipt.applyPlanFingerprint),
      (receipt) => asCleanString(receipt.recordedAt),
    ],
  );
  const activeIdentityRequired = queueHasApprovedReceiptIdentity(job);
  const activeApprovalReceipts = activeIdentityRequired
    ? approvalReceipts.filter((receipt) => queueReceiptMatchesApprovedJob(job, receipt))
    : approvalReceipts;
  const activePostApprovalReceipts = activeIdentityRequired
    ? postApprovalReceipts.filter((receipt) => queueReceiptMatchesApprovedJob(job, receipt))
    : postApprovalReceipts;
  const latestPostApprovalReceipt = queueLatestReceipt(activePostApprovalReceipts, 'recordedAt');
  const latestPostApprovalStatus = asCleanString(latestPostApprovalReceipt?.status);
  const latestPostApprovalRecordedAt = asCleanString(latestPostApprovalReceipt?.recordedAt);
  const inactiveApprovalReceiptCount = approvalReceipts.length - activeApprovalReceipts.length;
  const inactivePostApprovalReceiptCount = postApprovalReceipts.length - activePostApprovalReceipts.length;
  const activePostApprovalEvidenceCount = activePostApprovalReceipts.filter((receipt) =>
    isRecord(receipt.humanReviewEvidence),
  ).length;
  const activePostApprovalEvidenceMissingCount =
    activePostApprovalReceipts.length - activePostApprovalEvidenceCount;
  const postApprovalFingerprintStatuses = activePostApprovalReceipts.map((receipt) => {
    const expected = asCleanString(receipt.expectedApplyPlanFingerprint);
    const recorded = asCleanString(receipt.applyPlanFingerprint);
    if (!expected) return 'missing_expected';
    if (!recorded) return 'missing_recorded';
    return expected === recorded ? 'matched' : 'mismatched';
  });
  const postApprovalFingerprintMismatchCount = postApprovalFingerprintStatuses.filter(
    (status) => status === 'mismatched',
  ).length;
  const postApprovalFingerprintMissingExpectedCount = postApprovalFingerprintStatuses.filter(
    (status) => status === 'missing_expected',
  ).length;
  const postApprovalFingerprintMissingRecordedCount = postApprovalFingerprintStatuses.filter(
    (status) => status === 'missing_recorded',
  ).length;
  const postApprovalFingerprintIssueCount =
    postApprovalFingerprintMismatchCount +
    postApprovalFingerprintMissingExpectedCount +
    postApprovalFingerprintMissingRecordedCount;
  const healthBadges = [
    ...(approvalReceipts.length ? ['approval_receipt_recorded'] : []),
    ...(postApprovalReceipts.length ? ['post_approval_receipt_recorded'] : []),
    ...(inactiveApprovalReceiptCount ? ['historical_approval_receipt_recorded'] : []),
    ...(inactivePostApprovalReceiptCount ? ['historical_post_approval_receipt_recorded'] : []),
    ...(latestPostApprovalStatus ? [`latest_post_approval_${latestPostApprovalStatus}`] : []),
    ...(postApprovalFingerprintMismatchCount ? ['post_approval_fingerprint_mismatch'] : []),
    ...(postApprovalFingerprintMissingExpectedCount
      ? ['post_approval_fingerprint_missing_expected']
      : []),
    ...(postApprovalFingerprintMissingRecordedCount
      ? ['post_approval_fingerprint_missing_recorded']
      : []),
    ...(activePostApprovalEvidenceCount ? ['post_approval_human_review_evidence_recorded'] : []),
    ...(activePostApprovalEvidenceMissingCount ? ['post_approval_human_review_evidence_missing'] : []),
  ];

  return {
    approvalReceiptCount: approvalReceipts.length,
    postApprovalReceiptCount: postApprovalReceipts.length,
    activeApprovalReceiptCount: activeApprovalReceipts.length,
    activePostApprovalReceiptCount: activePostApprovalReceipts.length,
    inactiveApprovalReceiptCount,
    inactivePostApprovalReceiptCount,
    activePostApprovalEvidenceCount,
    activePostApprovalEvidenceMissingCount,
    latestPostApprovalStatus,
    latestPostApprovalRecordedAt,
    postApprovalFingerprintMismatchCount,
    postApprovalFingerprintMissingExpectedCount,
    postApprovalFingerprintMissingRecordedCount,
    postApprovalFingerprintIssueCount,
    healthBadges,
  };
}

function queueReceiptHistoryCounts(job) {
  const receiptSummary = queueReceiptSummary(job);
  return {
    ...(receiptSummary.approvalReceiptCount
      ? { approvalReceiptCount: receiptSummary.approvalReceiptCount }
      : {}),
    ...(receiptSummary.postApprovalReceiptCount
      ? { postApprovalReceiptCount: receiptSummary.postApprovalReceiptCount }
      : {}),
    ...(receiptSummary.activeApprovalReceiptCount
      ? { activeApprovalReceiptCount: receiptSummary.activeApprovalReceiptCount }
      : {}),
    ...(receiptSummary.activePostApprovalReceiptCount
      ? { activePostApprovalReceiptCount: receiptSummary.activePostApprovalReceiptCount }
      : {}),
    ...(receiptSummary.inactiveApprovalReceiptCount
      ? { inactiveApprovalReceiptCount: receiptSummary.inactiveApprovalReceiptCount }
      : {}),
    ...(receiptSummary.inactivePostApprovalReceiptCount
      ? { inactivePostApprovalReceiptCount: receiptSummary.inactivePostApprovalReceiptCount }
      : {}),
    ...(receiptSummary.activePostApprovalEvidenceCount
      ? { activePostApprovalEvidenceCount: receiptSummary.activePostApprovalEvidenceCount }
      : {}),
    ...(receiptSummary.activePostApprovalEvidenceMissingCount
      ? { activePostApprovalEvidenceMissingCount: receiptSummary.activePostApprovalEvidenceMissingCount }
      : {}),
    ...(receiptSummary.latestPostApprovalStatus
      ? { latestPostApprovalStatus: receiptSummary.latestPostApprovalStatus }
      : {}),
    ...(receiptSummary.latestPostApprovalRecordedAt
      ? { latestPostApprovalRecordedAt: receiptSummary.latestPostApprovalRecordedAt }
      : {}),
    ...(receiptSummary.postApprovalFingerprintMismatchCount
      ? { postApprovalFingerprintMismatchCount: receiptSummary.postApprovalFingerprintMismatchCount }
      : {}),
    ...(receiptSummary.postApprovalFingerprintMissingExpectedCount
      ? { postApprovalFingerprintMissingExpectedCount: receiptSummary.postApprovalFingerprintMissingExpectedCount }
      : {}),
    ...(receiptSummary.postApprovalFingerprintMissingRecordedCount
      ? { postApprovalFingerprintMissingRecordedCount: receiptSummary.postApprovalFingerprintMissingRecordedCount }
      : {}),
  };
}

function reviewQueueJobSummary(job, kind) {
  const reviewHealth = reviewQueueJobHealth(job, kind);
  return {
    id: asCleanString(job?.id),
    kind,
    appId: asCleanString(job?.appId),
    status: asCleanString(job?.status),
    ...(asCleanString(job?.surface) ? { surface: asCleanString(job.surface) } : {}),
    ...(asCleanString(job?.source) ? { source: asCleanString(job.source) } : {}),
    ...(asCleanString(job?.figmaFileName) ? { figmaFileName: asCleanString(job.figmaFileName) } : {}),
    ...(asCleanString(job?.fileKey) ? { fileKey: asCleanString(job.fileKey) } : {}),
    ...(reviewQueueDecisionSummary(job) ? { decisionSummary: reviewQueueDecisionSummary(job) } : {}),
    ...(isRecord(job?.reviewGateSummary) ? { reviewGateSummary: job.reviewGateSummary } : {}),
    ...(isRecord(job?.signalAudit) ? { signalAudit: job.signalAudit } : {}),
    ...queueReceiptHistoryCounts(job),
    reviewHealth,
    createdAt: asCleanString(job?.createdAt),
    updatedAt: asCleanString(job?.updatedAt),
    openCommand:
      kind === 'field'
        ? `pnpm review:agent field-open ${shellQuote(job?.id || '<jobId>')}`
        : `pnpm review:agent open ${shellQuote(job?.id || '<jobId>')}`,
  };
}

function reviewQueueSafety(kind) {
  return {
    phase: `${kind}_review_queue_navigation`,
    readOnly: true,
    humanReviewNavigationOnly: true,
    proposalSubmissionOnly: false,
    approvalAllowed: false,
    rejectionAllowed: false,
    applyAllowed: false,
    exportAllowed: false,
    schedulePricingAllowed: false,
    publishAllowed: false,
    submitAllowed: false,
    statusAllowed: false,
    protectedActionsAllowed: false,
  };
}

function reviewJobsPayload(jobs, kind, filters = {}) {
  const sortedJobs = sortReviewQueueJobs(jobs).map((job) => reviewQueueJobSummary(job, kind));
  const nextJob = sortedJobs.find(reviewQueueJobNeedsOpenReview) ?? null;
  const boundarySurface =
    kind === 'field'
      ? normalizedFieldReviewSurface(filters.surface) || normalizedFieldReviewSurface(nextJob?.surface)
      : '';
  return {
    kind: `localizeaso_${kind}_review_queue`,
    reviewKind: kind,
    monetizationBoundary: monetizationBoundaryForReview(kind, boundarySurface),
    filters,
    totalJobs: sortedJobs.length,
    nextJob,
    jobs: sortedJobs,
    nextHumanAction: nextJob
      ? {
          label: 'Open human review',
          command: nextJob.openCommand,
        }
      : null,
    handoffSafety: reviewQueueSafety(kind),
  };
}

async function fetchReviewJobs(kind, flags) {
  const endpoint =
    kind === 'field'
      ? `/field-review/jobs${reviewJobsQuery(flags)}`
      : `/screenshot-review/jobs${reviewJobsQuery(flags, { includeSurface: false })}`;
  const payload = await request(endpoint);
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return reviewJobsPayload(jobs, kind, {
    appId: optionalFlag(flags, 'app-id') || optionalFlag(flags, 'appId') || null,
    status: optionalFlag(flags, 'status') || null,
    ...(kind === 'field' ? { surface: optionalFlag(flags, 'surface') || null } : {}),
  });
}

async function fetchReviewWorkspaceJobs(flags) {
  const [screenshots, field] = await Promise.all([
    fetchReviewJobs('screenshots', flags),
    fetchReviewJobs('field', flags),
  ]);
  const jobs = sortReviewQueueJobs([
    ...screenshots.jobs,
    ...field.jobs,
  ]);
  const nextJob = jobs.find(reviewQueueJobNeedsOpenReview) ?? null;
  const filters = {
    appId: optionalFlag(flags, 'app-id') || optionalFlag(flags, 'appId') || null,
    status: optionalFlag(flags, 'status') || null,
  };

  return {
    kind: 'localizeaso_review_workspace_queue',
    reviewKind: 'workspace',
    monetizationBoundary: buildMonetizationBoundary('workspace'),
    filters,
    totalJobs: jobs.length,
    nextJob,
    jobs,
    queues: {
      screenshots: {
        totalJobs: screenshots.totalJobs,
        nextJob: screenshots.nextJob,
      },
      field: {
        totalJobs: field.totalJobs,
        nextJob: field.nextJob,
      },
    },
    nextHumanAction: nextJob
      ? {
          label: 'Open human review',
          command: nextJob.openCommand,
        }
      : null,
    handoffSafety: {
      ...reviewQueueSafety('workspace'),
      agentSafe: true,
      opensHumanReview: false,
      humanReviewNavigationOnly: true,
      appStoreSubmitAllowed: false,
      statusUpdateAllowed: false,
    },
  };
}

function screenshotApplyPlanQuery(flags) {
  const params = new URLSearchParams();
  const appId = optionalFlag(flags, 'app-id');
  const fileKey = optionalFlag(flags, 'file-key');
  const expectedApplyPlanFingerprint = optionalScreenshotExpectedApplyPlanFingerprint(flags);
  if (appId) params.set('appId', appId);
  if (fileKey) params.set('fileKey', fileKey);
  if (expectedApplyPlanFingerprint) {
    params.set('expectedApplyPlanFingerprint', expectedApplyPlanFingerprint);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function fieldApplyPlanQuery(flags) {
  const params = new URLSearchParams();
  const appId = optionalFlag(flags, 'app-id');
  const expectedApplyPlanFingerprint = optionalFieldExpectedApplyPlanFingerprint(flags);
  if (appId) params.set('appId', appId);
  if (expectedApplyPlanFingerprint) {
    params.set('expectedApplyPlanFingerprint', expectedApplyPlanFingerprint);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function fieldPricingPayloadQuery(flags) {
  const params = new URLSearchParams(fieldApplyPlanQuery(flags).replace(/^\?/, ''));
  const approvedFieldReviewProposalId =
    optionalFlag(flags, 'approved-field-review-proposal-id') ||
    optionalFlag(flags, 'approvedFieldReviewProposalId');
  const approvedFieldReviewProposalVersion =
    optionalFlag(flags, 'approved-field-review-proposal-version') ||
    optionalFlag(flags, 'approvedFieldReviewProposalVersion');
  if (approvedFieldReviewProposalId) {
    params.set('approvedFieldReviewProposalId', approvedFieldReviewProposalId);
  }
  if (approvedFieldReviewProposalVersion) {
    params.set('approvedFieldReviewProposalVersion', approvedFieldReviewProposalVersion);
  }
  params.set('humanPostApprovalConsent', 'true');
  const query = params.toString();
  return query ? `?${query}` : '';
}

function optionalExpectedApplyPlanFingerprint(flags) {
  const value =
    optionalFlag(flags, 'expected-apply-plan-fingerprint') ||
    optionalFlag(flags, 'expectedApplyPlanFingerprint') ||
    optionalFlag(flags, 'apply-plan-fingerprint');
  return typeof value === 'string' ? value.trim() : '';
}

function optionalScreenshotExpectedApplyPlanFingerprint(flags) {
  const expectedApplyPlanFingerprint = optionalExpectedApplyPlanFingerprint(flags);
  if (!expectedApplyPlanFingerprint) return '';
  if (!isScreenshotApplyPlanFingerprint(expectedApplyPlanFingerprint)) {
    throw new Error(
      'The screenshot apply-plan query fingerprint is invalid. Use the screenshot-apply-plan-v1 fingerprint from the approved screenshot apply plan.',
    );
  }
  return expectedApplyPlanFingerprint;
}

function optionalFieldExpectedApplyPlanFingerprint(flags) {
  const expectedApplyPlanFingerprint = optionalExpectedApplyPlanFingerprint(flags);
  if (!expectedApplyPlanFingerprint) return '';
  if (!isFieldApplyPlanFingerprint(expectedApplyPlanFingerprint)) {
    throw new Error(
      'The field apply-plan query fingerprint is invalid. Use the field-apply-plan-v1 fingerprint from the approved field apply plan.',
    );
  }
  return expectedApplyPlanFingerprint;
}

function withExpectedApplyPlanFingerprint(body, flags) {
  const expectedApplyPlanFingerprint = optionalExpectedApplyPlanFingerprint(flags);
  return expectedApplyPlanFingerprint ? { ...body, expectedApplyPlanFingerprint } : body;
}

function requireScreenshotExpectedApplyPlanFingerprint(flags) {
  const expectedApplyPlanFingerprint = optionalExpectedApplyPlanFingerprint(flags);
  if (!expectedApplyPlanFingerprint) {
    throw new Error(
      'A screenshot apply-plan fingerprint is required. Run apply-plan after approval and pass --expected-apply-plan-fingerprint <applyPlanFingerprint>.',
    );
  }
  if (!isScreenshotApplyPlanFingerprint(expectedApplyPlanFingerprint)) {
    throw new Error(
      'The screenshot apply-plan fingerprint is invalid. Run apply-plan after approval and copy its screenshot-apply-plan-v1 fingerprint.',
    );
  }
  return expectedApplyPlanFingerprint;
}

function withRequiredScreenshotExpectedApplyPlanFingerprint(body, flags) {
  return {
    ...body,
    expectedApplyPlanFingerprint: requireScreenshotExpectedApplyPlanFingerprint(flags),
  };
}

function withOptionalScreenshotApprovedProposalGuards(body, flags) {
  const approvedScreenshotReviewProposalId =
    optionalFlag(flags, 'approved-screenshot-review-proposal-id') ||
    optionalFlag(flags, 'approvedScreenshotReviewProposalId');
  const approvedScreenshotReviewProposalVersionRaw =
    optionalFlag(flags, 'approved-screenshot-review-proposal-version') ||
    optionalFlag(flags, 'approvedScreenshotReviewProposalVersion');
  const proposalVersion =
    approvedScreenshotReviewProposalVersionRaw === ''
      ? null
      : Number(approvedScreenshotReviewProposalVersionRaw);
  if (
    approvedScreenshotReviewProposalVersionRaw &&
    (!Number.isInteger(proposalVersion) || proposalVersion <= 0)
  ) {
    throw new Error('--approved-screenshot-review-proposal-version must be a positive integer.');
  }
  return {
    ...body,
    ...(approvedScreenshotReviewProposalId
      ? { approvedScreenshotReviewProposalId }
      : {}),
    ...(proposalVersion
      ? { approvedScreenshotReviewProposalVersion: proposalVersion }
      : {}),
  };
}

function requireFieldExpectedApplyPlanFingerprint(flags) {
  const expectedApplyPlanFingerprint = optionalExpectedApplyPlanFingerprint(flags);
  if (!expectedApplyPlanFingerprint) {
    throw new Error(
      'A field apply-plan fingerprint is required. Run field-apply-plan after approval and pass --expected-apply-plan-fingerprint <applyPlanFingerprint>.',
    );
  }
  if (!isFieldApplyPlanFingerprint(expectedApplyPlanFingerprint)) {
    throw new Error(
      'The field apply-plan fingerprint is invalid. Run field-apply-plan after approval and copy its field-apply-plan-v1 fingerprint.',
    );
  }
  return expectedApplyPlanFingerprint;
}

function withRequiredFieldExpectedApplyPlanFingerprint(body, flags) {
  return {
    ...body,
    expectedApplyPlanFingerprint: requireFieldExpectedApplyPlanFingerprint(flags),
  };
}

function withOptionalFieldApprovedProposalGuards(body, flags) {
  const approvedFieldReviewProposalId =
    optionalFlag(flags, 'approved-field-review-proposal-id') ||
    optionalFlag(flags, 'approvedFieldReviewProposalId');
  const approvedFieldReviewProposalVersionRaw =
    optionalFlag(flags, 'approved-field-review-proposal-version') ||
    optionalFlag(flags, 'approvedFieldReviewProposalVersion');
  const proposalVersion =
    approvedFieldReviewProposalVersionRaw === ''
      ? null
      : Number(approvedFieldReviewProposalVersionRaw);
  if (
    approvedFieldReviewProposalVersionRaw &&
    (!Number.isInteger(proposalVersion) || proposalVersion <= 0)
  ) {
    throw new Error('--approved-field-review-proposal-version must be a positive integer.');
  }
  return {
    ...body,
    ...(approvedFieldReviewProposalId
      ? { approvedFieldReviewProposalId }
      : {}),
    ...(proposalVersion
      ? { approvedFieldReviewProposalVersion: proposalVersion }
      : {}),
  };
}

function cliConfigPath() {
  return process.env.LOCALIZEASO_CONFIG?.trim() || DEFAULT_CLI_CONFIG_PATH;
}

function readPackageMetadata() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPreviewNpmCliPackage() {
  const metadata = readPackageMetadata();
  return metadata.name === '@localizeaso/cli' && typeof metadata.version === 'string' && metadata.version.includes('-preview');
}

function defaultBackend() {
  return isPreviewNpmCliPackage() ? STAGING_BACKEND_URL : LOCAL_BACKEND_URL;
}

function defaultDashboard() {
  return isPreviewNpmCliPackage() ? STAGING_DASHBOARD_URL : LOCAL_DASHBOARD_URL;
}

function readCliConfig() {
  try {
    const parsed = JSON.parse(readFileSync(cliConfigPath(), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function configuredToken() {
  const envToken = process.env.LOCALIZEASO_TOKEN?.trim();
  if (envToken) return envToken;
  const config = readCliConfig();
  return typeof config.token === 'string' ? config.token.trim() : '';
}

function configuredBackend() {
  const config = readCliConfig();
  return (process.env.LOCALIZEASO_BACKEND || config.backend || defaultBackend()).replace(/\/+$/, '');
}

function getConfig() {
  const token = configuredToken();
  if (!token) {
    throw new Error(
      'LOCALIZEASO_TOKEN is required. Run localizeaso login --email you@example.com --password-stdin or set LOCALIZEASO_TOKEN.',
    );
  }

  const backend = configuredBackend();
  return { token, backend };
}

async function readJsonFile(path) {
  if (!path || path === true) {
    throw new Error('Provide a JSON file with --file <path>.');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

const FIELD_REVIEW_SURFACES = new Set(['metadata', 'keywords', 'pricing']);

function fieldReviewBodyWithSurfaceFlag(body, flags, commandName) {
  const surface = optionalFlag(flags, 'surface');
  if (!surface) return body;
  if (!FIELD_REVIEW_SURFACES.has(surface)) {
    throw new Error(`Invalid --surface ${surface}. Expected metadata, keywords, or pricing.`);
  }

  const currentSurface = typeof body?.surface === 'string' && body.surface.trim() ? body.surface.trim() : '';
  if (currentSurface && currentSurface !== surface) {
    throw new Error(`${commandName} --surface ${surface} does not match job JSON surface ${currentSurface}.`);
  }
  return { ...body, surface };
}

function rejectPricingFieldStartKeywordFlags(body, flags) {
  if (body?.surface !== 'pricing') return;

  const blockedFlags = [
    flags['sync-keywords'] ? '--sync-keywords' : null,
    flags['keywords-csv'] !== undefined ? '--keywords-csv' : null,
    flags['import-keywords'] ? '--import-keywords' : null,
    flags['discover-astro-csv'] ? '--discover-astro-csv' : null,
    flags.discover ? '--discover' : null,
  ].filter(Boolean);

  if (blockedFlags.length === 0) return;

  throw new Error(
    `Pricing field-start does not use keyword/Astro context flags (${blockedFlags.join(', ')}). ` +
      'Create the pricing review job without keyword flags, then use localizeaso pricing brief <jobId> for pricing context.',
  );
}

const CSV_DISCOVERY_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);
const CSV_DISCOVERY_MAX_HEADER_BYTES = 64_000;

function isAutoCsvFlag(value, flags = {}) {
  return value === 'auto' || value === 'optional-auto' || flags['discover-astro-csv'] === true || flags.discover === true;
}

function isOptionalAutoCsvFlag(value, flags = {}) {
  return value === 'optional-auto' || (isAutoCsvFlag(value, flags) && flags['skip-missing-keywords-csv'] === true);
}

function scoreKeywordCsvCandidate(filePath, stats) {
  const basename = path.basename(filePath).toLowerCase();
  const fullPath = filePath.toLowerCase();
  let score = 0;

  if (basename === 'astro-keywords.csv') score += 1000;
  if (basename.includes('astro')) score += 200;
  if (basename.includes('keyword')) score += 180;
  if (basename.includes('aso')) score += 120;
  if (fullPath.includes('/astro')) score += 50;
  if (fullPath.includes('/export')) score += 30;
  score += Math.min(50, Math.floor(stats.mtimeMs / 86_400_000));

  return score;
}

async function inspectKeywordCsvCandidate(filePath, stats) {
  if (stats.size <= 0 || stats.size > 10_000_000) return null;

  const content = await readFile(filePath, 'utf8');
  const headerContent =
    content.length > CSV_DISCOVERY_MAX_HEADER_BYTES ? content.slice(0, CSV_DISCOVERY_MAX_HEADER_BYTES) : content;
  const table = parseCsvTable(headerContent);
  const mapping = suggestAsoKeywordColumnMapping(table.header);
  if (mapping.locale == null || mapping.keyword == null) return null;

  return {
    path: filePath,
    mtimeMs: stats.mtimeMs,
    score: scoreKeywordCsvCandidate(filePath, stats),
  };
}

async function findAstroKeywordCsv(flags) {
  const rootFlag =
    typeof flags['astro-dir'] === 'string' && flags['astro-dir'].trim()
      ? flags['astro-dir'].trim()
      : typeof flags['search-dir'] === 'string' && flags['search-dir'].trim()
        ? flags['search-dir'].trim()
        : process.cwd();
  const root = path.resolve(rootFlag);
  const maxDepth =
    typeof flags['max-depth'] === 'string' && Number.isFinite(Number(flags['max-depth']))
      ? Math.max(0, Math.min(8, Number(flags['max-depth'])))
      : 5;
  const candidates = [];

  async function visit(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (CSV_DISCOVERY_SKIP_DIRS.has(entry.name)) continue;
        await visit(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.csv')) continue;
      const filePath = path.join(dir, entry.name);
      const stats = await stat(filePath);
      const candidate = await inspectKeywordCsvCandidate(filePath, stats);
      if (candidate) candidates.push(candidate);
    }
  }

  await visit(root, 0);
  candidates.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));

  return {
    path: candidates[0]?.path ?? null,
    root,
    candidates,
  };
}

function keywordCsvDiscoverySummary(result) {
  return {
    root: result.root,
    selectedPath: result.path,
    candidateCount: result.candidates.length,
    topCandidates: result.candidates.slice(0, 5).map((candidate) => ({
      path: candidate.path,
      score: candidate.score,
      mtimeMs: candidate.mtimeMs,
    })),
  };
}

async function resolveCsvSource(flags, key, options = {}) {
  const value = flags[key];
  if (typeof value === 'string' && value.trim() && !isAutoCsvFlag(value, flags)) {
    return { path: value.trim(), discovery: null };
  }
  if (isAutoCsvFlag(value, flags)) {
    const result = await findAstroKeywordCsv(flags);
    if (options.optionalAuto && isOptionalAutoCsvFlag(value, flags)) {
      return {
        path: result.path,
        discovery: keywordCsvDiscoverySummary(result),
      };
    }
    if (!result.path) {
      throw new Error(`No Astro/keyword CSV was found under ${result.root}. Provide --file <path> or --keywords-csv <path>.`);
    }
    return {
      path: result.path,
      discovery: keywordCsvDiscoverySummary(result),
    };
  }
  const flagName = key === 'keywords-csv' ? '--keywords-csv' : '--file';
  throw new Error(`Provide a CSV file with ${flagName} <path>, or use ${flagName} auto.`);
}

async function readRefineRequest(flags) {
  if (flags.file) {
    return readJsonFile(flags.file);
  }

  const instructions = typeof flags.instructions === 'string' ? flags.instructions.trim() : '';
  if (!instructions) {
    throw new Error('Provide reviewer feedback with --instructions "..." or --file refine-request.json.');
  }

  const targetLocales =
    typeof flags['target-locales'] === 'string'
      ? flags['target-locales'].split(',').map((value) => value.trim()).filter(Boolean)
      : typeof flags['target-locale'] === 'string'
        ? [flags['target-locale'].trim()].filter(Boolean)
        : undefined;
  const targets =
    typeof flags.targets === 'string' && flags.targets.trim()
      ? JSON.parse(flags.targets)
      : undefined;
  const contextSnapshot = await readRefineContextSnapshot(flags);

  return {
    instructions,
    ...(typeof flags['proposal-id'] === 'string' ? { proposalId: flags['proposal-id'] } : {}),
    ...(targetLocales?.length ? { targetLocales } : {}),
    ...(targets ? { targets } : {}),
    ...(contextSnapshot ? { contextSnapshot } : {}),
  };
}

async function readRefineContextSnapshot(flags) {
  const inlineValue =
    typeof flags['context-snapshot'] === 'string'
      ? flags['context-snapshot']
      : typeof flags.contextSnapshot === 'string'
        ? flags.contextSnapshot
        : '';
  const fileValue =
    typeof flags['context-snapshot-file'] === 'string'
      ? flags['context-snapshot-file']
      : typeof flags.contextSnapshotFile === 'string'
        ? flags.contextSnapshotFile
        : '';

  if (inlineValue.trim() && fileValue.trim()) {
    throw new Error('Use either --context-snapshot or --context-snapshot-file, not both.');
  }
  if (inlineValue.trim()) return normalizeReviewerFeedbackContextSnapshot(inlineValue);
  if (!fileValue.trim()) return '';

  const text = await readFile(fileValue.trim(), 'utf8');
  return normalizeReviewerFeedbackContextSnapshot(text);
}

async function readDecisionBatch(flags) {
  const payload = await readJsonFile(flags.file);
  const consent = { humanReviewConsent: true };
  if (Array.isArray(payload)) {
    return { decisions: payload, ...consent };
  }
  return { ...payload, ...consent };
}

async function readKeywordContextFromCsv(flags, options = {}) {
  const csvSource = await resolveCsvSource(flags, 'file', options);
  flags.__lastCsvDiscovery = csvSource.discovery;
  const csvPath = csvSource.path;
  if (!csvPath) return null;

  const source = typeof flags.source === 'string' && flags.source.trim() ? flags.source.trim() : 'astro';
  const table = parseCsvTable(await readFile(csvPath, 'utf8'));
  const mapping = suggestAsoKeywordColumnMapping(table.header);
  const result = mapCsvTableToAsoKeywordRows(table, mapping, { allowUnmappedLocales: true });

  if (result.errors.length > 0) {
    throw new Error(`Keyword CSV could not be mapped: ${result.errors.join(' ')}`);
  }

  const keywords = {};
  for (const row of result.rows) {
    keywords[row.locale] ??= [];
    if (!keywords[row.locale].includes(row.keyword)) {
      keywords[row.locale].push(row.keyword);
    }
  }

  return {
    sources: [source],
    keywords,
    rows: result.rows.map((row) => ({
      ...row,
      source,
    })),
    summary: {
      source,
      csvPath,
      localeCount: Object.keys(keywords).length,
      keywordCount: result.rows.length,
      ...(csvSource.discovery ? { discovery: csvSource.discovery } : {}),
      ...(result.skippedRows?.length
        ? {
            skippedRowCount: result.skippedRows.length,
            unmappedLocaleValues: [...new Set(result.skippedRows.map((row) => row.localeRaw).filter(Boolean))],
          }
        : {}),
    },
    ...(result.skippedRows?.length
      ? {
          warnings: result.skippedRows.map((row) => ({
            kind: 'unmapped_locale',
            rowNumber: row.rowNumber,
            localeRaw: row.localeRaw,
            keyword: row.keyword,
            message: `Skipped CSV row ${row.rowNumber}: unable to map locale "${row.localeRaw}".`,
          })),
        }
      : {}),
  };
}

async function readAsoKeywordImportRowsFromCsv(flags) {
  const csvSource = await resolveCsvSource(flags, 'file', { optionalAuto: true });
  flags.__lastCsvDiscovery = csvSource.discovery;
  const csvPath = csvSource.path;
  if (!csvPath) return null;

  const table = parseCsvTable(await readFile(csvPath, 'utf8'));
  const mapping = suggestAsoKeywordColumnMapping(table.header);
  const result = mapCsvTableToAsoKeywordRows(table, mapping, { allowUnmappedLocales: true });

  if (result.errors.length > 0) {
    throw new Error(`ASO keyword CSV could not be mapped: ${result.errors.join(' ')}`);
  }

  return {
    rows: result.rows,
    skippedRows: result.skippedRows ?? [],
    csvPath,
    discovery: csvSource.discovery,
  };
}

function summarizeAsoKeywordRows(rows, skippedRows = []) {
  const locales = new Set();
  for (const row of rows) {
    if (row.locale) locales.add(row.locale);
  }
  return {
    localeCount: locales.size,
    keywordCount: rows.length,
    ...(skippedRows.length
      ? {
          skippedRowCount: skippedRows.length,
          unmappedLocaleValues: [...new Set(skippedRows.map((row) => row.localeRaw).filter(Boolean))],
        }
      : {}),
  };
}

function appIdFromJobBody(body, command) {
  const appId = typeof body?.appId === 'string' ? body.appId.trim() : '';
  if (!appId) {
    throw new Error(`--import-keywords requires ${command} job JSON to include appId.`);
  }
  return appId;
}

function buildAsoKeywordImportSafety() {
  return {
    version: 1,
    agentSafe: true,
    humanOnly: false,
    requiresHostedAi: false,
    requiresLocalizeAsoPass: true,
    requiredLocalizeAsoCapabilities: ['byoAgent', 'reviewHistory'],
    requiresAppStoreConnectCredentials: false,
    proposalSubmissionOnly: false,
    readOnly: false,
    keywordResearchImportOnly: true,
    reviewDataMutationKind: 'keyword_research_inventory',
    mutatesReviewData: true,
    mutatesPersistentKeywordInventory: true,
    mutatesAppStoreConnect: false,
    protectedActionsAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
    figmaApplyAllowed: false,
    metadataApplyAllowed: false,
    metadataExportAllowed: false,
    metadataPublishAllowed: false,
    keywordApplyAllowed: false,
    pricingExportAllowed: false,
    pricingScheduleAllowed: false,
    pricingPublishAllowed: false,
    screenshotUploadAllowed: false,
    screenshotPublishAllowed: false,
    appStoreUploadAllowed: false,
    appStoreSubmitAllowed: false,
    appStorePublishAllowed: false,
    statusUpdateAllowed: false,
    postApprovalActionAllowed: false,
    humanApprovalConsentGranted: false,
    humanRejectionConsentGranted: false,
    humanPostApprovalConsentGranted: false,
    requiresHumanApprovalBeforeProtectedActions: true,
    requiresHumanRejectionConsentForReviewRejection: true,
    requiresHumanApprovalBeforePostApprovalActions: true,
    postApprovalPathsHumanOnly: true,
    protectedActions: [
      'human_approval',
      'review_rejection',
      'figma_apply',
      'metadata_apply',
      'metadata_export',
      'metadata_publish',
      'pricing_schedule',
      'pricing_export',
      'pricing_publish',
      'keyword_apply',
      'screenshot_upload',
      'screenshot_publish',
      'app_store_upload',
      'app_store_submit',
      'app_store_publish',
      'status_update',
    ],
    agentInstruction:
      'This command may import ASO keyword research rows into LocalizeASO, but it must not approve reviews, apply Figma changes, push or publish metadata, apply keywords, export or schedule pricing, upload screenshots, mark status, or upload/submit to App Store Connect.',
  };
}

async function importAsoKeywordsFromCsv(appId, flags) {
  const importRows = await readAsoKeywordImportRowsFromCsv(flags);
  if (!importRows) {
    return {
      appId,
      skipped: true,
      reason: 'missing_optional_astro_csv',
      ...(flags.__lastCsvDiscovery ? { discovery: flags.__lastCsvDiscovery } : {}),
      message: 'No optional Astro/keyword CSV was found; persistent ASO keyword import was skipped.',
      importSafety: buildAsoKeywordImportSafety(),
      nextAgentAction: missingOptionalCsvNextAgentAction('import', { appId }),
    };
  }
  const { rows, skippedRows = [], csvPath, discovery } = importRows;
  if (!rows.length) {
    const skippedHint = skippedRows.length
      ? ` ${skippedRows.length} row(s) were skipped because their locale/store could not be mapped.`
      : '';
    throw new Error(`No valid ASO keyword rows found in CSV.${skippedHint}`);
  }
  const payload = await request(`/aso-keywords/apps/${encodeURIComponent(appId)}/import`, {
    method: 'POST',
    body: { rows, translateToEnglish: false },
  });
  const reviewConsent = buildAsoKeywordImportReviewConsent(appId, rows);
  return {
    appId,
    csvPath,
    ...(discovery ? { discovery } : {}),
    parsed: summarizeAsoKeywordRows(rows, skippedRows),
    importSafety: isRecord(payload.importSafety) ? payload.importSafety : buildAsoKeywordImportSafety(),
    reviewConsent,
    nextHumanAction: reviewConsent.nextHumanAction,
    ...(skippedRows.length
      ? {
          warnings: skippedRows.map((row) => ({
            kind: 'unmapped_locale',
            rowNumber: row.rowNumber,
            localeRaw: row.localeRaw,
            keyword: row.keyword,
            message: `Skipped CSV row ${row.rowNumber}: unable to map locale "${row.localeRaw}".`,
          })),
        }
      : {}),
    result: payload,
  };
}

function buildAsoKeywordImportReviewConsent(appId, rows = []) {
  const manifestFile = 'keyword-field-job.json';
  const bundleOut = 'keyword-field-bundle.json';
  const handoffOut = 'keyword-field-handoff.json';
  const out = 'keyword-field-start-result.json';
  const targetLocales = Array.from(
    new Set(rows.map((row) => asCleanString(row.locale)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const manifest = {
    appId,
    surface: 'keywords',
    source: 'agent',
    instructions:
      'Generate keyword review proposals only. Use assignedKeywords, unassignedKeywords, warnings, rationale, and keep human approval required.',
    context: {
      ...(targetLocales.length ? { targetLocales } : {}),
      agentGoals: ['Review imported Astro/CSV keyword coverage and propose locale-native keyword changes.'],
    },
  };
  const command = [
    'pnpm localizeaso keywords start',
    '--file',
    shellQuote(manifestFile),
    '--sync-keywords',
    '--bundle-out',
    shellQuote(bundleOut),
    '--handoff',
    shellQuote(handoffOut),
    '--out',
    shellQuote(out),
  ].join(' ');
  const mcpToolCall = mcpToolCommand('localizeaso_keywords_start', {
    jobFile: manifestFile,
    syncKeywords: true,
    bundleOut,
    handoffOut,
    out,
  });

  return {
    opensHumanReviewScreen: false,
    consentScreen: 'LocalizeASO keyword field review',
    manifestFile,
    manifest,
    checklist: normalizeReviewConsentChecklist([
      {
        label: 'Astro/CSV keyword rows were imported into the LocalizeASO ASO keyword inventory.',
        actor: 'agent',
      },
      {
        label: 'Write the included keyword field-review manifest, start the review job, and return the human review handoff without opening a browser by default.',
        actor: 'system',
      },
      {
        label: 'Open the keyword review screen only with keywords open/popup or --open when the human is signed in and ready.',
        actor: 'human',
      },
      {
        label: 'Sync imported and existing keyword rows into the field-review bundle before proposal generation.',
        actor: 'system',
      },
      {
        label: 'Review current keywords, agent proposals, assigned keywords, unassigned keywords, warnings, rationale, and diffs per locale.',
        actor: 'human',
      },
      {
        label: 'Only after approval may a human apply accepted or edited keyword changes to the LocalizeASO keyword store.',
        actor: 'human',
      },
    ]),
    prohibitedAgentActions: [
      'approve_review',
      'reject_review',
      'apply_keyword_store_changes',
      'push_or_publish_metadata',
      'schedule_or_publish_pricing',
      'upload_or_publish_screenshots',
      'submit_to_app_store_connect',
      'mark_status_applied_or_submitted',
    ],
    nextHumanAction: {
      id: 'start_keyword_review',
      label: 'Start keyword review and return handoff',
      command,
      mcpToolCall,
      requiresLocalizeAsoPass: true,
      requiredLocalizeAsoCapabilities: ['byoAgent', 'reviewHistory'],
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
    },
  };
}

function missingOptionalCsvNextAgentAction(scope, ids = {}) {
  const action = {
    continueWithoutCsv: true,
    requiresLocalizeAsoPass: scope === 'import',
    ...(scope === 'import' ? { requiredLocalizeAsoCapabilities: ['byoAgent', 'reviewHistory'] } : {}),
    requiresAppStoreConnectCredentials: false,
    note:
      'optional-auto means a missing Astro/keyword CSV is non-blocking. Continue with existing LocalizeASO keywords, attach manual/provider-neutral keyword context, or generate a keyword prompt before writing the proposal.',
    suggestedNextSteps: [
      'Fetch a fresh bundle or keyword brief to inspect existing keyword coverage.',
      'If coverage is still incomplete, generate a keyword prompt for Codex, Astro MCP, or another keyword agent.',
      'When keyword context is available, attach it before generating the final proposal.',
    ],
  };

  if (scope === 'screenshot' && ids.jobId) {
    return {
      ...action,
      commands: {
        keywordBrief: `pnpm localizeaso screenshots keyword-brief ${shellQuote(ids.jobId)} --out keyword-brief.json`,
        keywordPrompt: `pnpm localizeaso screenshots keyword-prompt ${shellQuote(ids.jobId)} --out keyword-agent-prompt.md`,
        attachManualContext: `pnpm localizeaso screenshots context ${shellQuote(ids.jobId)} --file keyword-context.json`,
      },
      mcpTools: {
        keywordBrief: `localizeaso_screenshot_keyword_brief {"jobId":${JSON.stringify(ids.jobId)},"out":"keyword-brief.json"}`,
        keywordPrompt: `localizeaso_screenshot_keyword_prompt {"jobId":${JSON.stringify(ids.jobId)},"out":"keyword-agent-prompt.md"}`,
        attachManualContext: `localizeaso_screenshot_keyword_context {"jobId":${JSON.stringify(ids.jobId)},"contextFile":"keyword-context.json","out":"keyword-context-result.json"}`,
      },
    };
  }

  if (scope === 'field' && ids.jobId) {
    const mcpPrefix = keywordAutomationMcpPrefix('field', ids.surface);
    return {
      ...action,
      commands: {
        keywordBrief: keywordAutomationCliJobCommand(
          'field',
          ids.surface,
          'keyword-brief',
          ids.jobId,
          '--out keyword-brief.json',
        ),
        keywordPrompt: keywordAutomationCliJobCommand(
          'field',
          ids.surface,
          'keyword-prompt',
          ids.jobId,
          '--out keyword-agent-prompt.md',
        ),
        attachManualContext: keywordAutomationCliJobCommand(
          'field',
          ids.surface,
          'context',
          ids.jobId,
          '--file keyword-context.json',
        ),
      },
      mcpTools: {
        keywordBrief: `${mcpPrefix}_keyword_brief {"jobId":${JSON.stringify(ids.jobId)},"out":"keyword-brief.json"}`,
        keywordPrompt: `${mcpPrefix}_keyword_prompt {"jobId":${JSON.stringify(ids.jobId)},"out":"keyword-agent-prompt.md"}`,
        attachManualContext: `${mcpPrefix}_keyword_context {"jobId":${JSON.stringify(ids.jobId)},"contextFile":"keyword-context.json","out":"keyword-context-result.json"}`,
      },
    };
  }

  if (scope === 'import' && ids.appId) {
    return {
      ...action,
      suggestedNextSteps: [
        'Continue with LocalizeASO ASO keywords already stored for this app.',
        'If coverage is incomplete, create a review job and use its keyword brief or keyword prompt.',
        'Import Astro CSV later with the same command when a CSV export exists.',
      ],
      commands: {
        retryImportWhenCsvExists: `pnpm localizeaso keywords import-csv ${shellQuote(ids.appId)} --file astro-keywords.csv`,
      },
      mcpTools: {
        retryImportWhenCsvExists: `localizeaso_import_aso_keywords_from_csv {"appId":${JSON.stringify(ids.appId)},"csvPath":"astro-keywords.csv","out":"aso-keyword-import-result.json"}`,
      },
    };
  }

  return action;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function reviewSignalGroupLabel(value) {
  switch (asCleanString(value)) {
    case 'assignedKeywords':
      return 'assigned keywords';
    case 'unassignedKeywords':
      return 'unassigned keywords';
    case 'keywordMappingNotApplicable':
    case 'Keyword mapping not applicable':
      return 'keyword mapping n/a';
    case 'warnings':
    case 'Warnings':
      return 'warnings';
    case 'rationale':
    case 'rationales':
    case 'Rationales':
      return 'rationale';
    case 'Used keywords':
      return 'used keywords';
    case 'Unassigned keywords':
      return 'unassigned keywords';
    case 'screenshotEvidence':
      return 'screenshot evidence';
    default:
      return asCleanString(value);
  }
}

function reviewSignalGapSummaryLine(input, options = {}) {
  return formatReviewSignalGapSummaryLine(input, options);
}

function normalizeReviewLocale(value) {
  return asCleanString(value).replace(/_/g, '-').toLowerCase();
}

function addReviewLocale(list, value) {
  const locale = asCleanString(value);
  const normalizedLocale = normalizeReviewLocale(locale);
  if (!locale || !normalizedLocale) return;
  if (list.some((existing) => normalizeReviewLocale(existing) === normalizedLocale)) return;
  list.push(locale);
}

function addUniqueString(list, value, limit = 80) {
  const text = asCleanString(value);
  if (!text || list.includes(text) || list.length >= limit) return;
  list.push(text);
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(asCleanString).filter(Boolean);
}

function reviewConsentChecklistId(label, index) {
  const slug = asCleanString(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return slug ? `review_consent_${slug}` : `review_consent_step_${index + 1}`;
}

function reviewConsentChecklistActor(label) {
  const normalized = asCleanString(label).toLowerCase();
  if (
    normalized.startsWith('review ') ||
    normalized.startsWith('approve') ||
    normalized.startsWith('only after approval') ||
    normalized.includes('human review')
  ) {
    return 'human';
  }
  if (
    normalized.includes('agent') ||
    normalized.includes('codex') ||
    normalized.includes('astro') ||
    normalized.includes('provider-neutral')
  ) {
    return 'agent';
  }
  return 'system';
}

function normalizeReviewConsentChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (isRecord(item)) {
      const label = asCleanString(item.label);
      if (!label) return null;
      const actor = ['agent', 'human', 'system'].includes(item.actor) ? item.actor : reviewConsentChecklistActor(label);
      return {
        id: asCleanString(item.id) || reviewConsentChecklistId(label, index),
        label,
        required: typeof item.required === 'boolean' ? item.required : true,
        actor,
      };
    }
    const label = asCleanString(item);
    if (!label) return null;
    return {
      id: reviewConsentChecklistId(label, index),
      label,
      required: true,
      actor: reviewConsentChecklistActor(label),
    };
  }).filter(Boolean);
}

function reviewerFeedbackScopeDisplay(scope) {
  const summaryPrefix = 'Summary:';
  const values = cleanStringArray(scope);
  const summary = values.find((item) => item.startsWith(summaryPrefix))?.slice(summaryPrefix.length).trim() || '';
  const details = values.filter((item) => !item.startsWith(summaryPrefix));
  return { summary, details };
}

function uniqueReviewSignalCount(values) {
  const seen = new Set();
  for (const value of values.flatMap((items) => (Array.isArray(items) ? items : []))) {
    const normalized = asCleanString(value).toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return seen.size;
}

function normalizeReviewSignalList(values) {
  const seen = new Set();
  const normalizedValues = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = asCleanString(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    normalizedValues.push(normalized);
  }
  return normalizedValues;
}

function applyPlanSignalPreview(changes) {
  return {
    assignedKeywords: normalizeReviewSignalList(
      changes.flatMap((change) => (Array.isArray(change?.assignedKeywords) ? change.assignedKeywords : [])),
    ),
    unassignedKeywords: normalizeReviewSignalList(
      changes.flatMap((change) => (Array.isArray(change?.unassignedKeywords) ? change.unassignedKeywords : [])),
    ),
    warnings: normalizeReviewSignalList(
      changes.flatMap((change) => (Array.isArray(change?.warnings) ? change.warnings : [])),
    ),
    rationales: normalizeReviewSignalList(
      changes.flatMap((change) => (asCleanString(change?.rationale) ? [change.rationale] : [])),
    ),
  };
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstCleanString(...values) {
  for (const value of values) {
    const text = asCleanString(value);
    if (text) return text;
  }
  return '';
}

function firstAmount(...values) {
  for (const value of values) {
    const amount = parseAmount(value);
    if (amount !== null) return amount;
  }
  return null;
}

function normalizeTerritoryId(value) {
  return firstCleanString(value).replace(/[^A-Za-z]/g, '').toUpperCase();
}

function pricingParityRows(plan) {
  const sources = [
    plan?.localizedSuggestions,
    plan?.targetPrices,
    plan?.prices,
    plan?.territoryPrices,
    plan?.territories,
    plan?.rows,
  ];
  for (const source of sources) {
    if (Array.isArray(source)) return source.filter(isRecord);
  }
  return [];
}

function pricingParityManifestOutputPath(flags, fallback = 'pricing-field-job.json') {
  return firstCleanString(
    flags['manifest-output'],
    flags['manifest-out'],
    flags['manifestOut'],
    flags.__pricingParityManifestOut,
    fallback,
  );
}

function normalizePricingParityPlan(input, flags, options = {}) {
  if (!isRecord(input)) {
    throw new Error('Pricing parity input JSON must be an object.');
  }

  const appId = firstCleanString(flags['app-id'], input.appId);
  if (!appId) throw new Error('Pricing parity manifest requires --app-id or input.appId.');

  const productKind = firstCleanString(flags['product-kind'], input.productKind, input.kind).toLowerCase();
  if (productKind !== 'subscription' && productKind !== 'iap') {
    throw new Error('Pricing parity manifest requires productKind subscription or iap.');
  }

  const product = isRecord(input.product) ? input.product : {};
  const productId = firstCleanString(flags['product-id'], input.productId, input.subscriptionId, input.iapId, product.id, product.productId);
  if (!productId) throw new Error('Pricing parity manifest requires --product-id or input.productId.');

  const rows = pricingParityRows(input);
  if (!rows.length) {
    throw new Error('Pricing parity input must include prices, targetPrices, localizedSuggestions, territories, or rows.');
  }

  const currentPricing = [];
  const localizedSuggestions = [];
  const changedTerritoryIds = [];

  for (const row of rows) {
    const territoryId = normalizeTerritoryId(
      row.territoryId ?? row.territory ?? row.countryCode ?? row.country ?? row.storefront,
    );
    if (!territoryId) continue;
    const currentPrice = firstAmount(row.currentPrice, row.current, row.oldPrice, row.existingPrice);
    const newPrice = firstAmount(row.newPrice, row.suggestedPrice, row.targetPrice, row.price, row.amount);
    const currencyCode = firstCleanString(row.currencyCode, row.currency);
    const rationale = firstCleanString(row.rationale, row.reason, row.note);
    const warning = firstCleanString(row.warning, row.risk);

    if (!changedTerritoryIds.includes(territoryId)) changedTerritoryIds.push(territoryId);
    currentPricing.push({
      territoryId,
      currentPrice,
      ...(currencyCode ? { currencyCode } : {}),
    });
    localizedSuggestions.push({
      territoryId,
      newPrice,
      newPriceInput: newPrice,
      ...(currencyCode ? { currencyCode } : {}),
      source: firstCleanString(row.source) || 'pricing_parity_cli',
      ...(rationale ? { rationale } : {}),
      ...(warning ? { warning } : {}),
    });
  }

  if (!changedTerritoryIds.length) {
    throw new Error('Pricing parity input must include at least one territoryId, territory, countryCode, or storefront.');
  }

  const baseTerritory = normalizeTerritoryId(input.baseTerritory ?? input.baseCountry ?? input.referenceTerritory);
  const basePrice = firstAmount(input.basePrice, input.referencePrice);
  const scheduledPricing = Array.isArray(input.scheduledPricing) ? input.scheduledPricing : [];
  const manifestOut = firstCleanString(
    options.manifestOut,
    flags.__pricingParityManifestCommand === true ? flags.out : '',
    pricingParityManifestOutputPath(flags),
  );
  const quotedAppId = shellQuote(appId);
  const planPath = firstCleanString(flags.file, '<pricing-parity-plan.json>');
  const quotedPlanPath = shellQuote(planPath);
  const startCommand = [
    'pnpm localizeaso pricing parity',
    '--app-id',
    quotedAppId,
    '--file',
    quotedPlanPath,
    '--manifest-out',
    shellQuote(manifestOut),
    '--bundle-out',
    'pricing-field-bundle.json',
    '--handoff',
    'pricing-field-handoff.json',
  ].join(' ');
  const fieldStartCommand = `pnpm localizeaso fields start --file ${shellQuote(manifestOut)} --bundle-out pricing-field-bundle.json --handoff pricing-field-handoff.json`;
  const pricingStartMcpToolCall = mcpToolCommand('localizeaso_pricing_parity', {
    appId,
    planFile: planPath,
    manifestOut,
    bundleOut: 'pricing-field-bundle.json',
    handoffOut: 'pricing-field-handoff.json',
  });
  const inputReviewConsent = isRecord(input.reviewConsent) ? input.reviewConsent : {};
  const reviewConsentChecklist = normalizeReviewConsentChecklist(inputReviewConsent.checklist);
  const reviewConsentProhibitedActions = cleanStringArray(inputReviewConsent.prohibitedAgentActions);
  const pricingReviewConsent = {
    opensHumanReviewScreen: false,
    consentScreen: firstCleanString(inputReviewConsent.consentScreen) || 'LocalizeASO field review',
    checklist: reviewConsentChecklist.length
      ? reviewConsentChecklist
      : normalizeReviewConsentChecklist([
          {
            label: 'Create a pricing field-review job from this local plan.',
            actor: 'system',
          },
          {
            label: 'Return the pricing review handoff without opening a browser by default.',
            actor: 'system',
          },
          {
            label: 'Open the pricing review screen only with pricing open/popup or --open when the human is signed in and ready.',
            actor: 'human',
          },
          {
            label: 'Review current price, target price, existing schedules, warnings, and agent rationale per territory.',
            actor: 'human',
          },
          {
            label: 'Approve, reject, edit, or request an agent revision in the review UI.',
            actor: 'human',
          },
          {
            label: 'Only after approval may a human export an asc CSV, schedule pricing, use hosted submit, or mark status.',
            actor: 'human',
          },
        ]),
    prohibitedAgentActions: reviewConsentProhibitedActions.length
      ? reviewConsentProhibitedActions
      : [
          'approve_review',
          'reject_review',
          'export_pricing_payload',
          'schedule_pricing',
          'publish_pricing',
          'submit_to_app_store_connect',
          'mark_status_applied_or_submitted',
        ],
    nextHumanAction: {
      id: 'start_pricing_review',
      label: 'Start pricing review and return handoff',
      command: startCommand,
      mcpToolCall: pricingStartMcpToolCall,
      requiresLocalizeAsoPass: true,
      requiredLocalizeAsoCapabilities: ['byoAgent', 'reviewHistory', 'pricingReview'],
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
    },
  };

  return {
    appId,
    surface: 'pricing',
    source: 'agent',
    instructions:
      firstCleanString(flags.instructions, input.instructions) ||
      'Review this pricing parity/PPP plan. Explain territory-level rationale and schedule risk. Do not schedule prices until the human approves the review.',
    context: {
      productKind,
      productId,
      product: {
        ...product,
        id: productId,
        productId,
        kind: productKind,
      },
      generationMode: 'pricing_parity_cli',
      ...(baseTerritory ? { baseTerritory } : {}),
      ...(basePrice !== null ? { basePrice } : {}),
      targetTerritories: changedTerritoryIds,
      changedTerritoryIds,
      currentPricing,
      localizedSuggestions,
      scheduledPricing,
      pricingParitySource: {
        kind: 'localizeaso_pricing_parity_cli',
        humanReviewRequired: true,
        createsReviewManifestOnly: true,
        requiresLocalizeAsoPass: false,
        requiredLocalizeAsoCapabilities: [],
        requiresHostedAi: false,
        requiresAppStoreConnectCredentials: false,
        mutatesReviewData: false,
        mutatesPersistentKeywordInventory: false,
        mutatesAppStoreConnect: false,
        localFileWriteOnly: true,
        protectedActionsAllowed: false,
        startReviewCommand: startCommand,
        fieldStartCommand,
        reviewConsent: pricingReviewConsent,
        nextHumanAction: {
          ...pricingReviewConsent.nextHumanAction,
          reviewSurface: 'pricing',
        },
        monetizationBoundary: {
          freeLocal: true,
          freeLocalIncludes: [
            'pricing-parity JSON normalization',
            'local pricing field-review manifest export',
            'handoff commands for the human review screen',
          ],
          paidReviewStartRequires: 'Agent Pass or hosted LocalizeASO pass with pricing review access',
          hostedAiRequired: false,
          hostedSubmitRequiredForLocalStep: false,
          recommendedPaidPlan: 'agent',
        },
        handoffSafety: {
          agentSafe: true,
          humanOnly: false,
          readOnly: true,
          localFileWriteOnly: true,
          pricingParityManifestOnly: true,
          humanReviewRequired: true,
          requiresLocalizeAsoPass: false,
          requiredLocalizeAsoCapabilities: [],
          requiresHostedAi: false,
          requiresAppStoreConnectCredentials: false,
          mutatesReviewData: false,
          mutatesPersistentKeywordInventory: false,
          mutatesAppStoreConnect: false,
          protectedActionsAllowed: false,
          approvalAllowed: false,
          rejectionAllowed: false,
          metadataApplyAllowed: false,
          keywordApplyAllowed: false,
          pricingExportAllowed: false,
          pricingScheduleAllowed: false,
          pricingPublishAllowed: false,
          appStoreUploadAllowed: false,
          appStoreSubmitAllowed: false,
          appStorePublishAllowed: false,
          statusUpdateAllowed: false,
          postApprovalActionAllowed: false,
          phase: 'pricing_parity_manifest_export',
          protectedActions: [
            'human_approval',
            'review_rejection',
            'pricing_export',
            'pricing_schedule',
            'pricing_publish',
            'app_store_submit',
            'status_update',
          ],
          agentInstruction:
            'This free/local step only writes a pricing review manifest. Start a LocalizeASO review job, inspect the returned handoff, and open the human review screen explicitly before any proposal approval, pricing export, schedule, hosted submit, or status update.',
        },
        notes: [
          `Run ${startCommand} for a one-step review start and handoff, or run ${fieldStartCommand} after exporting this manifest. Add --open only when the human is ready for browser navigation.`,
          'The approved pricing payload can later export an asc CSV or use hosted submit convenience, depending on the active pass.',
          'This manifest generation does not approve, export, schedule, publish, submit, or mark status.',
        ],
      },
    },
  };
}

function pricingParityStartBody(manifest) {
  if (!isRecord(manifest)) return manifest;
  const context = isRecord(manifest.context) ? manifest.context : {};
  const source = isRecord(context.pricingParitySource) ? context.pricingParitySource : {};
  return {
    ...manifest,
    context: {
      ...context,
      pricingParitySource: {
        ...source,
        createsReviewManifestOnly: false,
        createsReviewJob: true,
        notes: [
          'This pricing parity review start created a pricing field-review job and exported the human review handoff.',
          'The job still requires an agent proposal, human decisions, readiness checks, and human approval before any pricing payload export or schedule.',
          'This start command does not approve, export, schedule, publish, submit, or mark status.',
        ],
      },
    },
  };
}

function collectKeywordContext(context, fallbackSource = 'localizeaso') {
  const keywords = {};
  const rows = [];
  const warnings = [];
  const sources = new Set();

  function addKeyword(localeValue, keywordValue, metadata = {}) {
    const locale = asCleanString(localeValue);
    const keyword = asCleanString(keywordValue);
    if (!locale || !keyword) return;
    keywords[locale] ??= [];
    if (!keywords[locale].includes(keyword)) {
      keywords[locale].push(keyword);
    }
    const source = asCleanString(metadata.source) || fallbackSource;
    sources.add(source);
    rows.push({
      locale,
      keyword,
      ...(metadata.keywordEnglish !== undefined ? { keywordEnglish: metadata.keywordEnglish } : {}),
      ...(metadata.popularity !== undefined ? { popularity: metadata.popularity } : {}),
      ...(metadata.difficulty !== undefined ? { difficulty: metadata.difficulty } : {}),
      ...(metadata.isPreferred !== undefined ? { isPreferred: Boolean(metadata.isPreferred) } : {}),
      source,
    });
  }

  function visit(value) {
    if (!isRecord(value)) return;

    if (Array.isArray(value.warnings)) {
      for (const warning of value.warnings) {
        addUniqueString(warnings, keywordContextWarningText(warning));
      }
    }

    if (Array.isArray(value.rows)) {
      for (const row of value.rows) {
        if (!isRecord(row)) continue;
        addKeyword(row.locale, row.keyword, row);
      }
    }

    if (isRecord(value.keywords)) {
      for (const [locale, localeKeywords] of Object.entries(value.keywords)) {
        if (!Array.isArray(localeKeywords)) continue;
        for (const keyword of localeKeywords) {
          addKeyword(locale, keyword, { source: Array.isArray(value.sources) ? value.sources[0] : fallbackSource });
        }
      }
    }

    if (Array.isArray(value.currentKeywords)) {
      for (const row of value.currentKeywords) {
        if (!isRecord(row)) continue;
        addKeyword(row.locale, row.keyword, row);
      }
    }

    if (isRecord(value.keywordContext)) {
      visit(value.keywordContext);
    }
  }

  visit(context);

  return {
    sources: sources.size ? Array.from(sources) : [fallbackSource],
    keywords,
    rows,
    warnings,
  };
}

function keywordContextWarningText(value) {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';

  const message = asCleanString(value.message);
  if (message) return message;

  const kind = asCleanString(value.kind) || 'keyword_context_warning';
  const details = [
    value.rowNumber !== undefined ? `row ${value.rowNumber}` : '',
    asCleanString(value.localeRaw) ? `locale "${asCleanString(value.localeRaw)}"` : '',
    asCleanString(value.keyword) ? `keyword "${asCleanString(value.keyword)}"` : '',
  ].filter(Boolean);
  return details.length ? `${kind}: ${details.join(', ')}` : kind;
}

function mcpToolCommand(toolName, payload) {
  return `${toolName} ${JSON.stringify(payload)}`;
}

function localeKeywordSummary(locale, keywordContext) {
  const normalizedLocale = normalizeReviewLocale(locale);
  const matchingLocale = Object.keys(keywordContext.keywords).find(
    (key) => normalizeReviewLocale(key) === normalizedLocale,
  );
  const existingKeywords = matchingLocale ? keywordContext.keywords[matchingLocale] ?? [] : [];
  return {
    locale,
    existingKeywords,
    keywordCount: existingKeywords.length,
    needsKeywordResearch: existingKeywords.length === 0,
  };
}

function fieldLocaleSummaryFromContext(context, locale) {
  if (!Array.isArray(context?.localeSummaries)) return null;
  const normalizedLocale = normalizeReviewLocale(locale);
  return context.localeSummaries.find((summary) => (
    isRecord(summary) && normalizeReviewLocale(summary.locale) === normalizedLocale
  )) ?? null;
}

function screenshotSeedTextsForLocale(manifest) {
  const seedTexts = [];
  for (const frame of Array.isArray(manifest?.frames) ? manifest.frames : []) {
    for (const layer of Array.isArray(frame?.textLayers) ? frame.textLayers : []) {
      addUniqueString(seedTexts, layer?.text);
    }
  }
  return seedTexts;
}

function keywordAutomationMcpPrefix(kind = 'screenshot', surface = '') {
  if (kind === 'screenshot') return 'localizeaso_screenshot';
  const normalizedSurface = asCleanString(surface);
  if (normalizedSurface === 'metadata') return 'localizeaso_metadata';
  if (normalizedSurface === 'keywords') return 'localizeaso_keywords';
  if (normalizedSurface === 'pricing') return 'localizeaso_pricing';
  return 'localizeaso_field';
}

function keywordAutomationCliSurface(kind = 'screenshot', surface = '') {
  if (kind === 'screenshot') return 'screenshots';
  const normalizedSurface = asCleanString(surface);
  if (normalizedSurface === 'metadata') return 'metadata';
  if (normalizedSurface === 'keywords') return 'keywords';
  if (normalizedSurface === 'pricing') return 'pricing';
  return 'fields';
}

function keywordAutomationCliJobCommand(kind, surface, subcommand, jobId, trailingArgs = '') {
  const cliSurface = keywordAutomationCliSurface(kind, surface);
  const suffix = trailingArgs ? ` ${trailingArgs}` : '';
  return `pnpm localizeaso ${cliSurface} ${subcommand} ${shellQuote(jobId)}${suffix}`;
}

function keywordAutomationOptions(jobId, commands, kind = 'screenshot', surface = '') {
  if (!jobId) return [];
  const mcpPrefix = keywordAutomationMcpPrefix(kind, surface);
  const agentSafeKeywordOption = {
    safeForAgent: true,
    humanOnly: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    mutatesReviewData: true,
    mutatesAppStoreConnect: false,
  };
  const readOnlyKeywordOption = {
    ...agentSafeKeywordOption,
    mutatesReviewData: false,
  };
  return [
    {
      kind: 'astro_mcp_export',
      source: 'astro-mcp',
      output: 'keyword-context.json',
      exportCommand: `pnpm localizeaso astro keywords --app ${shellQuote(commands.appId)} --out keyword-context.json`,
      attachCommand: commands.fromJson,
      mcpToolCall: mcpToolCommand('localizeaso_astro_keywords', {
        appId: commands.appId,
        keywordContextOut: 'keyword-context.json',
        noAscAllowlist: true,
      }),
      note:
        'Use when Astro MCP is available through the local MCP bridge. It exports provider-neutral keyword-context.json with fast keyword-context defaults; attach it before proposal generation.',
      ...readOnlyKeywordOption,
    },
    {
      kind: 'astro_csv',
      source: 'astro',
      output: 'astro-keywords.csv or discovered keyword CSV',
      attachCommand: commands.fromCsv,
      mcpToolCall: mcpToolCommand(`${mcpPrefix}_keyword_context_from_csv`, {
        jobId,
        csvPath: 'optional-auto',
        astroDir: '.',
        out: 'keyword-context-from-csv-result.json',
      }),
      note: 'Use when Astro or an Astro MCP workflow exports keyword rows as CSV.',
      ...agentSafeKeywordOption,
    },
    {
      kind: 'mcp_keyword_agent',
      source: 'mcp-keyword-agent',
      output: 'keyword-context.json',
      attachCommand: commands.fromJson,
      mcpToolCall: mcpToolCommand(`${mcpPrefix}_keyword_context`, {
        jobId,
        contextFile: 'keyword-context.json',
        out: 'keyword-context-result.json',
      }),
      note: 'Use when a Codex/MCP keyword agent returns provider-neutral keyword context JSON.',
      ...agentSafeKeywordOption,
    },
    {
      kind: 'astro_mcp_prompt',
      source: 'astro-mcp-or-codex',
      output: 'keyword-agent-prompt.md -> keyword-context.json',
      attachCommand: commands.fromJson,
      mcpToolCall: mcpToolCommand(`${mcpPrefix}_keyword_prompt`, {
        jobId,
        out: 'keyword-agent-prompt.md',
      }),
      note: commands.prompt
        ? `Export the research prompt with ${commands.prompt}, let Astro MCP/Codex write keyword-context.json, then attach the JSON.`
        : 'Export the keyword research prompt, let Astro MCP/Codex write keyword-context.json, then attach the JSON.',
      ...readOnlyKeywordOption,
    },
    {
      kind: 'manual_json',
      source: 'manual-research',
      output: 'keyword-context.json',
      attachCommand: commands.fromJson,
      mcpToolCall: mcpToolCommand(`${mcpPrefix}_keyword_context`, {
        jobId,
        contextFile: 'keyword-context.json',
        out: 'keyword-context-result.json',
      }),
      note: 'Use when the human or another research tool writes the provider-neutral JSON shape directly.',
      ...agentSafeKeywordOption,
    },
  ];
}

function keywordResearchStrategyLines(kind = 'screenshot') {
  return [
    kind === 'field'
      ? 'Use existing LocalizeASO ASO keywords from the field bundle first; run field-sync-keywords when the job was created before recent keyword imports.'
      : 'Use existing LocalizeASO ASO keywords or manifest keywords from the screenshot bundle first.',
    'If Astro exported a CSV, import it into the app-level LocalizeASO ASO keyword inventory and attach the same CSV or converted keyword context to this review job.',
    'If no CSV is available or target locales are still missing, export the keyword prompt and let Astro MCP/Codex write provider-neutral keyword-context.json.',
    'BYO keyword research, Astro CSV import, keyword-context attach, and proposal generation do not require LocalizeASO App Store Connect credentials; ASC access is only needed for human-run hosted sync/upload/submit convenience or local asc post-approval handoffs.',
    'Persisting Astro CSV rows into the LocalizeASO ASO keyword inventory still requires an active LocalizeASO pass with BYO agent/review history access; it does not use hosted AI translation unless explicitly requested through the backend UI.',
    'Fetch a fresh bundle after every import, sync, or attach before generating the final proposal.',
  ];
}

function buildKeywordResearchHandoffSafety(kind, phase = 'keyword_research') {
  return {
    agentSafe: true,
    humanOnly: false,
    readOnly: true,
    phase,
    keywordResearchOnly: true,
    preProposalOnly: true,
    runbookOnly: phase === 'keyword_research_automation',
    mutatesReviewData: false,
    mutatesPersistentKeywordInventory: false,
    mutatesAppStoreConnect: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    requiresHumanApprovalBeforeProtectedActions: true,
    postApprovalPathsHumanOnly: true,
    protectedActionsAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
    figmaApplyAllowed: false,
    metadataApplyAllowed: false,
    metadataExportAllowed: false,
    metadataPublishAllowed: false,
    keywordApplyAllowed: false,
    pricingExportAllowed: false,
    pricingScheduleAllowed: false,
    pricingPublishAllowed: false,
    screenshotUploadAllowed: false,
    screenshotPublishAllowed: false,
    appStoreUploadAllowed: false,
    appStorePublishAllowed: false,
    appStoreSubmitAllowed: false,
    statusUpdateAllowed: false,
    protectedActions: [
      'human_approval',
      'review_rejection',
      'figma_apply',
      'metadata_apply',
      'metadata_export',
      'metadata_publish',
      'keyword_apply',
      'pricing_export',
      'pricing_schedule',
      'pricing_publish',
      'screenshot_upload',
      'screenshot_publish',
      'app_store_upload',
      'app_store_submit',
      'app_store_publish',
      'status_update',
    ],
    agentInstruction:
      kind === 'field'
        ? 'Use keyword research only to prepare field-review proposal signals. Do not approve, apply metadata/keywords/pricing, schedule prices, submit, or mark status.'
        : 'Use keyword research only to prepare screenshot-review proposal signals. Do not approve, apply Figma changes, upload screenshots, submit, or mark status.',
  };
}

function buildScreenshotKeywordBrief(bundle) {
  const job = bundle?.job ?? {};
  const manifest = job.manifest ?? {};
  const keywordContext = collectKeywordContext(
    {
      keywordContext: job.keywordContext,
      keywords: manifest.keywords,
    },
    'localizeaso-screenshot-review',
  );
  const targetLocales = Array.isArray(manifest.targetLocales)
    ? manifest.targetLocales.map(asCleanString).filter(Boolean)
    : Object.keys(keywordContext.keywords);
  const seedTexts = screenshotSeedTextsForLocale(manifest);
  const locales = targetLocales.map((locale) => ({
    ...localeKeywordSummary(locale, keywordContext),
    seedTexts,
    frameCount: Array.isArray(manifest.frames) ? manifest.frames.length : 0,
  }));
  const attachCommands = job.id
    ? {
        appId: job.appId,
        fromJson: keywordAutomationCliJobCommand(
          'screenshot',
          'screenshots',
          'context',
          job.id,
          '--file keyword-context.json',
        ),
        fromCsv: keywordAutomationCliJobCommand(
          'screenshot',
          'screenshots',
          'context-csv',
          job.id,
          '--file optional-auto --astro-dir .',
        ),
        prompt: keywordAutomationCliJobCommand(
          'screenshot',
          'screenshots',
          'keyword-prompt',
          job.id,
          '--out keyword-agent-prompt.md',
        ),
      }
    : null;

  return {
    kind: 'localizeaso_keyword_research_brief',
    surface: 'screenshots',
    monetizationBoundary: buildMonetizationBoundary('screenshots'),
    handoffSafety: buildKeywordResearchHandoffSafety('screenshot', 'keyword_research_brief'),
    job: {
      id: job.id,
      appId: job.appId,
      appName: job.appName,
      status: job.status,
      instructions: job.instructions,
    },
    sources: keywordContext.sources,
    keywordContextWarnings: keywordContext.warnings,
    locales,
    missingKeywordLocales: locales
      .filter((locale) => locale.needsKeywordResearch)
      .map((locale) => locale.locale),
    keywordContextShape: {
      sources: ['astro'],
      keywords: Object.fromEntries(targetLocales.map((locale) => [locale, []])),
      rows: [],
    },
    attachCommands: attachCommands ? [attachCommands.fromJson, attachCommands.fromCsv] : [],
    automationOptions: keywordAutomationOptions(job.id, attachCommands ?? {}, 'screenshot'),
    instructions: [
      'Use this brief to run Astro/MCP/keyword-agent research before generating the screenshot proposal.',
      'Return provider-neutral keyword-context JSON, then attach it to the job before proposal generation.',
      'Do not approve, apply Figma changes, or upload/submit to App Store Connect from keyword research.',
    ],
  };
}

function collectFieldSeedTexts(context, locale) {
  const seedTexts = [];
  const normalizedLocale = normalizeReviewLocale(locale);
  const localeKey = isRecord(context?.locales)
    ? Object.keys(context.locales).find((key) => normalizeReviewLocale(key) === normalizedLocale)
    : '';
  const localeContext = localeKey ? context.locales[localeKey] : null;
  const fields = isRecord(localeContext?.fields) ? localeContext.fields : null;
  if (fields) {
    for (const value of Object.values(fields)) {
      addUniqueString(seedTexts, value);
    }
  }
  return seedTexts;
}

function collectScreenshotContextFrames(context, locale) {
  const screenshotContext = isRecord(context?.screenshotContext) ? context.screenshotContext : null;
  if (!screenshotContext) return [];

  const frames = [];
  const normalizedLocale = normalizeReviewLocale(locale);
  function addFrame(frame, inherited = {}) {
    if (!isRecord(frame)) return;
    const frameLocale = asCleanString(frame.locale) || asCleanString(inherited.locale);
    const normalizedFrameLocale = normalizeReviewLocale(frameLocale);
    if (normalizedLocale && normalizedFrameLocale && normalizedFrameLocale !== normalizedLocale) return;
    frames.push({
      ...inherited,
      ...frame,
      ...(frameLocale ? { locale: frameLocale } : {}),
    });
  }

  if (Array.isArray(screenshotContext.frames)) {
    for (const frame of screenshotContext.frames) {
      addFrame(frame);
    }
  }

  if (Array.isArray(screenshotContext.jobs)) {
    for (const job of screenshotContext.jobs) {
      if (!isRecord(job)) continue;
      const inherited = {
        screenshotJobId: asCleanString(job.id) || asCleanString(job.screenshotJobId) || undefined,
        locale: asCleanString(job.locale) || undefined,
      };
      if (Array.isArray(job.frames)) {
        for (const frame of job.frames) {
          addFrame(frame, inherited);
        }
      }
    }
  }

  return frames;
}

function collectScreenshotContextSeedTexts(context, locale) {
  const seedTexts = [];
  for (const frame of collectScreenshotContextFrames(context, locale)) {
    for (const text of cleanStringArray(frame.sourceTexts)) {
      addUniqueString(seedTexts, text);
    }

    const layers = Array.isArray(frame.textLayers)
      ? frame.textLayers
      : Array.isArray(frame.layers)
        ? frame.layers
        : [];
    for (const layer of layers) {
      if (!isRecord(layer)) continue;
      addUniqueString(seedTexts, layer.text);
      addUniqueString(seedTexts, layer.sourceText);
      addUniqueString(seedTexts, layer.name);
    }
  }
  return seedTexts;
}

function localesFromFieldContext(context, keywordContext) {
  const locales = [];
  for (const locale of cleanStringArray(context?.targetLocales)) {
    addReviewLocale(locales, locale);
  }
  for (const locale of cleanStringArray(context?.missingKeywordLocales)) {
    addReviewLocale(locales, locale);
  }
  if (isRecord(context?.locales)) {
    for (const locale of Object.keys(context.locales)) {
      addReviewLocale(locales, locale);
    }
  }
  if (Array.isArray(context?.currentKeywords)) {
    for (const row of context.currentKeywords) {
      if (isRecord(row)) addReviewLocale(locales, row.locale);
    }
  }
  for (const locale of Object.keys(keywordContext.keywords)) {
    addReviewLocale(locales, locale);
  }
  return locales;
}

function fieldKeywordResearchPricingError() {
  return new Error(
    'Pricing field review jobs do not use keyword research briefs, prompts, automation, or ASO keyword maps. ' +
      'Use pnpm review:agent field-pricing-brief <jobId> --out pricing-brief.json instead.',
  );
}

function assertFieldKeywordResearchSurface(input) {
  const surface = asCleanString(input?.surface) || asCleanString(input?.job?.surface);
  if (surface === 'pricing') {
    throw fieldKeywordResearchPricingError();
  }
}

function buildFieldKeywordBrief(bundle) {
  assertFieldKeywordResearchSurface(bundle);
  const context = isRecord(bundle?.context) ? bundle.context : {};
  const keywordContext = collectKeywordContext(context, 'localizeaso-field-review');
  const targetLocales = localesFromFieldContext(context, keywordContext);
  const locales = targetLocales.map((locale) => {
    const contextSummary = fieldLocaleSummaryFromContext(context, locale);
    const seedTexts = collectFieldSeedTexts(context, locale);
    const screenshotSeedTexts = collectScreenshotContextSeedTexts(context, locale);
    const screenshotFrameCount = collectScreenshotContextFrames(context, locale).length;
    return {
      ...localeKeywordSummary(locale, keywordContext),
      seedTexts,
      ...(screenshotSeedTexts.length
        ? {
            screenshotSeedTexts,
            screenshotFrameCount,
          }
        : {}),
      ...(contextSummary
        ? {
            reviewSummary: {
              keywordCount: contextSummary.keywordCount,
              preferredCount: contextSummary.preferredCount,
              averagePopularity: contextSummary.averagePopularity,
              averageDifficulty: contextSummary.averageDifficulty,
              preferredKeywords: cleanStringArray(contextSummary.preferredKeywords),
              lowPopularityKeywords: cleanStringArray(contextSummary.lowPopularityKeywords),
              highDifficultyKeywords: cleanStringArray(contextSummary.highDifficultyKeywords),
              opportunityKeywords: Array.isArray(contextSummary.opportunityKeywords)
                ? contextSummary.opportunityKeywords
                : [],
              riskKeywords: Array.isArray(contextSummary.riskKeywords)
                ? contextSummary.riskKeywords
                : [],
            },
          }
        : {}),
    };
  });
  const attachCommands = bundle?.job?.id
    ? {
        appId: bundle?.job?.appId ?? bundle?.appId,
        fromJson: keywordAutomationCliJobCommand(
          'field',
          bundle?.surface,
          'context',
          bundle.job.id,
          '--file keyword-context.json',
        ),
        fromCsv: keywordAutomationCliJobCommand(
          'field',
          bundle?.surface,
          'context-csv',
          bundle.job.id,
          '--file optional-auto --astro-dir .',
        ),
        prompt: keywordAutomationCliJobCommand(
          'field',
          bundle?.surface,
          'keyword-prompt',
          bundle.job.id,
          '--out keyword-agent-prompt.md',
        ),
      }
    : null;

  return {
    kind: 'localizeaso_keyword_research_brief',
    surface: bundle?.surface ?? bundle?.job?.surface ?? 'metadata',
    monetizationBoundary: monetizationBoundaryForBundle(bundle, 'field'),
    handoffSafety: buildKeywordResearchHandoffSafety('field', 'keyword_research_brief'),
    job: {
      id: bundle?.job?.id,
      appId: bundle?.job?.appId ?? bundle?.appId,
      status: bundle?.job?.status,
      instructions: bundle?.job?.instructions,
    },
    app: isRecord(context.app) ? context.app : undefined,
    optimizationHints: isRecord(context.optimizationHints) ? context.optimizationHints : undefined,
    agentGoals: cleanStringArray(context.agentGoals),
    reviewContract: isRecord(context.reviewContract) ? context.reviewContract : undefined,
    reviewConstraints: isRecord(bundle?.reviewConstraints) ? bundle.reviewConstraints : undefined,
    sources: keywordContext.sources,
    keywordContextWarnings: keywordContext.warnings,
    locales,
    missingKeywordLocales: Array.from(
      new Set([
        ...cleanStringArray(context.missingKeywordLocales),
        ...locales.filter((locale) => locale.needsKeywordResearch).map((locale) => locale.locale),
      ]),
    ),
    keywordContextShape: {
      sources: ['astro'],
      keywords: Object.fromEntries(targetLocales.map((locale) => [locale, []])),
      rows: [],
    },
    attachCommands: attachCommands ? [attachCommands.fromJson, attachCommands.fromCsv] : [],
    automationOptions: keywordAutomationOptions(bundle?.job?.id, attachCommands ?? {}, 'field', bundle?.surface),
    instructions: [
      'Use this brief to run Astro/MCP/keyword-agent research before generating the field proposal.',
      'Use screenshotSeedTexts as read-only App Store screenshot copy signals when present; check keyword-to-creative alignment, but do not propose screenshot or Figma mutations from keyword research.',
      'Return provider-neutral keyword-context JSON, then attach it to the job before proposal generation.',
      'Do not approve, apply metadata/keywords/pricing, or upload/submit to App Store Connect from keyword research.',
    ],
  };
}

function buildFieldPricingBrief(bundle) {
  const context = isRecord(bundle?.context) ? bundle.context : {};
  const product = isRecord(context.product) ? context.product : {};
  const entityId =
    asCleanString(context.productId) ||
    asCleanString(product.id) ||
    asCleanString(product.productId) ||
    asCleanString(bundle?.job?.entityId);
  const currentPricing = Array.isArray(context.currentPricing) ? context.currentPricing : [];
  const scheduledPricing = Array.isArray(context.scheduledPricing) ? context.scheduledPricing : [];
  const localizedSuggestions = Array.isArray(context.localizedSuggestions) ? context.localizedSuggestions : [];
  const draftPrices = isRecord(context.draftPrices) ? context.draftPrices : {};
  const changedTerritoryIds = cleanStringArray(context.changedTerritoryIds);

  const territories = new Map();
  function upsert(row, patch) {
    if (!isRecord(row)) return;
    const territoryId = asCleanString(row.territoryId);
    if (!territoryId) return;
    territories.set(territoryId, {
      territoryId,
      ...(territories.get(territoryId) ?? {}),
      ...patch,
    });
  }

  for (const row of currentPricing) {
    upsert(row, {
      countryCode: asCleanString(row.countryCode) || undefined,
      countryName: asCleanString(row.countryName) || undefined,
      currency: asCleanString(row.currency) || undefined,
      currentPrice: finiteNumber(row.currentPrice),
      currentPricePointId: asCleanString(row.currentPricePointId) || undefined,
    });
  }

  for (const row of scheduledPricing) {
    upsert(row, {
      countryCode: asCleanString(row.countryCode) || undefined,
      countryName: asCleanString(row.countryName) || undefined,
      currency: asCleanString(row.currency) || undefined,
      scheduledPrice: finiteNumber(row.scheduledPrice),
      scheduledStartDate: asCleanString(row.startDate) || asCleanString(row.scheduledStartDate) || undefined,
      scheduledPricePointId: asCleanString(row.scheduledPricePointId) || undefined,
    });
  }

  for (const row of localizedSuggestions) {
    upsert(row, {
      countryCode: asCleanString(row.countryCode) || undefined,
      countryName: asCleanString(row.countryName) || undefined,
      currency: asCleanString(row.currency) || undefined,
      suggestedPrice: parseAmount(row.newPriceInput) ?? finiteNumber(row.newPrice),
      warning: asCleanString(row.warning) || undefined,
      source: 'localized_suggestion',
    });
  }

  for (const [territoryId, value] of Object.entries(draftPrices)) {
    const parsed = parseAmount(value);
    if (parsed === null) continue;
    territories.set(territoryId, {
      territoryId,
      ...(territories.get(territoryId) ?? {}),
      draftPrice: parsed,
    });
  }

  const territoryRows = Array.from(territories.values()).map((row) => {
    if (row.scheduledPrice === undefined && !row.scheduledStartDate) return row;
    const scheduleDetails = [
      row.scheduledPrice !== undefined ? `scheduled price ${row.scheduledPrice}` : '',
      row.scheduledStartDate ? `start date ${row.scheduledStartDate}` : '',
    ].filter(Boolean);
    return {
      ...row,
      scheduleGuard: [
        `Pricing schedule guard: territory ${row.territoryId}`,
        entityId ? `, entity ${entityId}` : '',
        ' is review context only until human approval; inspect existing schedules',
        scheduleDetails.length ? ` (${scheduleDetails.join(', ')})` : '',
        ' and choose a concrete start date before any human-run LocalizeASO or asc schedule.',
      ].join(''),
    };
  }).sort((a, b) => {
    const aName = a.countryName || a.countryCode || a.territoryId;
    const bName = b.countryName || b.countryCode || b.territoryId;
    return aName.localeCompare(bName);
  });
  const scheduledTerritoryIds = territoryRows
    .filter((row) => row.scheduledPrice !== undefined || row.scheduledStartDate)
    .map((row) => row.territoryId);
  const warningTerritoryIds = territoryRows
    .filter((row) => asCleanString(row.warning))
    .map((row) => row.territoryId);
  const scheduleGuards = territoryRows
    .filter((row) => asCleanString(row.scheduleGuard))
    .map((row) => ({
      territoryId: row.territoryId,
      guard: row.scheduleGuard,
    }));
  const proposalDraftTargets = buildPricingFieldTemplateChanges(context).map((change) => ({
    targetRef: fieldProposalTargetRef(change.target),
    target: change.target,
    currentValue: change.currentValue,
    proposedValue: change.proposedValue,
    assignedKeywords: change.assignedKeywords,
    unassignedKeywords: change.unassignedKeywords,
    warnings: change.warnings,
    rationale: change.rationale,
  }));

  return {
    kind: 'localizeaso_pricing_review_brief',
    surface: bundle?.surface ?? bundle?.job?.surface ?? 'pricing',
    job: {
      id: bundle?.job?.id,
      appId: bundle?.job?.appId ?? bundle?.appId,
      status: bundle?.job?.status,
      instructions: bundle?.job?.instructions,
    },
    product: {
      productKind: asCleanString(context.productKind) || bundle?.surface,
      productId: asCleanString(context.productId) || undefined,
      name: asCleanString(product.name) || undefined,
      storeProductId: asCleanString(product.productId) || undefined,
      state: asCleanString(product.state) || undefined,
    },
    generationMode: asCleanString(context.generationMode) || undefined,
    summary: {
      territoryCount: territoryRows.length,
      currentPriceCount: currentPricing.length,
      scheduledPriceCount: scheduledPricing.length,
      localizedSuggestionCount: localizedSuggestions.length,
      changedTerritoryCount: changedTerritoryIds.length,
      warningCount: territoryRows.filter((row) => row.warning).length,
    },
    riskSummary: {
      scheduledTerritoryIds,
      warningTerritoryIds,
      upcomingPriceChangeCount: Array.isArray(context.upcomingPriceChanges) ? context.upcomingPriceChanges.length : 0,
      scheduleGuards,
    },
    upcomingPriceChanges: Array.isArray(context.upcomingPriceChanges) ? context.upcomingPriceChanges : [],
    changedTerritoryIds,
    territories: territoryRows,
    proposalDraftTargets,
    scheduleGuards,
    reviewContract: isRecord(context.reviewContract) ? context.reviewContract : undefined,
    reviewSignalContract: {
      requiredPerChange: [
        'currentValue',
        'proposedValue',
        'assignedKeywords',
        'unassignedKeywords',
        'warnings',
        'rationale',
      ],
      requiredPerChangeLabels: [
        'current value',
        'agent proposal pricing value',
        'keyword mapping n/a',
        'warnings',
        'rationale',
      ],
      emptySignalsMeanConsidered: true,
      currentValueSource: 'Use territories[].currentPrice for the matching territoryId; do not invent currentValue.',
      keywordGuidance:
        'Pricing changes normally use empty assignedKeywords and unassignedKeywords arrays; include them explicitly so the reviewer sees keyword mapping was considered not applicable.',
      warningGuidance: [
        'Add a warning when the territory already has scheduledPrice or scheduledStartDate.',
        'Add a warning when territories[].warning is present.',
        'Add a warning when a proposed price differs materially from currentPrice or draftPrice.',
      ],
      rationaleGuidance:
        'Explain why the proposed price is appropriate and how scheduled prices, localized suggestions, or existing warnings were handled.',
      postApprovalBoundary:
        'The proposal is review data only. Existing schedules are context only; scheduling still requires human approval, a concrete start date chosen by the human, and a separate post-approval pricing handoff.',
      proposalDraftTargets:
        'Use proposalDraftTargets as a starting point for payload.changes: preserve targetRef/target identity, verify currentValue against territories[].currentPrice, replace proposedValue only when justified, and keep explicit empty keyword arrays for pricing.',
    },
    proposalShape: bundle?.proposalShape,
    commands: bundle?.job?.id
      ? (() => {
          const applyPlanCommand =
            `pnpm review:agent field-apply-plan ${shellQuote(bundle.job.id)}${shellOptionalFlag('--app-id', bundle.job.appId)} --out field-apply-plan.json`;
          return {
            fetchBundle: `pnpm localizeaso pricing bundle ${shellQuote(bundle.job.id)} --out field-bundle.json --handoff field-handoff.json`,
            submitProposal: `pnpm localizeaso pricing submit ${shellQuote(bundle.job.id)} --file field-proposal.json`,
            readiness: `pnpm localizeaso pricing readiness ${shellQuote(bundle.job.id)} --proposal-id PROPOSAL_ID`,
            applyPlan: applyPlanCommand,
            approvedPayload: applyPlanCommand,
          };
        })()
      : {},
    postApprovalHandoff: bundle?.job?.id
      ? (() => {
          const applyPlanCommand =
            `pnpm review:agent field-apply-plan ${shellQuote(bundle.job.id)}${shellOptionalFlag('--app-id', bundle.job.appId)} --out field-apply-plan.json`;
          return {
            humanOnly: true,
            applyPlanFirst: true,
            applyPlanCommand,
            applyPlanFingerprintFlag: '--expected-apply-plan-fingerprint',
            pricingPayloadCommandSource: 'field-apply-plan.commands.pricingPayload',
            pricingScheduleCommandSource: 'field-apply-plan.commands.submitPricing',
            statusCommandSource: 'field-apply-plan.localizeAsoStatusCommands',
            agentInstruction:
              'After human approval, export field-apply-plan and use the fingerprint-protected pricing payload/schedule/status commands returned inside that apply plan. Do not run these from an agent proposal pass.',
          };
        })()
      : undefined,
    instructions: [
      'Use this brief to generate a pricing field-review proposal only.',
      'Preserve target.surface="pricing", target.entityId, and target.territoryId for every proposed territory price change.',
      'Treat scheduledPrice/scheduledStartDate and warnings as review risks that should be surfaced to the human.',
      'For every pricing change, include assignedKeywords, unassignedKeywords, warnings, and rationale; use empty keyword arrays when ASO keyword mapping is not applicable.',
      'After human approval, export field-apply-plan first and copy its applyPlanFingerprint into any human-run pricing payload, schedule, or status command.',
      'Do not approve, export pricing payloads, schedule prices, or upload/submit to App Store Connect from proposal generation.',
    ],
  };
}

function formatList(values, fallback = 'none') {
  const cleaned = cleanStringArray(values);
  return cleaned.length ? cleaned.join(', ') : fallback;
}

function compactKeywordLocale(locale) {
  const lines = [
    `- ${locale.locale}`,
    `  - Existing keywords: ${formatList(locale.existingKeywords)}`,
    `  - Needs research: ${locale.needsKeywordResearch === true ? 'yes' : 'no'}`,
  ];
  if (Array.isArray(locale.seedTexts) && locale.seedTexts.length) {
    lines.push(`  - Seed text: ${locale.seedTexts.slice(0, 8).join(' | ')}`);
  }
  if (Array.isArray(locale.screenshotSeedTexts) && locale.screenshotSeedTexts.length) {
    lines.push(`  - Screenshot seed text: ${locale.screenshotSeedTexts.slice(0, 8).join(' | ')}`);
  }
  const reviewSummary = isRecord(locale.reviewSummary) ? locale.reviewSummary : null;
  if (reviewSummary) {
    lines.push(`  - Preferred: ${formatList(reviewSummary.preferredKeywords)}`);
    lines.push(
      `  - Opportunity keywords: ${formatList(
        Array.isArray(reviewSummary.opportunityKeywords)
          ? reviewSummary.opportunityKeywords.map((row) => (isRecord(row) ? row.keyword : row))
          : [],
      )}`,
    );
    lines.push(
      `  - Risk keywords: ${formatList(
        Array.isArray(reviewSummary.riskKeywords)
          ? reviewSummary.riskKeywords.map((row) => (isRecord(row) ? row.keyword : row))
          : [],
      )}`,
    );
  }
  return lines.join('\n');
}

function compactKeywordAutomationOption(option) {
  if (!isRecord(option)) return '';
  const kind = asCleanString(option.kind) || 'keyword_research';
  const source = asCleanString(option.source) || 'unknown-source';
  const output = asCleanString(option.output) || 'keyword-context.json';
  const attachCommand = asCleanString(option.attachCommand);
  const mcpToolCall = asCleanString(option.mcpToolCall);
  const note = asCleanString(option.note);
  const safety = [
    option.safeForAgent === true ? 'agent-safe' : '',
    option.humanOnly === true ? 'human-only' : option.humanOnly === false ? 'not human-only' : '',
    option.requiresHostedAi === false
      ? 'no hosted AI'
      : option.requiresHostedAi === true
        ? 'requires hosted AI'
        : '',
    option.requiresAppStoreConnectCredentials === false
      ? 'no LocalizeASO ASC credentials'
      : option.requiresAppStoreConnectCredentials === true
        ? 'requires LocalizeASO ASC credentials'
        : '',
    option.mutatesAppStoreConnect === false
      ? 'no App Store Connect write'
      : option.mutatesAppStoreConnect === true
        ? 'writes App Store Connect'
        : '',
    option.mutatesReviewData === true
      ? 'updates review keyword context'
      : option.mutatesReviewData === false
        ? 'read-only'
        : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return [
    `- ${kind} (${source})`,
    `  - Output: ${output}`,
    attachCommand ? `  - Attach: ${attachCommand}` : '',
    mcpToolCall ? `  - MCP: ${mcpToolCall}` : '',
    safety ? `  - Safety: ${safety}` : '',
    note ? `  - Note: ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function keywordResearchPromptFromBrief(brief, label) {
  if (!isRecord(brief)) {
    throw new Error(`${label} keyword brief is missing or invalid.`);
  }

  const locales = Array.isArray(brief.locales) ? brief.locales.filter(isRecord) : [];
  const missingKeywordLocales = cleanStringArray(brief.missingKeywordLocales);
  const attachCommands = cleanStringArray(brief.attachCommands);
  const automationOptions = Array.isArray(brief.automationOptions)
    ? brief.automationOptions.map(compactKeywordAutomationOption).filter(Boolean)
    : [];
  const sources = cleanStringArray(brief.sources);
  const keywordContextWarnings = cleanStringArray(brief.keywordContextWarnings);
  const instructions = cleanStringArray(brief.instructions);
  const reviewConstraints = isRecord(brief.reviewConstraints) ? brief.reviewConstraints : null;
  const keywordContextShape = isRecord(brief.keywordContextShape)
    ? brief.keywordContextShape
    : {
        sources: ['astro', 'mcp-keyword-agent'],
        keywords: {},
        rows: [],
      };

  return [
    '# LocalizeASO Keyword Research Prompt',
    '',
    `Research ASO keyword opportunities for this ${label} review job and return provider-neutral keyword context JSON.`,
    '',
    'Rules:',
    '- Return only JSON when you are done. Do not wrap it in Markdown.',
    '- Preserve locale codes exactly as listed below.',
    '- Prefer locale-native search terms over literal translations.',
    '- Include popularity, difficulty, isPreferred, and source when available.',
    '- Use existing/preferred keywords as signals, not as automatic final decisions.',
    '- Do not approve, apply, upload, submit, schedule pricing, or write to Figma/App Store Connect.',
    '',
    `Job: ${brief.job?.id ?? 'unknown'}`,
    `Surface: ${brief.surface ?? 'unknown'}`,
    `Existing sources: ${sources.length ? sources.join(', ') : 'none'}`,
    `Locales needing research: ${missingKeywordLocales.length ? missingKeywordLocales.join(', ') : 'none explicitly missing'}`,
    keywordContextWarnings.length
      ? `Keyword context warnings:\n${keywordContextWarnings.map((warning) => `- ${warning}`).join('\n')}`
      : '',
    reviewConstraints
      ? `Review constraints:\n${JSON.stringify(reviewConstraints, null, 2)}`
      : '',
    '',
    'Locales:',
    locales.length ? locales.map(compactKeywordLocale).join('\n') : '- none listed',
    '',
    automationOptions.length
      ? `Automation options:\n${automationOptions.join('\n')}`
      : [
          'Automation options:',
          '- astro_csv (astro)',
          '  - Output: astro-keywords.csv or discovered keyword CSV',
          '  - Attach with the matching keyword-context-from-csv command if this brief includes one.',
          '- mcp_keyword_agent (mcp-keyword-agent)',
          '  - Output: keyword-context.json',
          '  - Attach with the matching keyword-context command if this brief includes one.',
        ].join('\n'),
    '',
    'Expected JSON shape:',
    '```json',
    JSON.stringify(keywordContextShape, null, 2),
    '```',
    '',
    attachCommands.length
      ? `After writing keyword-context.json, attach it with:\n${attachCommands.map((command) => `- ${command}`).join('\n')}`
      : 'After writing keyword-context.json, attach it to the review job before proposal generation.',
    '',
    instructions.length ? `Brief instructions:\n${instructions.map((item) => `- ${item}`).join('\n')}` : '',
    '',
    'Full brief JSON:',
    '```json',
    JSON.stringify(brief, null, 2),
    '```',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

async function readBundleFromFlag(flags, bundleKey) {
  const path = flags.bundle;
  if (!path || path === true) return null;
  const payload = await readJsonFile(path);
  return payload?.[bundleKey] ?? payload?.agentBundle ?? payload;
}

async function readBriefFromFlag(flags) {
  if (!flags.brief || flags.brief === true) return null;
  return readJsonFile(flags.brief);
}

function requireFlag(flags, key) {
  const value = flags[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing --${key} <value>.`);
  }
  return value.trim();
}

function requireHumanApprovalConsent(flags) {
  if (flags['human-approval-consent'] !== true) {
    throw new Error(
      'Missing --human-approval-consent. Approve commands are human-only and must be run from an explicit review/consent step.',
    );
  }
}

function humanApprovalBody(flags) {
  return {
    humanApprovalConsent: true,
    ...(flags['human-signal-gap-consent'] === true ? { humanSignalGapConsent: true } : {}),
  };
}

function requireHumanReviewConsent(flags) {
  if (flags['human-review-consent'] !== true) {
    throw new Error(
      'Missing --human-review-consent. Decision save commands are human-only and must be run from an explicit review/consent step.',
    );
  }
}

function requireHumanPostApprovalConsent(flags) {
  if (flags['human-post-approval-consent'] !== true) {
    throw new Error(
      'Missing --human-post-approval-consent. Post-approval apply, export, submit, schedule, and status commands are human-only and must be run after inspecting the approved plan.',
    );
  }
}

function requireHumanRejectionConsent(flags) {
  if (flags['human-rejection-consent'] !== true) {
    throw new Error(
      'Missing --human-rejection-consent. Rejecting a review is human-only and must be run from an explicit review/consent step.',
    );
  }
}

function requireHumanStatusConsent(status, flags) {
  if (status === 'rejected') {
    requireHumanRejectionConsent(flags);
    return { humanRejectionConsent: true };
  }
  requireHumanPostApprovalConsent(flags);
  return { humanPostApprovalConsent: true };
}

const HUMAN_APPROVAL_CONSENT_FLAG = '--human-approval-consent';
const HUMAN_REVIEW_CONSENT_FLAG = '--human-review-consent';
const HUMAN_POST_APPROVAL_CONSENT_FLAG = '--human-post-approval-consent';
const HUMAN_REJECTION_CONSENT_FLAG = '--human-rejection-consent';
const POST_APPROVAL_MUTATION_COMMAND_RE =
  /\b(?:field-apply-drafts|field-apply-keywords|field-metadata-files|field-pricing-payload|field-submit-metadata|field-submit-pricing)\b/;
const HUMAN_ONLY_REVIEW_COMMAND_RE =
  /\b(?:approve|field-approve|save-decisions|field-save-decisions|apply-plan|field-apply-plan|field-apply-drafts|field-apply-keywords|field-metadata-files|field-pricing-payload|field-submit-metadata|field-submit-pricing|status|field-status)\b/;
const STATUS_COMMAND_RE = /\b(?:status|field-status)\b/;
const REJECTED_STATUS_RE = /\s--status(?:=|\s+)rejected\b/;
const APPLIED_OR_SUBMITTED_STATUS_RE = /\s--status(?:=|\s+)(?:applied|submitted)\b/;

function appendMissingFlag(command, flag) {
  return command.includes(flag) ? command : `${command} ${flag}`;
}

function removeFlag(command, flag) {
  return command.replace(new RegExp(`\\s+${flag}\\b`, 'g'), '').trim();
}

function removeExpectedApplyPlanFingerprintFlags(command) {
  return command
    .replace(
      /\s+--(?:expected-apply-plan-fingerprint|expectedApplyPlanFingerprint|apply-plan-fingerprint)=(?:"[^"]*"|'[^']*'|[^\s]+)/g,
      '',
    )
    .replace(
      /\s+--(?:expected-apply-plan-fingerprint|expectedApplyPlanFingerprint|apply-plan-fingerprint)(?:\s+(?:"[^"]*"|'[^']*'|[^\s-][^\s]*))?/g,
      '',
    )
    .trim();
}

function removeApprovedReviewProposalGuardFlags(command) {
  return command
    .replace(
      /\s+--(?:approved-screenshot-review-proposal-id|approvedScreenshotReviewProposalId|approved-field-review-proposal-id|approvedFieldReviewProposalId)=(?:"[^"]*"|'[^']*'|[^\s]+)/g,
      '',
    )
    .replace(
      /\s+--(?:approved-screenshot-review-proposal-id|approvedScreenshotReviewProposalId|approved-field-review-proposal-id|approvedFieldReviewProposalId)(?:\s+(?:"[^"]*"|'[^']*'|[^\s-][^\s]*))?/g,
      '',
    )
    .replace(
      /\s+--(?:approved-screenshot-review-proposal-version|approvedScreenshotReviewProposalVersion|approved-field-review-proposal-version|approvedFieldReviewProposalVersion)=(?:"[^"]*"|'[^']*'|[^\s]+)/g,
      '',
    )
    .replace(
      /\s+--(?:approved-screenshot-review-proposal-version|approvedScreenshotReviewProposalVersion|approved-field-review-proposal-version|approvedFieldReviewProposalVersion)(?:\s+(?:"[^"]*"|'[^']*'|[^\s-][^\s]*))?/g,
      '',
    )
    .trim();
}

function humanOnlyCommandWithConsentFlags(command) {
  const trimmedCommand = asCleanString(command);
  if (!trimmedCommand) return trimmedCommand;
  if (/\b(?:approve|field-approve)\b/.test(trimmedCommand)) {
    return appendMissingFlag(trimmedCommand, HUMAN_APPROVAL_CONSENT_FLAG);
  }
  if (/\b(?:save-decisions|field-save-decisions)\b/.test(trimmedCommand)) {
    return appendMissingFlag(trimmedCommand, HUMAN_REVIEW_CONSENT_FLAG);
  }
  if (STATUS_COMMAND_RE.test(trimmedCommand)) {
    if (REJECTED_STATUS_RE.test(trimmedCommand)) {
    return appendMissingFlag(
        removeApprovedReviewProposalGuardFlags(
          removeExpectedApplyPlanFingerprintFlags(
            removeFlag(trimmedCommand, HUMAN_POST_APPROVAL_CONSENT_FLAG),
          ),
        ),
        HUMAN_REJECTION_CONSENT_FLAG,
      );
    }
    return appendMissingFlag(trimmedCommand, HUMAN_POST_APPROVAL_CONSENT_FLAG);
  }
  if (POST_APPROVAL_MUTATION_COMMAND_RE.test(trimmedCommand)) {
    return appendMissingFlag(trimmedCommand, HUMAN_POST_APPROVAL_CONSENT_FLAG);
  }
  return trimmedCommand;
}

function isApplyPlanFingerprintGuardedMutation(command) {
  const trimmedCommand = asCleanString(command);
  if (!trimmedCommand) return false;
  if (POST_APPROVAL_MUTATION_COMMAND_RE.test(trimmedCommand)) return true;
  return STATUS_COMMAND_RE.test(trimmedCommand) && APPLIED_OR_SUBMITTED_STATUS_RE.test(trimmedCommand);
}

function humanOnlyHandoffCommandWithConsentFlags(command) {
  const protectedCommand = humanOnlyCommandWithConsentFlags(command);
  if (
    isApplyPlanFingerprintGuardedMutation(protectedCommand) &&
    !hasExpectedApplyPlanFingerprintForCommandFamily(protectedCommand)
  ) {
    return '';
  }
  return protectedCommand;
}

function isHumanOnlyReviewCommand(command) {
  const trimmedCommand = asCleanString(command);
  return Boolean(trimmedCommand && HUMAN_ONLY_REVIEW_COMMAND_RE.test(trimmedCommand));
}

async function writeJson(payload, outPath) {
  const formatted = `${JSON.stringify(payload, null, 2)}\n`;
  if (outPath && outPath !== true) {
    await writeFile(outPath, formatted, 'utf8');
    console.error(`Wrote ${outPath}`);
    return;
  }
  process.stdout.write(formatted);
}

function withRefineNextAgentRunContextBoundary(payload) {
  if (!isRecord(payload) || !isRecord(payload.nextAgentRun)) return payload;
  const existingChecklist = cleanStringArray(payload.nextAgentRun.contextChecklist);
  const hasBoundary = existingChecklist.some((line) => (
    line.includes('not human approval receipts') &&
    line.includes('post-approval consent') &&
    line.includes('apply-plan fingerprints')
  ));
  if (hasBoundary) return payload;
  return {
    ...payload,
    nextAgentRun: {
      ...payload.nextAgentRun,
      contextChecklist: [...existingChecklist, REFINE_NEXT_AGENT_RUN_CONTEXT_BOUNDARY],
    },
  };
}

function withReviewGateSummary(payload, reviewKind) {
  if (!isRecord(payload)) return payload;
  const blockingIssues = Array.isArray(payload.blockingIssues) ? payload.blockingIssues : [];
  const finalValueGate = reviewKind === 'field'
    ? (isRecord(payload.finalValueGate) ? payload.finalValueGate : buildFieldReviewFinalValueGate(blockingIssues))
    : null;
  const payloadWithGate = isRecord(payload.reviewGateSummary)
    ? (finalValueGate ? { ...payload, finalValueGate } : payload)
    : {
        ...payload,
        ...(finalValueGate ? { finalValueGate } : {}),
        reviewGateSummary: buildReviewGateSummary({
          reviewKind,
          ready: Boolean(payload.ready) && blockingIssues.length === 0,
          pendingTargetCount: Array.isArray(payload.pendingTargets) ? payload.pendingTargets.length : 0,
          signalAudit: isRecord(payload.signalAudit) ? payload.signalAudit : null,
        }),
      };
  const payloadWithBoundary = withReadinessBoundary(payloadWithGate, reviewKind);
  const readinessReviewGate = buildSharedReadinessReviewGate({
    reviewKind,
    ready: payloadWithBoundary.ready === true,
    reviewGateSummary: isRecord(payloadWithBoundary.reviewGateSummary)
      ? payloadWithBoundary.reviewGateSummary
      : null,
    readinessBoundary: isRecord(payloadWithBoundary.readinessBoundary)
      ? payloadWithBoundary.readinessBoundary
      : null,
    finalValueGate: reviewKind === 'field' && isRecord(payloadWithBoundary.finalValueGate)
      ? payloadWithBoundary.finalValueGate
      : null,
    pendingTargetCount: Array.isArray(payloadWithBoundary.pendingTargets)
      ? payloadWithBoundary.pendingTargets.length
      : undefined,
  });
  return readinessReviewGate
    ? { ...payloadWithBoundary, readinessReviewGate }
    : payloadWithBoundary;
}

function withReadinessBoundary(payload, reviewKind) {
  if (!isRecord(payload)) return payload;
  if (isRecord(payload.readinessBoundary)) return payload;
  const reviewGateSummary = isRecord(payload.reviewGateSummary) ? payload.reviewGateSummary : {};
  const finalValueGate = isRecord(payload.finalValueGate) ? payload.finalValueGate : {};
  const ready = reviewGateSummary.ready === true && (reviewKind !== 'field' || finalValueGate.ready !== false);
  if (isRecord(payload.reviewGateSummary)) {
    return {
      ...payload,
      readinessBoundary: buildReviewReadinessBoundary({ reviewKind, ready }),
    };
  }
  return payload;
}

function buildPostProposalReviewGate(payload) {
  if (!isRecord(payload)) return null;
  const signalAudit = isRecord(payload.signalAudit) ? payload.signalAudit : {};
  const reviewGateSummary = isRecord(payload.reviewGateSummary) ? payload.reviewGateSummary : {};
  const pendingTargetCount =
    typeof reviewGateSummary.pendingTargetCount === 'number'
      ? reviewGateSummary.pendingTargetCount
      : typeof signalAudit.totalTargets === 'number'
        ? signalAudit.totalTargets
        : undefined;
  const warnings = Array.isArray(reviewGateSummary.warnings)
    ? reviewGateSummary.warnings.map(asCleanString).filter(Boolean)
    : [];
  const screenshotEvidenceGapCount =
    typeof reviewGateSummary.screenshotEvidenceGapCount === 'number'
      ? reviewGateSummary.screenshotEvidenceGapCount
      : undefined;
  const rawSignalGate = asCleanString(reviewGateSummary.signalGate);
  const signalGate =
    typeof screenshotEvidenceGapCount === 'number' &&
    screenshotEvidenceGapCount > 0 &&
    rawSignalGate !== 'attention_required'
      ? 'attention_required'
      : rawSignalGate;
  if (
    pendingTargetCount === undefined &&
    !Object.keys(signalAudit).length &&
    !Object.keys(reviewGateSummary).length
  ) {
    return null;
  }
  return {
    kind: 'localizeaso_post_proposal_review_gate',
    phase: 'post_proposal_human_review',
    humanReviewRequired: true,
    approvalState: 'requires_human_review',
    ...(asCleanString(reviewGateSummary.reviewKind)
      ? { reviewKind: asCleanString(reviewGateSummary.reviewKind) }
      : {}),
    ...(typeof pendingTargetCount === 'number' ? { pendingTargetCount } : {}),
    ...(asCleanString(reviewGateSummary.humanDecisionGate)
      ? { humanDecisionGate: asCleanString(reviewGateSummary.humanDecisionGate) }
      : {}),
    ...(signalGate ? { signalGate } : {}),
    ...(typeof reviewGateSummary.targetsNeedingAttentionCount === 'number'
      ? { targetsNeedingAttentionCount: reviewGateSummary.targetsNeedingAttentionCount }
      : typeof signalAudit.targetsNeedingAttentionCount === 'number'
        ? { targetsNeedingAttentionCount: signalAudit.targetsNeedingAttentionCount }
        : {}),
    ...(typeof reviewGateSummary.keywordMappingNotApplicableCount === 'number'
      ? { keywordMappingNotApplicableCount: reviewGateSummary.keywordMappingNotApplicableCount }
      : typeof signalAudit.keywordMappingNotApplicableCount === 'number'
        ? { keywordMappingNotApplicableCount: signalAudit.keywordMappingNotApplicableCount }
        : {}),
    ...(typeof reviewGateSummary.missingKeywordMappingCount === 'number'
      ? { missingKeywordMappingCount: reviewGateSummary.missingKeywordMappingCount }
      : typeof signalAudit.missingKeywordMappingCount === 'number'
        ? { missingKeywordMappingCount: signalAudit.missingKeywordMappingCount }
        : {}),
    ...(typeof reviewGateSummary.missingRationaleCount === 'number'
      ? { missingRationaleCount: reviewGateSummary.missingRationaleCount }
      : typeof signalAudit.missingRationaleCount === 'number'
        ? { missingRationaleCount: signalAudit.missingRationaleCount }
        : {}),
    ...(typeof reviewGateSummary.noWarningsReportedCount === 'number'
      ? { noWarningsReportedCount: reviewGateSummary.noWarningsReportedCount }
      : typeof signalAudit.noWarningsReportedCount === 'number'
        ? { noWarningsReportedCount: signalAudit.noWarningsReportedCount }
        : {}),
    ...(typeof screenshotEvidenceGapCount === 'number' ? { screenshotEvidenceGapCount } : {}),
    ...(typeof reviewGateSummary.screenshotMissingTargetCount === 'number'
      ? { screenshotMissingTargetCount: reviewGateSummary.screenshotMissingTargetCount }
      : {}),
    ...(typeof reviewGateSummary.screenshotFallbackOnlyTargetCount === 'number'
      ? { screenshotFallbackOnlyTargetCount: reviewGateSummary.screenshotFallbackOnlyTargetCount }
      : {}),
    ...(typeof reviewGateSummary.screenshotContextOnlyTargetCount === 'number'
      ? { screenshotContextOnlyTargetCount: reviewGateSummary.screenshotContextOnlyTargetCount }
      : {}),
    ...(typeof reviewGateSummary.screenshotStrongEvidenceTargetCount === 'number'
      ? { screenshotStrongEvidenceTargetCount: reviewGateSummary.screenshotStrongEvidenceTargetCount }
      : {}),
    ...(typeof reviewGateSummary.screenshotWeakEvidenceTargetCount === 'number'
      ? { screenshotWeakEvidenceTargetCount: reviewGateSummary.screenshotWeakEvidenceTargetCount }
      : {}),
    warnings,
    agentInstruction: asCleanString(reviewGateSummary.agentInstruction) ||
      'Open the human review screen before approval. This gate is informational and does not approve, apply, submit, schedule pricing, or mark status.',
  };
}

function buildMonetizationBoundary(kind) {
  if (kind === 'workspace') return buildLocalizeAsoMonetizationBoundary('workspace');
  if (kind === 'metadata' || kind === 'keywords' || kind === 'pricing') {
    return buildLocalizeAsoMonetizationBoundary('field', { reviewSurface: kind });
  }
  return buildLocalizeAsoMonetizationBoundary(kind === 'field' ? 'field' : 'screenshots');
}

function normalizedFieldReviewSurface(value) {
  const surface = asCleanString(value);
  return surface === 'metadata' || surface === 'keywords' || surface === 'pricing' ? surface : '';
}

function fieldReviewSurfaceFromBundle(bundle) {
  return (
    normalizedFieldReviewSurface(bundle?.surface) ||
    normalizedFieldReviewSurface(bundle?.job?.surface) ||
    normalizedFieldReviewSurface(bundle?.handoff?.surface)
  );
}

function monetizationBoundaryForReview(kind, surface = '') {
  if (kind === 'field') return buildMonetizationBoundary(normalizedFieldReviewSurface(surface) || 'field');
  return buildMonetizationBoundary(kind);
}

function monetizationBoundaryForBundle(bundle, kind) {
  if (kind === 'field') return monetizationBoundaryForReview('field', fieldReviewSurfaceFromBundle(bundle));
  return buildMonetizationBoundary(kind);
}

function monetizationBoundaryKind(flags) {
  const kind = optionalFlag(flags, 'kind').toLowerCase();
  if (kind === 'workspace' || kind === 'queue') return 'workspace';
  if (kind === 'metadata') return 'metadata';
  if (kind === 'keywords' || kind === 'keyword') return 'keywords';
  if (kind === 'pricing') return 'pricing';
  if (kind === 'field' || kind === 'fields') return 'field';
  if (kind === 'screenshots' || kind === 'screenshot') return 'screenshots';
  return 'screenshots';
}

async function writeText(text, outPath) {
  const formatted = text.endsWith('\n') ? text : `${text}\n`;
  if (outPath && outPath !== true) {
    await writeFile(outPath, formatted, 'utf8');
    console.error(`Wrote ${outPath}`);
    return;
  }
  process.stdout.write(formatted);
}

async function writeOptionalJson(payload, outPath) {
  if (!outPath || outPath === true) return;
  await writeJson(payload, outPath);
}

function commandHandoffItems(value, fallbackPrefix, options = {}) {
  if (!Array.isArray(value)) return [];
  const protectCommand = options.humanOnly === true ? humanOnlyHandoffCommandWithConsentFlags : asCleanString;
  return value
    .map((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return {
          id: `${fallbackPrefix}_${index + 1}`,
          label: `${fallbackPrefix.replace(/_/g, ' ')} ${index + 1}`,
          command: protectCommand(item),
        };
      }
      if (!isRecord(item)) return null;
      const command = protectCommand(item.command);
      if (!command) return null;
      return {
        id: asCleanString(item.id) || `${fallbackPrefix}_${index + 1}`,
        label: asCleanString(item.label) || `${fallbackPrefix.replace(/_/g, ' ')} ${index + 1}`,
        command,
        ...(asCleanString(item.note) ? { note: asCleanString(item.note) } : {}),
      };
    })
    .filter(Boolean);
}

function splitAgentSafeHandoffItems(items) {
  const agentSafe = [];
  const humanOnly = [];
  for (const item of items) {
    if (!item?.command) continue;
    if (isHumanOnlyReviewCommand(item.command)) {
      const command = humanOnlyHandoffCommandWithConsentFlags(item.command);
      if (!command) continue;
      humanOnly.push({
        ...item,
        command,
        note: [
          asCleanString(item.note),
          'Moved from agent-safe handoff because this command requires explicit human review or post-approval consent.',
        ].filter(Boolean).join(' '),
      });
    } else {
      agentSafe.push(item);
    }
  }
  return { agentSafe, humanOnly };
}

function postApprovalMonetizationBoundaryItem(value) {
  if (!isRecord(value)) return null;
  const requiredLocalizeAsoCapabilities = Array.isArray(value.requiredLocalizeAsoCapabilities)
    ? value.requiredLocalizeAsoCapabilities.map(asCleanString).filter(Boolean)
    : [];
  const notes = Array.isArray(value.notes)
    ? value.notes.map(asCleanString).filter(Boolean)
    : [];
  const revenueBoundary = asCleanString(value.revenueBoundary);
  const appStoreConnectCredentialMode = asCleanString(value.appStoreConnectCredentialMode);
  const requiresHostedSubmitPass = value.requiresHostedSubmitPass === true;
  const packageLabel =
    asCleanString(value.packageLabel) ||
    postApprovalPackageLabel({
      revenueBoundary,
      appStoreConnectCredentialMode,
      requiresHostedSubmitPass,
    });
  const packageGuidance =
    asCleanString(value.packageGuidance) ||
    postApprovalPackageGuidance({
      revenueBoundary,
      appStoreConnectCredentialMode,
      requiresHostedSubmitPass,
    });
  return {
    ...(value.requiresLocalizeAsoPass === true ? { requiresLocalizeAsoPass: true } : {}),
    ...(requiredLocalizeAsoCapabilities.length ? { requiredLocalizeAsoCapabilities } : {}),
    ...(typeof value.requiresHostedAi === 'boolean' ? { requiresHostedAi: value.requiresHostedAi } : {}),
    ...(typeof value.requiresHostedSubmitPass === 'boolean'
      ? { requiresHostedSubmitPass: value.requiresHostedSubmitPass }
      : {}),
    ...(appStoreConnectCredentialMode ? { appStoreConnectCredentialMode } : {}),
    ...(revenueBoundary ? { revenueBoundary } : {}),
    ...(packageLabel ? { packageLabel } : {}),
    ...(packageGuidance ? { packageGuidance } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

function postApprovalPackageLabel({
  revenueBoundary,
  appStoreConnectCredentialMode,
  requiresHostedSubmitPass,
}) {
  if (requiresHostedSubmitPass || revenueBoundary === 'hosted_submit_convenience') {
    return 'Hosted Submit Pass (no hosted AI)';
  }
  if (revenueBoundary === 'paid_figma_apply_handoff') {
    return 'Agent Pass + Figma handoff';
  }
  if (appStoreConnectCredentialMode === 'local_human') {
    return 'Agent Pass + local asc';
  }
  if (appStoreConnectCredentialMode === 'external_human_upload') {
    return 'Agent Pass + external upload';
  }
  if (revenueBoundary === 'paid_review_handoff') {
    return 'Agent Pass review handoff';
  }
  return '';
}

function postApprovalPackageGuidance({
  revenueBoundary,
  appStoreConnectCredentialMode,
  requiresHostedSubmitPass,
}) {
  if (requiresHostedSubmitPass || revenueBoundary === 'hosted_submit_convenience') {
    return 'BYO/Codex proposals can feed this path; LocalizeASO only monetizes the human-approved hosted App Store Connect convenience.';
  }
  if (revenueBoundary === 'paid_figma_apply_handoff') {
    return 'BYO/Codex proposals stay customer-funded; LocalizeASO monetizes persisted review history, consent, and guarded Figma apply.';
  }
  if (appStoreConnectCredentialMode === 'local_human') {
    return 'BYO/Codex proposals stay customer-funded; App Store Connect credentials and asc execution remain on the human workstation.';
  }
  if (appStoreConnectCredentialMode === 'external_human_upload') {
    return 'BYO/Codex proposals stay customer-funded; App Store upload happens outside LocalizeASO and this path records the audited status only.';
  }
  if (revenueBoundary === 'paid_review_handoff') {
    return 'BYO/Codex proposals stay customer-funded; LocalizeASO monetizes review persistence, consent, and the approved handoff.';
  }
  return '';
}

function postApprovalPathItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = asCleanString(item.id);
      const label = asCleanString(item.label);
      const mode = asCleanString(item.mode);
      const description = asCleanString(item.description);
      if (!id || !label || !mode || !description) return null;
      const humanOnly = true;
      const guidance = asCleanString(item.guidance) || postApprovalPathModeGuidance(mode);
      const monetizationBoundary = postApprovalMonetizationBoundaryItem(item.monetizationBoundary);
      return {
        id,
        label,
        mode,
        available: item.available === true,
        humanOnly,
        description,
        guidance,
        commands: Array.isArray(item.commands)
          ? item.commands.map(humanOnly ? humanOnlyHandoffCommandWithConsentFlags : asCleanString).filter(Boolean)
          : [],
        ...(asCleanString(item.nextStatus) ? { nextStatus: asCleanString(item.nextStatus) } : {}),
        ...(Array.isArray(item.requires)
          ? { requires: item.requires.map(asCleanString).filter(Boolean) }
          : {}),
        ...(Array.isArray(item.warnings)
          ? { warnings: item.warnings.map(asCleanString).filter(Boolean) }
          : {}),
        ...(monetizationBoundary ? { monetizationBoundary } : {}),
      };
    })
    .filter(Boolean);
}

function postApprovalPathMonetizationBoundaries(postApprovalPaths) {
  if (!Array.isArray(postApprovalPaths)) return [];
  return postApprovalPaths
    .map((path) => {
      if (!isRecord(path) || !isRecord(path.monetizationBoundary)) return null;
      return {
        id: asCleanString(path.id),
        mode: asCleanString(path.mode),
        humanOnly: true,
        ...path.monetizationBoundary,
      };
    })
    .filter((item) => item?.id && item?.mode);
}

const HANDOFF_SAFETY_BOOLEAN_FIELDS = [
  'proposalSubmissionOnly',
  'protectedActionsAllowed',
  'approvalAllowed',
  'rejectionAllowed',
  'figmaApplyAllowed',
  'metadataApplyAllowed',
  'metadataExportAllowed',
  'metadataPublishAllowed',
  'keywordApplyAllowed',
  'pricingScheduleAllowed',
  'pricingExportAllowed',
  'pricingPublishAllowed',
  'screenshotUploadAllowed',
  'screenshotPublishAllowed',
  'appStoreUploadAllowed',
  'appStoreSubmitAllowed',
  'localAscHandoffAllowed',
  'hostedAppStoreSubmitAllowed',
  'appStorePublishAllowed',
  'statusUpdateAllowed',
  'postApprovalActionAllowed',
  'humanApprovalConsentGranted',
  'humanRejectionConsentGranted',
  'humanPostApprovalConsentGranted',
  'applyPlanFingerprintRequiredForPostApproval',
];

function handoffSafetyBooleanSummary(handoffSafety, protectedActions, options = {}) {
  const summary = {};
  for (const field of HANDOFF_SAFETY_BOOLEAN_FIELDS) {
    if (typeof handoffSafety[field] === 'boolean') summary[field] = handoffSafety[field];
  }

  const phase = asCleanString(handoffSafety.phase) ||
    (options.hasHumanOnlyPostApprovalPath === true ? 'post_approval' : '');
  const approvedPostApproval =
    handoffSafety.humanOnly === true &&
    handoffSafety.usesHumanFinalValues === true &&
    asCleanString(handoffSafety.valueSource) === 'approved_human_decisions' &&
    phase === 'post_approval';
  if (!approvedPostApproval) return summary;

  if (typeof summary.protectedActionsAllowed !== 'boolean') summary.protectedActionsAllowed = true;
  if (typeof summary.postApprovalActionAllowed !== 'boolean') summary.postApprovalActionAllowed = true;
  if (typeof summary.humanApprovalConsentGranted !== 'boolean') summary.humanApprovalConsentGranted = true;
  if (protectedActions.includes('figma_apply') && typeof summary.figmaApplyAllowed !== 'boolean') {
    summary.figmaApplyAllowed = true;
  }
  if (protectedActions.includes('metadata_push') && typeof summary.metadataApplyAllowed !== 'boolean') {
    summary.metadataApplyAllowed = true;
  }
  if (protectedActions.includes('keyword_apply') && typeof summary.keywordApplyAllowed !== 'boolean') {
    summary.keywordApplyAllowed = true;
  }
  if (protectedActions.includes('pricing_schedule') && typeof summary.pricingScheduleAllowed !== 'boolean') {
    summary.pricingScheduleAllowed = true;
  }
  if (protectedActions.includes('pricing_schedule') && protectedActions.includes('export') &&
    typeof summary.pricingExportAllowed !== 'boolean') {
    summary.pricingExportAllowed = true;
  }
  if (protectedActions.includes('screenshot_upload') && typeof summary.screenshotUploadAllowed !== 'boolean') {
    summary.screenshotUploadAllowed = true;
  }
  if (protectedActions.includes('screenshot_publish') && typeof summary.screenshotPublishAllowed !== 'boolean') {
    summary.screenshotPublishAllowed = true;
  }
  if (protectedActions.includes('app_store_upload') && typeof summary.appStoreUploadAllowed !== 'boolean') {
    summary.appStoreUploadAllowed = true;
  }
  if (protectedActions.includes('app_store_submit') && typeof summary.appStoreSubmitAllowed !== 'boolean') {
    summary.appStoreSubmitAllowed = true;
  }
  if (
    protectedActions.some((action) => action === 'app_store_submit' || action === 'metadata_push' || action === 'pricing_schedule') &&
    typeof summary.localAscHandoffAllowed !== 'boolean'
  ) {
    summary.localAscHandoffAllowed = true;
  }
  if (protectedActions.includes('app_store_publish') && typeof summary.appStorePublishAllowed !== 'boolean') {
    summary.appStorePublishAllowed = true;
  }

  return summary;
}

function protectedActionsFromPostApprovalPaths(postApprovalPaths) {
  const actions = [];
  for (const path of postApprovalPaths) {
    if (!isRecord(path)) continue;
    const mode = asCleanString(path.mode);
    if (mode === 'app_store_upload') {
      actions.push('screenshot_upload');
      actions.push('app_store_upload');
    }
  }
  return actions;
}

function handoffExportPayload(handoff) {
  if (!isRecord(handoff)) return handoff;
  const normalizedHandoff = normalizeReviewUrlsForLocalDashboard(handoff);
  const declaredAgentSafe = commandHandoffItems(
    normalizedHandoff.agentSafeCommands,
    'agent_safe',
  );
  const declaredHumanOnly = commandHandoffItems(
    normalizedHandoff.humanOnlyCommands,
    'human_only',
    { humanOnly: true },
  );
  const fallbackAgentCandidates = declaredAgentSafe.length
    ? declaredAgentSafe
    : commandHandoffItems(normalizedHandoff.runbook?.commands, 'agent_safe');
  const splitAgentSafe = splitAgentSafeHandoffItems(fallbackAgentCandidates);
  const fallbackHumanOnly = declaredHumanOnly.length
    ? [...declaredHumanOnly, ...splitAgentSafe.humanOnly]
    : [
        ...commandHandoffItems(normalizedHandoff.postApprovalCommands?.commands, 'human_only', { humanOnly: true }),
        ...splitAgentSafe.humanOnly,
      ];
  const existingCommandSummary = isRecord(normalizedHandoff.commandSummary) ? normalizedHandoff.commandSummary : {};
  const existingSummarySafety = isRecord(existingCommandSummary.safety) ? existingCommandSummary.safety : {};
  const handoffSafety = isRecord(normalizedHandoff.handoffSafety)
    ? { ...existingSummarySafety, ...normalizedHandoff.handoffSafety }
    : existingSummarySafety;
  const postApprovalChecklist = Array.isArray(normalizedHandoff.postApprovalChecklist)
    ? normalizedHandoff.postApprovalChecklist.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const postApprovalNotes = Array.isArray(normalizedHandoff.postApprovalCommands?.notes)
    ? normalizedHandoff.postApprovalCommands.notes.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const postApprovalPaths = postApprovalPathItems(normalizedHandoff.postApprovalPaths);
  const postApprovalFingerprintRequirement = isRecord(normalizedHandoff.postApprovalFingerprintRequirement)
    ? structuredClone(normalizedHandoff.postApprovalFingerprintRequirement)
    : undefined;
  const postApprovalMonetizationBoundaries = postApprovalPathMonetizationBoundaries(postApprovalPaths);
  const reviewSignalContract = isRecord(normalizedHandoff.reviewSignalContract)
    ? structuredClone(normalizedHandoff.reviewSignalContract)
    : undefined;
  const hasHumanOnlyBoundary =
    fallbackHumanOnly.length > 0 || postApprovalPaths.length > 0;
  const hasHumanOnlyPostApprovalPath = postApprovalPaths.length > 0;
  const protectedActions = [
    ...(Array.isArray(handoffSafety.protectedActions)
      ? handoffSafety.protectedActions.map(asCleanString).filter(Boolean)
      : []),
    ...protectedActionsFromPostApprovalPaths(postApprovalPaths),
  ].filter((action, index, actions) => action && actions.indexOf(action) === index);
  const safetyPhase = asCleanString(handoffSafety.phase) ||
    (hasHumanOnlyPostApprovalPath && handoffSafety.usesHumanFinalValues === true
      ? 'post_approval'
      : '');
  const protectedActionBoundary = asCleanString(handoffSafety.protectedActionBoundary);
  const safetyBooleanSummary = handoffSafetyBooleanSummary(handoffSafety, protectedActions, {
    hasHumanOnlyPostApprovalPath,
  });
  const fingerprintSafety = postApprovalFingerprintRequirement
    ? {
        applyPlanFingerprintRequiredForPostApproval:
          postApprovalFingerprintRequirement.required === true,
        ...(asCleanString(postApprovalFingerprintRequirement.flag)
          ? { applyPlanFingerprintFlag: asCleanString(postApprovalFingerprintRequirement.flag) }
          : {}),
        ...(asCleanString(postApprovalFingerprintRequirement.note)
          ? { applyPlanFingerprintGuidance: asCleanString(postApprovalFingerprintRequirement.note) }
          : {}),
      }
    : {};
  return {
    ...normalizedHandoff,
    commandSummary: {
      agentSafe: splitAgentSafe.agentSafe,
      humanOnly: fallbackHumanOnly,
      postApprovalPaths,
      ...(postApprovalFingerprintRequirement ? { postApprovalFingerprintRequirement } : {}),
      ...(postApprovalMonetizationBoundaries.length ? { postApprovalMonetizationBoundaries } : {}),
      postApprovalNotes,
      postApprovalChecklist,
      ...(reviewSignalContract ? { reviewSignalContract } : {}),
      safety: {
        humanOnly: handoffSafety.humanOnly === true || hasHumanOnlyBoundary,
        humanOnlyExecutionScope: hasHumanOnlyBoundary
          ? 'dashboard_or_cli_after_explicit_human_consent'
          : 'none',
        postApprovalRunbookExecutionAllowedInMcp: false,
        protectedActionsExecutableByAgent: false,
        protectedActionsExecutableByMcp: false,
        ...safetyBooleanSummary,
        ...fingerprintSafety,
        ...(handoffSafety.usesHumanFinalValues === true ? { usesHumanFinalValues: true } : {}),
        ...(asCleanString(handoffSafety.valueSource) ? { valueSource: asCleanString(handoffSafety.valueSource) } : {}),
        ...(safetyPhase ? { phase: safetyPhase } : {}),
        ...(protectedActionBoundary ? { protectedActionBoundary } : {}),
        ...(protectedActions.length ? { protectedActions } : {}),
        ...(asCleanString(handoffSafety.agentInstruction)
          ? { agentInstruction: asCleanString(handoffSafety.agentInstruction) }
          : {}),
        ...(asCleanString(handoffSafety.applyPlanFingerprintFlag)
          ? { applyPlanFingerprintFlag: asCleanString(handoffSafety.applyPlanFingerprintFlag) }
          : {}),
        ...(asCleanString(handoffSafety.applyPlanFingerprintGuidance)
          ? { applyPlanFingerprintGuidance: asCleanString(handoffSafety.applyPlanFingerprintGuidance) }
          : {}),
      },
      guardrails: [
        'Agent-safe commands may fetch context, attach keyword research, submit proposals, open review, or request revisions.',
        'Human-only commands require explicit reviewer action for review rejection or post-approval steps and must not run from an autonomous proposal pass.',
      ],
    },
  };
}

function handoffCommandSummaryFromBundle(bundle, reviewKind) {
  if (!isRecord(bundle)) {
    throw new Error('Missing agent bundle.');
  }
  const handoff = handoffExportPayload(bundle.handoff);
  const commandSummary = isRecord(handoff?.commandSummary) ? handoff.commandSummary : {};
  const job = isRecord(bundle.job) ? bundle.job : {};
  const agentSafeCommands = Array.isArray(commandSummary.agentSafe) ? commandSummary.agentSafe : [];
  const humanOnlyCommands = Array.isArray(commandSummary.humanOnly) ? commandSummary.humanOnly : [];
  const safety = isRecord(commandSummary.safety) ? commandSummary.safety : {};
  const guardrails = Array.isArray(commandSummary.guardrails) ? commandSummary.guardrails : [];
  const postApprovalChecklist = Array.isArray(commandSummary.postApprovalChecklist)
    ? commandSummary.postApprovalChecklist
    : [];
  const postApprovalNotes = Array.isArray(commandSummary.postApprovalNotes)
    ? commandSummary.postApprovalNotes
    : [];
  const postApprovalPaths = Array.isArray(commandSummary.postApprovalPaths)
    ? commandSummary.postApprovalPaths
    : [];
  const postApprovalFingerprintRequirement = isRecord(commandSummary.postApprovalFingerprintRequirement)
    ? commandSummary.postApprovalFingerprintRequirement
    : isRecord(handoff?.postApprovalFingerprintRequirement)
      ? handoff.postApprovalFingerprintRequirement
      : undefined;
  const postApprovalMonetizationBoundaries = postApprovalPathMonetizationBoundaries(postApprovalPaths);
  const reviewSignalContract = isRecord(commandSummary.reviewSignalContract)
    ? commandSummary.reviewSignalContract
    : isRecord(handoff?.reviewSignalContract)
      ? handoff.reviewSignalContract
      : isRecord(bundle.reviewSignalContract)
        ? bundle.reviewSignalContract
        : undefined;
  const surface = asCleanString(bundle.surface) || asCleanString(job.surface) || reviewKind;
  const boundaryKind = reviewKind === 'field' ? 'field' : 'screenshots';
  const summaryProtectedActions = boundaryKind === 'field'
    ? [
        'human_approval',
        'review_rejection',
        'metadata_apply',
        'metadata_publish',
        'keyword_apply',
        'pricing_export',
        'pricing_schedule',
        'pricing_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ]
    : [
        'human_approval',
        'review_rejection',
        'figma_apply',
        'screenshot_upload',
        'screenshot_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ];
  const commandSummarySafety = {
    ...safety,
    readOnly: true,
    commandBoundaryOnly: true,
    postApprovalPathsHumanOnly: true,
    humanOnlyExecutionScope: 'dashboard_or_cli_after_explicit_human_consent',
    postApprovalRunbookExecutionAllowedInMcp: false,
    protectedActionsExecutableByAgent: false,
    protectedActionsExecutableByMcp: false,
    mutatesReviewData: false,
    mutatesAppStoreConnect: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
  };

  return {
    kind: 'localizeaso_handoff_command_summary',
    reviewKind,
    surface,
    monetizationBoundary: monetizationBoundaryForReview(boundaryKind, surface),
    handoffSafety: {
      agentSafe: true,
      humanOnly: false,
      readOnly: true,
      commandBoundaryOnly: true,
      postApprovalPathsHumanOnly: true,
      mutatesReviewData: false,
      mutatesAppStoreConnect: false,
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
      protectedActionsAllowed: false,
      approvalAllowed: false,
      rejectionAllowed: false,
      figmaApplyAllowed: false,
      metadataApplyAllowed: false,
      metadataExportAllowed: false,
      metadataPublishAllowed: false,
      keywordApplyAllowed: false,
      pricingExportAllowed: false,
      pricingScheduleAllowed: false,
      pricingPublishAllowed: false,
      screenshotUploadAllowed: false,
      screenshotPublishAllowed: false,
      appStoreUploadAllowed: false,
      appStoreSubmitAllowed: false,
      appStorePublishAllowed: false,
      statusUpdateAllowed: false,
      postApprovalActionAllowed: false,
      humanApprovalConsentGranted: false,
      humanRejectionConsentGranted: false,
      humanPostApprovalConsentGranted: false,
      protectedActions: summaryProtectedActions,
      phase: boundaryKind === 'field' ? 'field_handoff_summary' : 'screenshot_handoff_summary',
      agentInstruction:
        'This handoff summary is a read-only command boundary. Use agent-safe commands only for setup, context, proposal, or revision work; human-only commands and post-approval paths require explicit reviewer consent.',
    },
    job: {
      ...(asCleanString(job.id) ? { id: asCleanString(job.id) } : {}),
      ...(asCleanString(job.appId) ? { appId: asCleanString(job.appId) } : {}),
      ...(asCleanString(job.status) ? { status: asCleanString(job.status) } : {}),
    },
    ...(asCleanString(handoff?.reviewUrl) ? { reviewUrl: normalizeReviewUrlForLocalDashboard(handoff.reviewUrl) } : {}),
    ...(asCleanString(handoff?.dashboardPath) ? { dashboardPath: asCleanString(handoff.dashboardPath) } : {}),
    agentSafeCommands,
    humanOnlyCommands,
    postApprovalPaths,
    ...(postApprovalFingerprintRequirement ? { postApprovalFingerprintRequirement } : {}),
    ...(postApprovalMonetizationBoundaries.length ? { postApprovalMonetizationBoundaries } : {}),
    postApprovalNotes,
    postApprovalChecklist,
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    commandSummary: {
      agentSafe: agentSafeCommands,
      humanOnly: humanOnlyCommands,
      postApprovalPaths,
      ...(postApprovalFingerprintRequirement ? { postApprovalFingerprintRequirement } : {}),
      ...(postApprovalMonetizationBoundaries.length ? { postApprovalMonetizationBoundaries } : {}),
      postApprovalNotes,
      postApprovalChecklist,
      ...(reviewSignalContract ? { reviewSignalContract } : {}),
      safety: commandSummarySafety,
      guardrails,
    },
    guardrails,
  };
}

function normalizedVisibleEvidence(values) {
  return new Set(values.map((value) => asCleanString(value).toLowerCase()).filter(Boolean));
}

function visibleHasAny(visible, ...labels) {
  return labels.some((label) => visible.has(label.toLowerCase()));
}

function reviewContextLabelsFromVisibleEvidence(values) {
  const visible = normalizedVisibleEvidence(values);
  const labels = [];

  if (
    visibleHasAny(
      visible,
      'current values',
      'current value',
      'current pricing values',
      'source screenshot copy',
      'current screenshot text',
    )
  ) {
    labels.push('current content');
  }
  if (
    visibleHasAny(
      visible,
      'agent proposal values',
      'agent proposal value',
      'agent proposal pricing values',
      'agent proposal',
    )
  ) {
    labels.push('agent proposal');
  }
  if (
    visibleHasAny(
      visible,
      'human final values',
      'human final value',
      'human final pricing values',
      'final value',
      'final screenshot copy',
    )
  ) {
    labels.push('human final');
  }
  if (visibleHasAny(visible, 'diffs', 'diff', 'current-agent-final diffs')) {
    labels.push('diff');
  }

  return labels;
}

function approvalReceiptHumanReviewEvidenceSummary(approvalReceipt) {
  const evidence = isRecord(approvalReceipt?.humanReviewEvidence)
    ? approvalReceipt.humanReviewEvidence
    : null;
  if (!evidence) return null;
  const signalPreviewAudit = isRecord(evidence.signalPreviewAudit) ? evidence.signalPreviewAudit : null;
  const reviewGateSummary = isRecord(evidence.reviewGateSummary) ? evidence.reviewGateSummary : null;
  const signalAudit = isRecord(evidence.signalAudit) ? evidence.signalAudit : null;
  const signalGapSummary = isRecord(evidence.signalGapSummary) ? evidence.signalGapSummary : null;
  const signalGapConsent = isRecord(evidence.signalGapConsent) ? evidence.signalGapConsent : null;
  const firstFiniteNumber = (...values) => {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    }
    return undefined;
  };
  const visibleBeforeApproval = Array.isArray(evidence.visibleBeforeApproval)
    ? evidence.visibleBeforeApproval.map(asCleanString).filter(Boolean)
    : [];
  const reviewContextLabels = Array.isArray(evidence.reviewContextLabels) && evidence.reviewContextLabels.length
    ? evidence.reviewContextLabels.map(asCleanString).filter(Boolean)
    : reviewContextLabelsFromVisibleEvidence(visibleBeforeApproval);
  const reviewContextComplete = typeof evidence.reviewContextComplete === 'boolean'
    ? evidence.reviewContextComplete
    : reviewContextLabels.length === 4;
  const signalGroupsRequired = Array.isArray(evidence.signalGroupsRequired)
    ? evidence.signalGroupsRequired.map(asCleanString).filter(Boolean)
    : [];
  const providedSignalGroupLabels = Array.isArray(evidence.signalGroupLabels)
    ? evidence.signalGroupLabels.map((label) => reviewSignalGroupLabel(label)).filter(Boolean)
    : [];
  const missingGroups = Array.isArray(signalPreviewAudit?.missingGroups)
    ? signalPreviewAudit.missingGroups.map(asCleanString).filter(Boolean)
    : [];
  const signalGroupLabels = providedSignalGroupLabels.length
    ? providedSignalGroupLabels
    : signalGroupsRequired.map(reviewSignalGroupLabel);
  const missingSignalGroupLabels = missingGroups.map(reviewSignalGroupLabel);
  let screenshotEvidenceRequired = signalGroupLabels.some((label) => label === 'screenshot evidence');
  const screenshotEvidenceVisible = visibleBeforeApproval.some(
    (item) => asCleanString(item).toLowerCase() === 'screenshot evidence',
  );
  const pricingEvidenceLabels = new Set([
    'pricing evidence',
    'pricing territory context',
    'pricing schedule warnings',
  ]);
  const pricingEvidenceRequired =
    evidence.pricingEvidenceRequired === true ||
    visibleBeforeApproval.some((item) => pricingEvidenceLabels.has(asCleanString(item).toLowerCase()));
  const pricingEvidenceVisible =
    evidence.pricingEvidenceVisible === true ||
    visibleBeforeApproval.some((item) => pricingEvidenceLabels.has(asCleanString(item).toLowerCase()));
  const keywordMappingNotApplicableCount = firstFiniteNumber(
    signalGapSummary?.keywordMappingNotApplicableCount,
    signalAudit?.keywordMappingNotApplicableCount,
    signalGapConsent?.signalAudit?.keywordMappingNotApplicableCount,
    reviewGateSummary?.keywordMappingNotApplicableCount,
    signalGapConsent?.reviewGateSummary?.keywordMappingNotApplicableCount,
  ) ?? 0;
  const keywordMappingNotApplicable =
    keywordMappingNotApplicableCount > 0 ||
    signalGroupsRequired.some((group) => reviewSignalGroupLabel(group) === 'keyword mapping n/a') ||
    signalGroupLabels.some((label) => label === 'keyword mapping n/a') ||
    visibleBeforeApproval.some((item) => asCleanString(item).toLowerCase() === 'keyword mapping marked not applicable');
  const missingKeywordMappingCount =
    typeof signalGapSummary?.missingKeywordMappingCount === 'number'
      ? signalGapSummary.missingKeywordMappingCount
      : typeof signalAudit?.missingKeywordMappingCount === 'number'
        ? signalAudit.missingKeywordMappingCount
        : typeof signalGapConsent?.signalAudit?.missingKeywordMappingCount === 'number'
          ? signalGapConsent.signalAudit.missingKeywordMappingCount
          : 0;
  const missingRationaleCount =
    typeof signalGapSummary?.missingRationaleCount === 'number'
      ? signalGapSummary.missingRationaleCount
      : typeof signalAudit?.missingRationaleCount === 'number'
        ? signalAudit.missingRationaleCount
        : typeof signalGapConsent?.signalAudit?.missingRationaleCount === 'number'
          ? signalGapConsent.signalAudit.missingRationaleCount
          : 0;
  const noWarningsReportedCount =
    typeof signalGapSummary?.noWarningsReportedCount === 'number'
      ? signalGapSummary.noWarningsReportedCount
      : typeof signalAudit?.noWarningsReportedCount === 'number'
        ? signalAudit.noWarningsReportedCount
        : typeof signalGapConsent?.signalAudit?.noWarningsReportedCount === 'number'
          ? signalGapConsent.signalAudit.noWarningsReportedCount
          : 0;
  const targetsNeedingAttentionCount =
    typeof signalGapSummary?.targetsNeedingAttentionCount === 'number'
      ? signalGapSummary.targetsNeedingAttentionCount
      : typeof signalAudit?.targetsNeedingAttentionCount === 'number'
        ? signalAudit.targetsNeedingAttentionCount
        : typeof signalGapConsent?.signalAudit?.targetsNeedingAttentionCount === 'number'
          ? signalGapConsent.signalAudit.targetsNeedingAttentionCount
          : typeof reviewGateSummary?.targetsNeedingAttentionCount === 'number'
            ? reviewGateSummary.targetsNeedingAttentionCount
            : typeof signalGapConsent?.reviewGateSummary?.targetsNeedingAttentionCount === 'number'
              ? signalGapConsent.reviewGateSummary.targetsNeedingAttentionCount
              : 0;
  const screenshotEvidenceGapCount =
    typeof signalGapSummary?.screenshotEvidenceGapCount === 'number'
      ? signalGapSummary.screenshotEvidenceGapCount
      : typeof reviewGateSummary?.screenshotEvidenceGapCount === 'number'
        ? reviewGateSummary.screenshotEvidenceGapCount
        : typeof signalGapConsent?.reviewGateSummary?.screenshotEvidenceGapCount === 'number'
          ? signalGapConsent.reviewGateSummary.screenshotEvidenceGapCount
          : undefined;
  if (typeof screenshotEvidenceGapCount === 'number') screenshotEvidenceRequired = true;
  const screenshotMissingTargetCount = firstFiniteNumber(
    signalGapSummary?.screenshotMissingTargetCount,
    reviewGateSummary?.screenshotMissingTargetCount,
    signalGapConsent?.reviewGateSummary?.screenshotMissingTargetCount,
  );
  const screenshotFallbackOnlyTargetCount = firstFiniteNumber(
    signalGapSummary?.screenshotFallbackOnlyTargetCount,
    reviewGateSummary?.screenshotFallbackOnlyTargetCount,
    signalGapConsent?.reviewGateSummary?.screenshotFallbackOnlyTargetCount,
  );
  const screenshotContextOnlyTargetCount = firstFiniteNumber(
    signalGapSummary?.screenshotContextOnlyTargetCount,
    reviewGateSummary?.screenshotContextOnlyTargetCount,
    signalGapConsent?.reviewGateSummary?.screenshotContextOnlyTargetCount,
  );
  const screenshotStrongEvidenceTargetCount = firstFiniteNumber(
    signalGapSummary?.screenshotStrongEvidenceTargetCount,
    reviewGateSummary?.screenshotStrongEvidenceTargetCount,
    signalGapConsent?.reviewGateSummary?.screenshotStrongEvidenceTargetCount,
  );
  const screenshotWeakEvidenceTargetCount = firstFiniteNumber(
    signalGapSummary?.screenshotWeakEvidenceTargetCount,
    reviewGateSummary?.screenshotWeakEvidenceTargetCount,
    signalGapConsent?.reviewGateSummary?.screenshotWeakEvidenceTargetCount,
  );
  const hasScreenshotEvidenceBreakdown = [
    screenshotMissingTargetCount,
    screenshotFallbackOnlyTargetCount,
    screenshotContextOnlyTargetCount,
    screenshotWeakEvidenceTargetCount,
    screenshotStrongEvidenceTargetCount,
  ].some((value) => typeof value === 'number');
  const screenshotEvidenceBreakdownLine = hasScreenshotEvidenceBreakdown
    ? `Screenshot evidence breakdown: ${screenshotMissingTargetCount ?? 0} missing, ${screenshotFallbackOnlyTargetCount ?? 0} fallback-only, ${screenshotContextOnlyTargetCount ?? 0} context-only, ${screenshotWeakEvidenceTargetCount ?? 0} weak, ${screenshotStrongEvidenceTargetCount ?? 0} strong.`
    : '';
  const signalGapSummaryLine = reviewSignalGapSummaryLine({
    keywordMappingNotApplicableCount,
    missingKeywordMappingCount,
    missingRationaleCount,
    noWarningsReportedCount,
    screenshotEvidenceGapCount,
  }, {
    keywordMappingNotApplicable,
  });
  const rawSignalGate = asCleanString(reviewGateSummary?.signalGate);
  const signalGate =
    typeof screenshotEvidenceGapCount === 'number' &&
    screenshotEvidenceGapCount > 0 &&
    rawSignalGate !== 'attention_required'
      ? 'attention_required'
      : rawSignalGate;

  return {
    visibleBeforeApproval,
    reviewContextLabels,
    reviewContextComplete,
    signalGroupsRequired,
    signalGroupLabels,
    screenshotEvidenceRequired,
    screenshotEvidenceVisible,
    pricingEvidenceRequired,
    pricingEvidenceVisible,
    signalPreviewStatus: asCleanString(signalPreviewAudit?.status) || 'unknown',
    ...(asCleanString(signalPreviewAudit?.message)
      ? { signalPreviewMessage: asCleanString(signalPreviewAudit.message) }
      : {}),
    missingSignalGroups: missingGroups,
    missingSignalGroupLabels,
    reviewGateReady: reviewGateSummary?.ready === true,
    signalGate,
    keywordMappingNotApplicableCount,
    missingKeywordMappingCount,
    missingRationaleCount,
    noWarningsReportedCount,
    targetsNeedingAttentionCount,
    ...(typeof screenshotEvidenceGapCount === 'number' ? { screenshotEvidenceGapCount } : {}),
    signalGapSummaryLine,
    ...(screenshotEvidenceBreakdownLine ? { screenshotEvidenceBreakdownLine } : {}),
    ...(signalGapSummary
      ? {
          signalGapSummary: {
            keywordMappingNotApplicableCount,
            missingKeywordMappingCount:
              typeof signalGapSummary.missingKeywordMappingCount === 'number'
                ? signalGapSummary.missingKeywordMappingCount
                : 0,
            missingRationaleCount:
              typeof signalGapSummary.missingRationaleCount === 'number'
                ? signalGapSummary.missingRationaleCount
                : 0,
            noWarningsReportedCount:
              typeof signalGapSummary.noWarningsReportedCount === 'number'
                ? signalGapSummary.noWarningsReportedCount
                : 0,
            screenshotEvidenceGapCount:
              typeof signalGapSummary.screenshotEvidenceGapCount === 'number'
                ? signalGapSummary.screenshotEvidenceGapCount
                : 0,
            ...(typeof screenshotMissingTargetCount === 'number'
              ? { screenshotMissingTargetCount }
              : {}),
            ...(typeof screenshotFallbackOnlyTargetCount === 'number'
              ? { screenshotFallbackOnlyTargetCount }
              : {}),
            ...(typeof screenshotContextOnlyTargetCount === 'number'
              ? { screenshotContextOnlyTargetCount }
              : {}),
            ...(typeof screenshotStrongEvidenceTargetCount === 'number'
              ? { screenshotStrongEvidenceTargetCount }
              : {}),
            ...(typeof screenshotWeakEvidenceTargetCount === 'number'
              ? { screenshotWeakEvidenceTargetCount }
              : {}),
            targetsNeedingAttentionCount:
              typeof signalGapSummary.targetsNeedingAttentionCount === 'number'
                ? signalGapSummary.targetsNeedingAttentionCount
                : 0,
            allTargetsHaveReviewSignals: signalGapSummary.allTargetsHaveReviewSignals === true,
          },
        }
      : {}),
    ...(typeof screenshotMissingTargetCount === 'number'
      ? { screenshotMissingTargetCount }
      : {}),
    ...(typeof screenshotFallbackOnlyTargetCount === 'number'
      ? { screenshotFallbackOnlyTargetCount }
      : {}),
    ...(typeof screenshotContextOnlyTargetCount === 'number'
      ? { screenshotContextOnlyTargetCount }
      : {}),
    ...(typeof screenshotStrongEvidenceTargetCount === 'number'
      ? { screenshotStrongEvidenceTargetCount }
      : {}),
    ...(typeof screenshotWeakEvidenceTargetCount === 'number'
      ? { screenshotWeakEvidenceTargetCount }
      : {}),
    allTargetsHaveReviewSignals: signalAudit?.allTargetsHaveReviewSignals === true,
    ...(signalGapConsent
      ? {
          signalGapConsent: {
            required: signalGapConsent.required === true,
            granted: signalGapConsent.granted === true,
            humanOnly: signalGapConsent.humanOnly === true,
            consentField: asCleanString(signalGapConsent.consentField),
            cliFlag: asCleanString(signalGapConsent.cliFlag),
            reasons: Array.isArray(signalGapConsent.reasons)
              ? signalGapConsent.reasons.map(asCleanString).filter(Boolean)
              : [],
            ...(isRecord(signalGapConsent.signalAudit)
              ? { signalAudit: signalGapConsent.signalAudit }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(signalGapConsent, 'reviewGateSummary')
              ? {
                  reviewGateSummary: isRecord(signalGapConsent.reviewGateSummary)
                    ? signalGapConsent.reviewGateSummary
                    : null,
                }
              : {}),
            ...(asCleanString(signalGapConsent.agentInstruction)
              ? { agentInstruction: asCleanString(signalGapConsent.agentInstruction) }
              : {}),
          },
          signalGapConsentRequired: signalGapConsent.required === true,
          signalGapConsentGranted: signalGapConsent.granted === true,
          signalGapConsentReasons: Array.isArray(signalGapConsent.reasons)
            ? signalGapConsent.reasons.map(asCleanString).filter(Boolean)
            : [],
        }
      : {}),
    postApprovalHumanOnly: evidence.postApprovalHumanOnly === true,
    protectedActionsRemainHumanOnly: evidence.protectedActionsRemainHumanOnly === true,
    consentRequiredBeforeExternalMutation: evidence.consentRequiredBeforeExternalMutation === true,
  };
}

function withApprovalReceiptPostApprovalGuidance(payload) {
  if (!isRecord(payload)) return payload;
  const approvalReceipt = isRecord(payload.approvalReceipt) ? payload.approvalReceipt : null;
  const postApproval = isRecord(approvalReceipt?.postApproval) ? approvalReceipt.postApproval : null;
  if (!approvalReceipt || !postApproval) return payload;
  const approvalHistory = approvalReceiptHistory(payload);
  const approvalHistoryCount = approvalHistory.length;
  const humanReviewEvidenceSummary = approvalReceiptHumanReviewEvidenceSummary(approvalReceipt);
  const protectedActionBoundary = asCleanString(
    approvalReceipt.protectedActionBoundary || postApproval.protectedActionBoundary,
  ) || null;
  const postApprovalPaths = Array.isArray(postApproval.paths)
    ? postApprovalPathItems(postApproval.paths)
    : [];
  const postApprovalMonetizationBoundaries = postApprovalPathMonetizationBoundaries(postApprovalPaths);
  const nextPostApproval = {
    ...postApproval,
    ...(protectedActionBoundary ? { protectedActionBoundary } : {}),
    ...(Array.isArray(postApproval.commands)
      ? { commands: commandHandoffItems(postApproval.commands, 'post_approval', { humanOnly: true }) }
      : {}),
    ...(postApprovalPaths.length ? { paths: postApprovalPaths } : {}),
    ...(postApprovalMonetizationBoundaries.length
      ? { monetizationBoundaries: postApprovalMonetizationBoundaries }
      : {}),
  };
  return {
    ...payload,
    ...(humanReviewEvidenceSummary ? { humanReviewEvidenceSummary } : {}),
    ...(approvalHistoryCount ? { approvalReceiptHistory: approvalHistory } : {}),
    ...(approvalHistoryCount ? { approvalReceiptHistoryCount: approvalHistoryCount } : {}),
    approvalReceipt: {
      ...approvalReceipt,
      ...(protectedActionBoundary ? { protectedActionBoundary } : {}),
      postApproval: nextPostApproval,
    },
  };
}

function approvalReceiptSummaryFromReceipt(receipt) {
  if (!isRecord(receipt)) return null;
  const decisionSummary = isRecord(receipt.decisionSummary) ? receipt.decisionSummary : null;
  return {
    kind: asCleanString(receipt.kind),
    reviewKind: asCleanString(receipt.reviewKind),
    ...(asCleanString(receipt.surface) ? { surface: asCleanString(receipt.surface) } : {}),
    jobId: asCleanString(receipt.jobId),
    proposalId: asCleanString(receipt.proposalId),
    approvedAt: asCleanString(receipt.approvedAt),
    humanApprovalConsent: receipt.humanApprovalConsent === true,
    ...(decisionSummary
      ? {
          decisionSummary: {
            totalTargets: typeof decisionSummary.totalTargets === 'number' ? decisionSummary.totalTargets : 0,
            reviewedTargets: typeof decisionSummary.reviewedTargets === 'number' ? decisionSummary.reviewedTargets : 0,
            pendingTargets: typeof decisionSummary.pendingTargets === 'number' ? decisionSummary.pendingTargets : 0,
            savedDecisionCount:
              typeof decisionSummary.savedDecisionCount === 'number' ? decisionSummary.savedDecisionCount : 0,
          },
        }
      : {}),
  };
}

function approvalReceiptHistory(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.approvalReceipts)) return [];
  return payload.approvalReceipts
    .map(approvalReceiptSummaryFromReceipt)
    .filter((receipt) => receipt && receipt.kind && receipt.jobId);
}

const metadataAppInfoFieldMap = new Map([
  ['title', 'name'],
  ['name', 'name'],
  ['subtitle', 'subtitle'],
  ['privacyPolicyUrl', 'privacyPolicyUrl'],
  ['privacyChoicesUrl', 'privacyChoicesUrl'],
  ['privacyPolicyText', 'privacyPolicyText'],
]);

const metadataVersionFieldMap = new Map([
  ['description', 'description'],
  ['keywords', 'keywords'],
  ['promotionalText', 'promotionalText'],
  ['marketingUrl', 'marketingUrl'],
  ['supportUrl', 'supportUrl'],
  ['whatsNew', 'whatsNew'],
  ['releaseNotes', 'whatsNew'],
]);

function metadataExportValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function reviewValueToText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function isHumanEditedFinal(proposedValue, finalValue) {
  return reviewValueToText(proposedValue).trim() !== reviewValueToText(finalValue).trim();
}

function screenshotReviewLocaleRef(locale) {
  return JSON.stringify(['screenshot-locale', asCleanString(locale) ?? '']);
}

function screenshotReviewFrameRef(locale, frameId) {
  return JSON.stringify(['screenshot-frame', asCleanString(locale) ?? '', asCleanString(frameId) ?? '']);
}

function screenshotReviewLayerRef(locale, frameId, layerId) {
  return JSON.stringify([
    'screenshot',
    asCleanString(locale) ?? '',
    asCleanString(frameId) ?? '',
    asCleanString(layerId) ?? '',
  ]);
}

function fieldReviewTargetRef(target) {
  const record = isRecord(target) ? target : {};
  return JSON.stringify([
    asCleanString(record.surface),
    asCleanString(record.locale),
    asCleanString(record.field),
    asCleanString(record.entityId) || asCleanString(record.productId),
    asCleanString(record.territoryId) || asCleanString(record.territory),
  ]);
}

function summarizeScreenshotApplyPlanForHuman(applyPlan) {
  const changes = Array.isArray(applyPlan?.changes) ? applyPlan.changes : [];
  const signalPreview = applyPlanSignalPreview(changes);
  if (isRecord(applyPlan?.reviewSummary)) {
    return {
      ...applyPlan.reviewSummary,
      ...signalPreview,
    };
  }

  const skipped = isRecord(applyPlan?.skipped) ? applyPlan.skipped : {};
  const rejectedLocaleCount = Array.isArray(skipped.rejectedLocales) ? skipped.rejectedLocales.length : 0;
  const rejectedFrameCount = Array.isArray(skipped.rejectedFrames) ? skipped.rejectedFrames.length : 0;
  const rejectedLayerCount = Array.isArray(skipped.rejectedLayers) ? skipped.rejectedLayers.length : 0;
  const frameRefs = Array.from(
    new Set(changes.map((change) => screenshotReviewFrameRef(change?.locale, change?.frameId))),
  );
  const layerRefs = changes.map((change) =>
    screenshotReviewLayerRef(change?.locale, change?.frameId, change?.layerId),
  );
  const rejectedLocaleRefs = Array.isArray(skipped.rejectedLocales)
    ? skipped.rejectedLocales.map(screenshotReviewLocaleRef)
    : [];
  const rejectedFrameRefs = Array.isArray(skipped.rejectedFrames)
    ? skipped.rejectedFrames.map((target) => screenshotReviewFrameRef(target?.locale, target?.frameId))
    : [];
  const rejectedLayerRefs = Array.isArray(skipped.rejectedLayers)
    ? skipped.rejectedLayers.map((target) =>
        screenshotReviewLayerRef(target?.locale, target?.frameId, target?.layerId),
      )
    : [];

  return {
    changeCount: changes.length,
    humanEditedCount: changes.filter((change) =>
      isHumanEditedFinal(change?.proposedText, change?.finalText),
    ).length,
    assignedKeywordCount: uniqueReviewSignalCount(changes.map((change) => change?.assignedKeywords)),
    unassignedKeywordCount: uniqueReviewSignalCount(
      changes.map((change) => change?.unassignedKeywords),
    ),
    warningCount: uniqueReviewSignalCount(changes.map((change) => change?.warnings)),
    rationaleCount: changes.filter((change) => asCleanString(change?.rationale)).length,
    skippedTargetCount: rejectedLocaleCount + rejectedFrameCount + rejectedLayerCount,
    rejectedLocaleCount,
    rejectedFrameCount,
    rejectedLayerCount,
    frameRefs,
    layerRefs,
    rejectedLocaleRefs,
    rejectedFrameRefs,
    rejectedLayerRefs,
    ...signalPreview,
  };
}

function summarizeFieldApplyPlanForHuman(applyPlan) {
  const changes = Array.isArray(applyPlan?.changes) ? applyPlan.changes : [];
  const signalPreview = applyPlanSignalPreview(changes);
  if (isRecord(applyPlan?.reviewSummary)) {
    return {
      ...applyPlan.reviewSummary,
      ...signalPreview,
    };
  }

  const skipped = Array.isArray(applyPlan?.skipped) ? applyPlan.skipped : [];
  const targetRefs = changes.map((change) => fieldReviewTargetRef(change?.target));
  const skippedTargetRefs = skipped.map(fieldReviewTargetRef);

  return {
    changeCount: changes.length,
    humanEditedCount: changes.filter((change) =>
      isHumanEditedFinal(change?.proposedValue, change?.finalValue),
    ).length,
    assignedKeywordCount: uniqueReviewSignalCount(changes.map((change) => change?.assignedKeywords)),
    unassignedKeywordCount: uniqueReviewSignalCount(
      changes.map((change) => change?.unassignedKeywords),
    ),
    warningCount: uniqueReviewSignalCount(changes.map((change) => change?.warnings)),
    rationaleCount: changes.filter((change) => asCleanString(change?.rationale)).length,
    skippedTargetCount: skipped.length,
    targetRefs,
    skippedTargetRefs,
    surface: applyPlan?.surface,
    ...signalPreview,
  };
}

function protectedActionsForPostApprovalHandoff(action) {
  if (action === 'screenshot_apply_plan') {
    return [
      'apply',
      'status',
      'submit',
      'figma_apply',
      'screenshot_upload',
      'screenshot_publish',
      'app_store_upload',
      'app_store_submit',
      'app_store_publish',
    ];
  }
  if (action === 'screenshot_status') {
    return ['status', 'screenshot_upload', 'screenshot_publish', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_metadata_files') {
    return ['export', 'metadata_push', 'metadata_publish', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_apply_drafts') {
    return ['apply', 'metadata_push', 'metadata_publish', 'status', 'submit', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_apply_keywords') {
    return ['apply', 'keyword_apply', 'status'];
  }
  if (action === 'field_pricing_payload') {
    return ['export', 'pricing_schedule', 'pricing_publish', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_submit_metadata') {
    return ['submit', 'metadata_push', 'metadata_publish', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_submit_pricing') {
    return ['submit', 'pricing_schedule', 'pricing_publish', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  if (action === 'field_status') {
    return ['status', 'apply', 'submit', 'app_store_upload', 'app_store_submit', 'app_store_publish'];
  }
  return [
    'apply',
    'export',
    'status',
    'submit',
    'metadata_push',
    'metadata_publish',
    'keyword_apply',
    'pricing_schedule',
    'pricing_publish',
    'app_store_upload',
    'app_store_submit',
    'app_store_publish',
  ];
}

function humanOnlyPostApprovalHandoff(action, notes = []) {
  const protectedActions = protectedActionsForPostApprovalHandoff(action);
  return {
    humanOnly: true,
    usesHumanFinalValues: true,
    valueSource: 'approved_human_decisions',
    phase: 'post_approval',
    action,
    protectedActionsAllowed: true,
    postApprovalActionAllowed: true,
    humanOnlyExecutionScope: 'dashboard_or_cli_after_explicit_human_consent',
    protectedActionsExecutableByAgent: false,
    protectedActionsExecutableByMcp: false,
    postApprovalRunbookExecutionAllowedInMcp: false,
    ...(protectedActions.includes('figma_apply') ? { figmaApplyAllowed: true } : {}),
    ...(protectedActions.includes('metadata_push') ? { metadataApplyAllowed: true } : {}),
    ...(protectedActions.includes('keyword_apply') ? { keywordApplyAllowed: true } : {}),
    ...(protectedActions.includes('pricing_schedule') ? { pricingScheduleAllowed: true } : {}),
    ...(protectedActions.includes('pricing_schedule') && protectedActions.includes('export')
      ? { pricingExportAllowed: true }
      : {}),
    ...(protectedActions.includes('screenshot_upload') ? { screenshotUploadAllowed: true } : {}),
    ...(protectedActions.includes('screenshot_publish') ? { screenshotPublishAllowed: true } : {}),
    ...(protectedActions.includes('app_store_upload') ? { appStoreUploadAllowed: true } : {}),
    ...(protectedActions.includes('app_store_submit') ? { appStoreSubmitAllowed: true } : {}),
    ...(protectedActions.includes('app_store_publish') ? { appStorePublishAllowed: true } : {}),
    humanApprovalConsentGranted: true,
    applyPlanFingerprintRequiredForPostApproval: true,
    applyPlanFingerprintFlag: '--expected-apply-plan-fingerprint',
    applyPlanFingerprintGuidance:
      'Use the approved applyPlanFingerprint from the human-reviewed apply plan when running post-approval apply, export, submit, or status commands.',
    protectedActionBoundary: LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY,
    postApprovalPathsHumanOnly: true,
    protectedActions,
    agentInstruction:
      'Do not run apply, export, status, pricing schedule, metadata push, keyword apply, or App Store upload/submit commands from an autonomous agent pass. Hand this output to the human review workflow.',
    notes: [
      'Post-approval output uses human final values from accepted or edited decisions, not raw agent proposals.',
      ...notes,
    ],
  };
}

function humanOnlyReviewRejectionHandoff(action, notes = []) {
  return {
    humanOnly: true,
    usesHumanFinalValues: false,
    valueSource: 'human_rejection_decision',
    phase: 'review_rejection',
    action,
    protectedActionsAllowed: true,
    rejectionActionAllowed: true,
    humanRejectionConsentGranted: true,
    applyPlanFingerprintRequiredForPostApproval: false,
    protectedActionBoundary: LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY,
    protectedActions: ['review_rejection'],
    agentInstruction:
      'Do not reject reviews from an autonomous agent pass. Rejection requires an explicit human review/consent action and does not apply, export, submit, schedule, or mark approved changes.',
    notes: [
      'Review rejection records an explicit human rejection decision only; it is not a post-approval apply/export/submit/status handoff.',
      ...notes,
    ],
  };
}

function compactPostApprovalReviewSummary(receipt, fallbackReviewSummary) {
  const summary = isRecord(receipt?.reviewSummary)
    ? receipt.reviewSummary
    : isRecord(fallbackReviewSummary)
      ? fallbackReviewSummary
      : null;
  if (!summary) return null;

  const compact = {};
  const surface = asCleanString(summary.surface);
  if (surface) compact.surface = surface;

  const numericFields = [
    'changeCount',
    'humanEditedCount',
    'assignedKeywordCount',
    'unassignedKeywordCount',
    'warningCount',
    'rationaleCount',
    'skippedTargetCount',
    'rejectedLocaleCount',
    'rejectedFrameCount',
    'rejectedLayerCount',
    'skippedLocaleCount',
    'skippedFieldCount',
    'skippedTerritoryCount',
    'skippedEntityCount',
  ];
  for (const field of numericFields) {
    const value = summary[field];
    if (typeof value === 'number' && Number.isFinite(value)) compact[field] = value;
  }

  const arrayCountFields = [
    ['frameRefs', 'frameCount'],
    ['layerRefs', 'layerCount'],
    ['rejectedLocaleRefs', 'rejectedLocaleCount'],
    ['rejectedFrameRefs', 'rejectedFrameCount'],
    ['rejectedLayerRefs', 'rejectedLayerCount'],
  ];
  for (const [sourceField, targetField] of arrayCountFields) {
    if (typeof compact[targetField] === 'number') continue;
    const value = summary[sourceField];
    if (Array.isArray(value)) compact[targetField] = value.length;
  }

  return Object.keys(compact).length ? compact : null;
}

function postApprovalReceiptSummaryFromReceipt(receipt, fallbackReviewSummary) {
  if (!isRecord(receipt)) return null;
  const applyPlanFingerprint = asCleanString(receipt.applyPlanFingerprint);
  const expectedApplyPlanFingerprint = asCleanString(receipt.expectedApplyPlanFingerprint);
  const fingerprintStatus = !expectedApplyPlanFingerprint
    ? 'missing_expected'
    : !applyPlanFingerprint
      ? 'missing_recorded'
      : applyPlanFingerprint === expectedApplyPlanFingerprint
      ? 'matched'
      : 'mismatched';
  const reviewSummary = compactPostApprovalReviewSummary(receipt, fallbackReviewSummary);
  const humanReviewEvidenceSummary = approvalReceiptHumanReviewEvidenceSummary({
    humanReviewEvidence: receipt.humanReviewEvidence,
  });
  return {
    kind: asCleanString(receipt.kind),
    status: asCleanString(receipt.status),
    jobId: asCleanString(receipt.jobId),
    appId: asCleanString(receipt.appId),
    ...(asCleanString(receipt.surface) ? { surface: asCleanString(receipt.surface) } : {}),
    ...(asCleanString(receipt.fileKey) ? { fileKey: asCleanString(receipt.fileKey) } : {}),
    proposalId: asCleanString(receipt.proposalId),
    proposalVersion: typeof receipt.proposalVersion === 'number' ? receipt.proposalVersion : null,
    ...(asCleanString(receipt.recordedAt) ? { recordedAt: asCleanString(receipt.recordedAt) } : {}),
    applyPlanFingerprint,
    expectedApplyPlanFingerprint,
    fingerprintMatched: Boolean(
      applyPlanFingerprint &&
      expectedApplyPlanFingerprint &&
      applyPlanFingerprint === expectedApplyPlanFingerprint,
    ),
    fingerprintStatus,
    source: asCleanString(receipt.source),
    humanPostApprovalConsent: receipt.humanPostApprovalConsent === true,
    postApprovalHumanOnly: receipt.postApprovalHumanOnly === true,
    protectedActionsRemainHumanOnly: receipt.protectedActionsRemainHumanOnly === true,
    protectedActionBoundary: asCleanString(receipt.protectedActionBoundary),
    ...(reviewSummary ? { reviewSummary } : {}),
    ...(humanReviewEvidenceSummary ? { humanReviewEvidenceSummary } : {}),
  };
}

function postApprovalReceiptSummary(payload, fallbackReviewSummary) {
  if (!isRecord(payload)) return null;
  const receipt = isRecord(payload.postApprovalReceipt) ? payload.postApprovalReceipt : null;
  if (!receipt) return null;
  const reviewSummary = isRecord(fallbackReviewSummary) ? fallbackReviewSummary : payload.reviewSummary;
  return postApprovalReceiptSummaryFromReceipt(receipt, reviewSummary);
}

function postApprovalReceiptHistory(payload, fallbackReviewSummary) {
  if (!isRecord(payload) || !Array.isArray(payload.postApprovalReceipts)) return [];
  const reviewSummary = isRecord(fallbackReviewSummary) ? fallbackReviewSummary : payload.reviewSummary;
  return payload.postApprovalReceipts
    .map((receipt) => postApprovalReceiptSummaryFromReceipt(receipt, reviewSummary))
    .filter((receipt) => receipt && receipt.kind && receipt.jobId);
}

function keywordApplySummary(payload) {
  if (!isRecord(payload)) return null;
  const summary = isRecord(payload.keywordApplySummary) ? payload.keywordApplySummary : null;
  if (summary) return structuredClone(summary);

  const appliedKeywords = Array.isArray(payload.appliedKeywords) ? payload.appliedKeywords : [];
  const removedKeywords = Array.isArray(payload.removedKeywords) ? payload.removedKeywords : [];
  const skippedTargets = Array.isArray(payload.skippedTargets) ? payload.skippedTargets : [];
  if (!appliedKeywords.length && !removedKeywords.length && !skippedTargets.length) return null;

  const localeFrom = (entry) => (isRecord(entry) ? asCleanString(entry.locale) : '');
  const appliedLocales = Array.from(new Set(appliedKeywords.map(localeFrom).filter(Boolean))).sort();
  const removedLocales = Array.from(new Set(removedKeywords.map(localeFrom).filter(Boolean))).sort();
  const preview = (entries) =>
    entries.slice(0, 5).filter(isRecord).map((entry) => ({
      locale: asCleanString(entry.locale),
      keyword: asCleanString(entry.keyword),
      ...(isRecord(entry.target) ? { target: structuredClone(entry.target) } : {}),
    }));
  return {
    appliedKeywordCount: appliedKeywords.length,
    removedKeywordCount: removedKeywords.length,
    skippedTargetCount: skippedTargets.length,
    affectedLocaleCount: new Set([...appliedLocales, ...removedLocales]).size,
    appliedLocales,
    removedLocales,
    appliedPreview: preview(appliedKeywords),
    removedPreview: preview(removedKeywords),
    skippedTargetPreview: skippedTargets.slice(0, 5).map((entry) => structuredClone(entry)),
  };
}

function withHumanOnlyPostApprovalHandoff(payload, action, notes = [], reviewSummary) {
  if (!isRecord(payload)) return payload;
  const humanReviewEvidenceSummary = isRecord(payload.humanReviewEvidence)
    ? approvalReceiptHumanReviewEvidenceSummary({ humanReviewEvidence: payload.humanReviewEvidence })
    : null;
  const receiptSummary = postApprovalReceiptSummary(payload, reviewSummary);
  const receiptHistory = postApprovalReceiptHistory(payload, reviewSummary);
  const receiptHistoryCount = receiptHistory.length;
  const keywordSummary = action === 'field_apply_keywords' ? keywordApplySummary(payload) : null;
  return {
    ...payload,
    ...(reviewSummary ? { reviewSummary } : {}),
    ...(humanReviewEvidenceSummary ? { humanReviewEvidenceSummary } : {}),
    ...(receiptSummary ? { postApprovalReceiptSummary: receiptSummary } : {}),
    ...(receiptHistoryCount ? { postApprovalReceiptHistory: receiptHistory } : {}),
    ...(receiptHistoryCount ? { postApprovalReceiptHistoryCount: receiptHistoryCount } : {}),
    ...(keywordSummary ? { keywordApplySummary: keywordSummary } : {}),
    handoffSafety: {
      ...humanOnlyPostApprovalHandoff(action, notes),
      ...(receiptSummary
        ? {
            postApprovalReceiptRecorded: true,
            postApprovalReceiptSummary: receiptSummary,
            ...(receiptHistoryCount ? { postApprovalReceiptHistoryCount: receiptHistoryCount } : {}),
          }
        : {}),
      ...(keywordSummary ? { keywordApplySummary: keywordSummary } : {}),
    },
  };
}

function withHumanOnlyReviewRejectionHandoff(payload, action, notes = [], reviewSummary) {
  if (!isRecord(payload)) return payload;
  return {
    ...payload,
    ...(reviewSummary ? { reviewSummary } : {}),
    handoffSafety: humanOnlyReviewRejectionHandoff(action, notes),
  };
}

function withScreenshotApplyPlanHumanCommands(applyPlan) {
  if (!isRecord(applyPlan)) return applyPlan;
  const jobId = asCleanString(applyPlan.jobId);
  const appId = asCleanString(applyPlan.appId);
  const fileKey = asCleanString(applyPlan.fileKey);
  const applyPlanFingerprint = asCleanString(applyPlan.applyPlanFingerprint);
  if (!jobId || !appId || !fileKey || !applyPlanFingerprint) return applyPlan;
  const proposalId = asCleanString(applyPlan.proposalId);
  const proposalVersion =
    typeof applyPlan.proposalVersion === 'number' && Number.isInteger(applyPlan.proposalVersion)
      ? applyPlan.proposalVersion
      : null;

  const base =
    `pnpm review:agent status ${shellQuote(jobId)} --app-id ${shellQuote(appId)} --file-key ${shellQuote(fileKey)}`;
  const fingerprintGuard =
    ` --expected-apply-plan-fingerprint ${shellQuote(applyPlanFingerprint)}`;
  const approvedProposalGuard =
    proposalId && proposalVersion
      ? ` --approved-screenshot-review-proposal-id ${shellQuote(proposalId)} --approved-screenshot-review-proposal-version ${shellQuote(String(proposalVersion))}`
      : '';
  return {
    ...applyPlan,
    expectedApplyPlanFingerprint: applyPlanFingerprint,
    commands: {
      ...(isRecord(applyPlan.commands) ? applyPlan.commands : {}),
      markApplied: `${base} --status applied${approvedProposalGuard}${fingerprintGuard} --human-post-approval-consent`,
      markSubmitted: `${base} --status submitted${approvedProposalGuard}${fingerprintGuard} --human-post-approval-consent`,
    },
    localizeAsoStatusCommands: {
      markApplied: `${base} --status applied${approvedProposalGuard}${fingerprintGuard} --human-post-approval-consent`,
      markSubmitted: `${base} --status submitted${approvedProposalGuard}${fingerprintGuard} --human-post-approval-consent`,
    },
  };
}

function withFieldApplyPlanHumanCommands(applyPlan) {
  if (!isRecord(applyPlan)) return applyPlan;
  const jobId = asCleanString(applyPlan.jobId);
  const appId = asCleanString(applyPlan.appId);
  const surface = asCleanString(applyPlan.surface);
  const applyPlanFingerprint = asCleanString(applyPlan.applyPlanFingerprint);
  if (!jobId || !appId || !surface || !applyPlanFingerprint) return applyPlan;
  const proposalId = asCleanString(applyPlan.proposalId);
  const proposalVersion =
    typeof applyPlan.proposalVersion === 'number' && Number.isInteger(applyPlan.proposalVersion)
      ? applyPlan.proposalVersion
      : null;

  const appGuard = ` --app-id ${shellQuote(appId)}`;
  const fingerprintGuard =
    ` --expected-apply-plan-fingerprint ${shellQuote(applyPlanFingerprint)}`;
  const approvedProposalGuard =
    proposalId && proposalVersion
      ? ` --approved-field-review-proposal-id ${shellQuote(proposalId)} --approved-field-review-proposal-version ${shellQuote(String(proposalVersion))}`
      : '';
  const postApprovalConsent = ' --human-post-approval-consent';
  const commands = { ...(isRecord(applyPlan.commands) ? applyPlan.commands : {}) };
  const localizeAsoStatusCommands = {};

  if (surface === 'metadata') {
    commands.applyDrafts =
      `pnpm review:agent field-apply-drafts ${shellQuote(jobId)}${appGuard}${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
    commands.submitMetadata =
      `pnpm review:agent field-submit-metadata ${shellQuote(jobId)}${appGuard} --platform IOS${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
  } else if (surface === 'keywords') {
    commands.applyKeywords =
      `pnpm review:agent field-apply-keywords ${shellQuote(jobId)}${appGuard}${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
  } else if (surface === 'pricing') {
    commands.pricingPayload =
      `pnpm review:agent field-pricing-payload ${shellQuote(jobId)}${appGuard}${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent} --out pricing-payload.json --asc-csv-out pricing-payload.csv`;
    commands.submitPricing =
      `pnpm review:agent field-submit-pricing ${shellQuote(jobId)}${appGuard} --start-date YYYY-MM-DD${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
  }

  if (surface === 'metadata' || surface === 'keywords') {
    localizeAsoStatusCommands.markApplied =
      `pnpm review:agent field-status ${shellQuote(jobId)}${appGuard} --status applied${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
    commands.markApplied = localizeAsoStatusCommands.markApplied;
  }
  localizeAsoStatusCommands.markSubmitted =
    `pnpm review:agent field-status ${shellQuote(jobId)}${appGuard} --status submitted${approvedProposalGuard}${fingerprintGuard}${postApprovalConsent}`;
  commands.markSubmitted = localizeAsoStatusCommands.markSubmitted;

  return {
    ...applyPlan,
    expectedApplyPlanFingerprint: applyPlanFingerprint,
    commands,
    localizeAsoStatusCommands,
  };
}

async function writeMetadataJsonFiles(rootDir, segment, version, filesByLocale) {
  const written = [];
  for (const [locale, fields] of filesByLocale.entries()) {
    const dir = segment === 'version'
      ? path.join(rootDir, 'version', version)
      : path.join(rootDir, 'app-info');
    const filePath = path.join(dir, `${locale}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(fields, null, 2)}\n`, 'utf8');
    written.push(filePath);
  }
  return written;
}

async function exportFieldMetadataFiles(applyPlan, flags) {
  const outDir = typeof flags.dir === 'string' && flags.dir.trim() ? flags.dir.trim() : '';
  if (!outDir) throw new Error('Provide --dir <metadata-dir> for field-metadata-files.');
  if (applyPlan.surface !== 'metadata') {
    throw new Error('field-metadata-files only supports metadata field review apply plans.');
  }

  const version = typeof flags.version === 'string' && flags.version.trim()
    ? flags.version.trim()
    : 'VERSION';
  const platform = typeof flags.platform === 'string' && flags.platform.trim()
    ? flags.platform.trim()
    : 'IOS';
  const appInfoByLocale = new Map();
  const versionByLocale = new Map();
  const skipped = [];

  for (const change of applyPlan.changes ?? []) {
    const target = change.target ?? {};
    if (target.surface !== 'metadata') {
      skipped.push({ target, reason: 'not_metadata' });
      continue;
    }
    if (!target.locale || !target.field) {
      skipped.push({ target, reason: 'missing_locale_or_field' });
      continue;
    }

    const field = String(target.field);
    const locale = String(target.locale);
    const appInfoField = metadataAppInfoFieldMap.get(field);
    const versionField = metadataVersionFieldMap.get(field);
    if (!appInfoField && !versionField) {
      skipped.push({ target, reason: 'unsupported_asc_metadata_field' });
      continue;
    }

    const destination = appInfoField ? appInfoByLocale : versionByLocale;
    const outputField = appInfoField ?? versionField;
    const fields = destination.get(locale) ?? {};
    fields[outputField] = metadataExportValue(change.finalValue ?? change.proposedValue);
    destination.set(locale, fields);
  }

  if (!appInfoByLocale.size && !versionByLocale.size) {
    throw new Error('No approved metadata changes can be exported to asc metadata files.');
  }

  const writtenFiles = [
    ...(await writeMetadataJsonFiles(outDir, 'app-info', version, appInfoByLocale)),
    ...(await writeMetadataJsonFiles(outDir, 'version', version, versionByLocale)),
  ];
  const quotedDir = shellQuote(outDir);
  const quotedApp = shellQuote(applyPlan.appId);
  const quotedJobId = shellQuote(applyPlan.jobId);
  const quotedVersion = shellQuote(version);
  const quotedPlatform = shellQuote(platform);
  const expectedApplyPlanFingerprint =
    typeof applyPlan.applyPlanFingerprint === 'string' && applyPlan.applyPlanFingerprint.trim()
      ? applyPlan.applyPlanFingerprint.trim()
      : '';
  const expectedApplyPlanFingerprintFlag = expectedApplyPlanFingerprint
    ? ` --expected-apply-plan-fingerprint ${shellQuote(expectedApplyPlanFingerprint)}`
    : '';
  const proposalId = asCleanString(applyPlan.proposalId);
  const proposalVersion =
    typeof applyPlan.proposalVersion === 'number' && Number.isInteger(applyPlan.proposalVersion)
      ? applyPlan.proposalVersion
      : null;
  const approvedProposalGuard =
    proposalId && proposalVersion
      ? ` --approved-field-review-proposal-id ${shellQuote(proposalId)} --approved-field-review-proposal-version ${shellQuote(String(proposalVersion))}`
      : '';
  const recordSubmittedCommand =
    `pnpm review:agent field-status ${quotedJobId} --app-id ${quotedApp} --status submitted${approvedProposalGuard}${expectedApplyPlanFingerprintFlag} --human-post-approval-consent`;

  return {
    jobId: applyPlan.jobId,
    proposalId: applyPlan.proposalId,
    appId: applyPlan.appId,
    ...(expectedApplyPlanFingerprint
      ? {
          applyPlanFingerprint: expectedApplyPlanFingerprint,
          expectedApplyPlanFingerprint,
        }
      : {}),
    version,
    platform,
    directory: outDir,
    writtenFiles,
    skippedTargets: skipped,
    reviewSummary: summarizeFieldApplyPlanForHuman(applyPlan),
    ...(isRecord(applyPlan.reviewSignalContract)
      ? { reviewSignalContract: structuredClone(applyPlan.reviewSignalContract) }
      : {}),
    ...(isRecord(applyPlan.humanReviewEvidence)
      ? { humanReviewEvidence: structuredClone(applyPlan.humanReviewEvidence) }
      : {}),
    ...(isRecord(applyPlan.humanReviewEvidence)
      ? {
          humanReviewEvidenceSummary: approvalReceiptHumanReviewEvidenceSummary({
            humanReviewEvidence: applyPlan.humanReviewEvidence,
          }),
        }
      : {}),
    commands: {
      validate: `asc metadata validate --dir ${quotedDir} --output table`,
      dryRun:
        `asc metadata push --app ${quotedApp} --version ${quotedVersion} --platform ${quotedPlatform} --dir ${quotedDir} --dry-run --output table`,
      push:
        `asc metadata push --app ${quotedApp} --version ${quotedVersion} --platform ${quotedPlatform} --dir ${quotedDir}`,
      recordSubmitted: recordSubmittedCommand,
    },
    localizeAsoStatusCommand: recordSubmittedCommand,
    notes: [
      'Human-only post-approval handoff: inspect files, run validate, then run dry-run before pushing to App Store Connect.',
      'For safest operation, pull canonical metadata first with asc metadata pull and let these files overwrite only approved reviewed fields.',
      'This command writes local files only; it does not mutate LocalizeASO drafts or App Store Connect.',
      'After the human-run asc push succeeds, record submitted status with the fingerprint-protected LocalizeASO status command.',
    ],
    handoffSafety: humanOnlyPostApprovalHandoff('field_metadata_files', [
      'This command wrote local metadata files only.',
      'Run validate and dry-run manually before any App Store Connect push.',
    ]),
  };
}

function keywordCoveragePromptLines(bundle, brief) {
  const coverage = isRecord(bundle?.handoff?.keywordAutomation?.coverage)
    ? bundle.handoff.keywordAutomation.coverage
    : null;
  if (!coverage) {
    const missingKeywordLocales = cleanStringArray(brief?.missingKeywordLocales);
    if (!missingKeywordLocales.length) return [];
    return [
      '- Keyword coverage: keyword context is incomplete for this bundle.',
      `- Missing keyword research locales: ${missingKeywordLocales.join(', ')}`,
      '- Recommended before proposal: yes',
    ];
  }

  const lines = [];
  const reason = asCleanString(coverage.reason);
  lines.push(`- Keyword coverage: ${reason || 'coverage status was provided by the backend.'}`);
  lines.push(`- Recommended before proposal: ${coverage.recommended === false ? 'no' : 'yes'}`);

  const targetLocales = cleanStringArray(coverage.targetLocales);
  if (targetLocales.length) {
    lines.push(`- Target locales: ${targetLocales.join(', ')}`);
  }

  const keywordLocales = cleanStringArray(coverage.keywordLocales);
  if (keywordLocales.length) {
    lines.push(`- Keyword research locales available: ${keywordLocales.join(', ')}`);
  }

  const missingLocales = cleanStringArray(coverage.missingLocales);
  lines.push(`- Missing keyword research locales: ${missingLocales.length ? missingLocales.join(', ') : 'none'}`);

  return lines;
}

function keywordAutomationPromptLines(bundle, brief) {
  const handoff = isRecord(bundle?.handoff?.keywordAutomation)
    ? bundle.handoff.keywordAutomation
    : {};
  const options = Array.isArray(handoff.automationOptions)
    ? handoff.automationOptions
    : Array.isArray(brief?.automationOptions)
      ? brief.automationOptions
      : [];
  const optionLines = options.map(compactKeywordAutomationOption).filter(Boolean);
  if (!optionLines.length) return [];

  const lines = [
    'Keyword automation options:',
    ...optionLines,
  ];
  const importAstroCsvToAsoKeywords =
    asCleanString(handoff.importAstroCsvToAsoKeywords) ||
    buildImportAstroCsvToAsoKeywordsCommand(bundle, brief);
  if (importAstroCsvToAsoKeywords) {
    lines.push(
      `Optional persistent Astro CSV import before attach/sync: ${importAstroCsvToAsoKeywords}`,
      'This BYO keyword import/proposal path does not require LocalizeASO App Store Connect credentials.',
      'Persistent ASO keyword inventory import still requires an active LocalizeASO pass with BYO agent/review history access.',
    );
  }
  const fetchBundleAfterAttach = asCleanString(handoff.fetchBundleAfterAttach);
  if (fetchBundleAfterAttach) {
    lines.push(`After attaching keyword context, fetch a fresh bundle: ${fetchBundleAfterAttach}`);
  }
  return lines;
}

function buildImportAstroCsvToAsoKeywordsCommand(bundle, brief) {
  const appId =
    asCleanString(bundle?.job?.appId) ||
    asCleanString(bundle?.appId) ||
    asCleanString(brief?.job?.appId);
  if (!appId) return '';
  return `pnpm localizeaso keywords import-csv ${shellQuote(appId)} --file optional-auto --astro-dir .`;
}

function generatedKeywordAutomationSteps(bundle, brief, kind) {
  const jobId = asCleanString(bundle?.job?.id) || asCleanString(brief?.job?.id);
  const surface = kind === 'field' ? asCleanString(bundle?.surface) || asCleanString(bundle?.job?.surface) || 'field' : 'screenshots';
  const cliSurface = keywordAutomationCliSurface(kind, surface);
  const keywordBriefCommand = jobId
    ? `pnpm localizeaso ${cliSurface} keyword-brief ${shellQuote(jobId)} --out keyword-brief.json`
    : kind === 'field'
      ? `pnpm localizeaso ${cliSurface} keyword-brief --bundle field-bundle.json --out keyword-brief.json`
      : 'pnpm localizeaso screenshots keyword-brief --bundle screenshot-bundle.json --out keyword-brief.json';
  const keywordPromptCommand = jobId
    ? `pnpm localizeaso ${cliSurface} keyword-prompt ${shellQuote(jobId)} --out keyword-agent-prompt.md`
    : kind === 'field'
      ? `pnpm localizeaso ${cliSurface} keyword-prompt --brief keyword-brief.json --out keyword-agent-prompt.md`
      : 'pnpm localizeaso screenshots keyword-prompt --brief keyword-brief.json --out keyword-agent-prompt.md';
  const attachCommands = cleanStringArray(brief?.attachCommands);
  const fetchBundleAfterAttach = asCleanString(bundle?.handoff?.keywordAutomation?.fetchBundleAfterAttach) ||
    (jobId
      ? kind === 'field'
        ? `pnpm localizeaso ${cliSurface} bundle ${shellQuote(jobId)} --out field-bundle.json --handoff field-handoff.json`
        : `pnpm localizeaso screenshots bundle ${shellQuote(jobId)} --out screenshot-bundle.json --handoff screenshot-handoff.json`
      : '');
  const agentPromptCommand = jobId
    ? `pnpm localizeaso ${cliSurface} prompt ${shellQuote(jobId)} --out agent-prompt.md`
    : kind === 'field'
      ? `pnpm localizeaso ${cliSurface} prompt --bundle field-bundle.json --out agent-prompt.md`
      : 'pnpm localizeaso screenshots prompt --bundle screenshot-bundle.json --out agent-prompt.md';
  const importAstroCsvToAsoKeywords =
    asCleanString(bundle?.handoff?.keywordAutomation?.importAstroCsvToAsoKeywords) ||
    buildImportAstroCsvToAsoKeywordsCommand(bundle, brief);

  return [
    {
      id: 'inspect_keyword_coverage',
      title: 'Inspect keyword coverage and locale gaps',
      command: keywordBriefCommand,
      output: 'keyword-brief.json',
      safeForAgent: true,
    },
    {
      id: 'export_keyword_prompt',
      title: 'Create a read-only Astro/MCP keyword research prompt',
      command: keywordPromptCommand,
      output: 'keyword-agent-prompt.md',
      safeForAgent: true,
    },
    {
      id: 'run_keyword_research',
      title: 'Run Astro, an MCP keyword agent, or another research tool',
      outputs: ['keyword-context.json', 'astro-keywords.csv or discovered keyword CSV'],
      note: `Return provider-neutral keyword context for ${surface}; do not change review proposals yet.`,
      safeForAgent: true,
    },
    {
      id: 'import_astro_csv_keywords',
      title: 'Optionally persist Astro CSV in LocalizeASO ASO keywords',
      command: importAstroCsvToAsoKeywords,
      note:
        'Use when Astro exported a local keyword CSV and the reviewer wants those rows available in the app keyword inventory. The CLI can discover it with --file optional-auto --astro-dir . and skip safely when no CSV exists. This does not approve, apply, or submit changes.',
      safeForAgent: true,
    },
    {
      id: 'attach_keyword_context',
      title: 'Attach keyword context before proposal generation',
      commands: attachCommands,
      requiredOutputBeforeNextStep: 'keyword-context attached to the review job',
      safeForAgent: true,
    },
    {
      id: 'fetch_fresh_bundle',
      title: 'Fetch a fresh bundle after keyword context is attached',
      command: fetchBundleAfterAttach,
      output: kind === 'field' ? 'field-bundle.json' : 'screenshot-bundle.json',
      safeForAgent: true,
    },
    {
      id: 'generate_review_proposal',
      title: 'Generate a proposal for human review using the fresh bundle',
      command: agentPromptCommand,
      nextAction:
        kind === 'field'
          ? `Write proposal.json and submit it with pnpm localizeaso ${cliSurface} submit <jobId> --file proposal.json. Proposal submit returns the human review handoff; add --open only when the human is ready for a browser window.`
          : 'Write proposal.json and submit it with pnpm localizeaso screenshots submit <jobId> --file proposal.json. Proposal submit returns the human review handoff; add --open only when the human is ready for a browser window.',
      safeForAgent: true,
    },
  ].filter((step) => step.command !== '' || Array.isArray(step.commands) || Array.isArray(step.outputs));
}

function keywordAutomationRunbookFromBundle(bundle, label, kind) {
  if (!isRecord(bundle)) {
    throw new Error(`${label} is missing or invalid.`);
  }

  const brief = kind === 'field' ? buildFieldKeywordBrief(bundle) : buildScreenshotKeywordBrief(bundle);
  const handoff = isRecord(bundle?.handoff?.keywordAutomation) ? bundle.handoff.keywordAutomation : {};
  const briefLocales = Array.isArray(brief.locales) ? brief.locales.filter(isRecord) : [];
  const missingLocales = cleanStringArray(brief.missingKeywordLocales);
  const coverage = isRecord(handoff.coverage)
    ? handoff.coverage
    : {
        targetLocales: briefLocales.map((locale) => asCleanString(locale.locale)).filter(Boolean),
        keywordLocales: briefLocales
          .filter((locale) => !locale.needsKeywordResearch)
          .map((locale) => asCleanString(locale.locale))
          .filter(Boolean),
        missingLocales,
        recommended: missingLocales.length > 0,
        reason: missingLocales.length
          ? `Keyword research is missing for ${missingLocales.join(', ')}.`
          : 'Keyword context is available for all listed locales.',
      };
  const handoffSteps = Array.isArray(handoff.steps) ? handoff.steps.filter(isRecord) : [];
  const steps = handoffSteps.length ? handoffSteps : generatedKeywordAutomationSteps(bundle, brief, kind);

  return {
    kind: 'localizeaso_keyword_automation_runbook',
    surface: kind === 'field' ? asCleanString(bundle.surface) || asCleanString(bundle?.job?.surface) || 'field' : 'screenshots',
    monetizationBoundary: monetizationBoundaryForBundle(bundle, kind === 'field' ? 'field' : 'screenshots'),
    handoffSafety: buildKeywordResearchHandoffSafety(kind, 'keyword_research_automation'),
    job: {
      id: bundle.job?.id,
      appId: bundle.job?.appId ?? bundle.appId,
      appName: bundle.job?.appName ?? bundle.appName,
      status: bundle.job?.status,
      instructions: bundle.job?.instructions,
    },
    recommended: coverage.recommended !== false && cleanStringArray(coverage.missingLocales ?? brief.missingKeywordLocales).length > 0,
    coverage,
    missingKeywordLocales: cleanStringArray(coverage.missingLocales ?? brief.missingKeywordLocales),
    automationOptions: Array.isArray(handoff.automationOptions) ? handoff.automationOptions : brief.automationOptions,
    importAstroCsvToAsoKeywords:
      asCleanString(handoff.importAstroCsvToAsoKeywords) ||
      buildImportAstroCsvToAsoKeywordsCommand(bundle, brief) ||
      undefined,
    researchStrategy: cleanStringArray(handoff.researchStrategy).length
      ? cleanStringArray(handoff.researchStrategy)
      : keywordResearchStrategyLines(kind),
    steps,
    attachCommands: cleanStringArray(brief.attachCommands),
    guardrails: [
      'Run keyword research before proposal generation when coverage is incomplete.',
      'Only attach provider-neutral keyword context or Astro CSV output to the review job.',
      'For new jobs, use start or field-start with --keywords-csv optional-auto and --import-keywords; for existing jobs, import CSV separately, attach keyword context, then fetch a fresh bundle.',
      'BYO keyword research, Astro CSV import, keyword-context attach, and proposal generation do not require LocalizeASO App Store Connect credentials; ASC access is only needed for human-run hosted sync/upload/submit convenience or local asc post-approval handoffs.',
      'Persisting Astro CSV rows into the LocalizeASO ASO keyword inventory still requires an active LocalizeASO pass with BYO agent/review history access.',
      'Do not approve, apply, mark status, schedule pricing, write to Figma, or upload/submit to App Store Connect.',
      'After keyword context is attached, fetch a fresh bundle before generating the final proposal.',
    ],
    keywordContextShape: brief.keywordContextShape,
  };
}

function screenshotContextPromptLines(bundle) {
  const context = isRecord(bundle?.context) ? bundle.context : {};
  const screenshotContext = isRecord(context.screenshotContext) ? context.screenshotContext : null;
  const frames = Array.isArray(screenshotContext?.frames)
    ? screenshotContext.frames.filter(isRecord)
    : [];
  if (!frames.length) return [];

  const locales = Array.from(
    new Set(
      frames
        .map((frame) => asCleanString(frame.locale))
        .filter(Boolean),
    ),
  );

  const source = asCleanString(screenshotContext?.source) || 'field-review context';
  return [
    'Screenshot context:',
    `- ${frames.length} read-only frame preview${frames.length === 1 ? '' : 's'} from ${source}.`,
    locales.length ? `- Preview locales: ${locales.join(', ')}` : '- Preview locales: none specified',
    '- Use context.screenshotContext to judge field-review fit and keyword-to-creative alignment against visible screenshot copy.',
    '- Do not propose screenshot/Figma mutations from this field-review proposal.',
  ];
}

function reviewerFeedbackPromptLines(bundle) {
  const requests = Array.isArray(bundle?.reviewerFeedbackRequests)
    ? bundle.reviewerFeedbackRequests
    : [];
  const snapshotPreviewLimit = 1800;
  const snapshotHasLine = (snapshot, pattern) =>
    snapshot.split(/\r?\n/).some((line) => pattern.test(line.trim()));
  const snapshotHasApplicableScreenshotContext = (snapshot) =>
    snapshotHasLine(snapshot, /^(?:Screenshot context|Screenshot context coverage|Frame preview context|Screenshot evidence):/i) &&
    !snapshotHasLine(snapshot, /^Screenshot context:\s*not-applicable\b/i);
  const reviewerContextSnapshotLines = (request) => {
    const snapshot = asCleanString(request.contextSnapshot);
    if (!snapshot) return [];
    const auditLines = [
      snapshotHasLine(snapshot, /^Signal coverage(?: summary)?:/i)
        ? '  Signal coverage audit: address missing keyword mapping, not-applicable keyword mapping markers, missing rationale, missing warnings, or reviewer-visible signal gaps explicitly in the revised proposal.'
        : '',
      snapshotHasLine(snapshot, /^(?:Pricing evidence|Pricing review context|Pricing evidence coverage|Pricing schedule guard|Schedule warnings|Territory context):/i)
        ? '  Pricing evidence audit: preserve human final prices and address territory context, schedule warnings, and final-value blockers before revising pricing.'
        : '',
      snapshotHasApplicableScreenshotContext(snapshot)
        ? '  Screenshot evidence audit: preserve frame/layer refs and re-check screenshot evidence before revising screenshot or metadata copy.'
        : '',
      snapshotHasLine(snapshot, /^(?:Keyword evidence|Locale keyword research|Assigned keywords|Unassigned keywords):/i)
        ? '  Keyword evidence audit: re-check assigned keywords, unassigned keywords, and keyword research evidence before revising coverage.'
        : '',
    ].filter(Boolean);
    const preview =
      snapshot.length > snapshotPreviewLimit
        ? `${snapshot.slice(0, snapshotPreviewLimit).trimEnd()}\n[LocalizeASO prompt snapshot preview truncated; use the full bundle reviewerFeedbackRequests[].contextSnapshot for complete detail.]`
        : snapshot;
    return [
      '  Review context snapshot:',
      ...preview.split(/\r?\n/).map((line) => `  ${line}`),
      ...auditLines,
    ].filter(Boolean);
  };
  const requestLines = requests
    .filter(isRecord)
    .flatMap((request, index) => {
      const instructions = asCleanString(request.instructions).replace(/\s+/g, ' ');
      if (!instructions) return [];
      const proposalId = asCleanString(request.proposalId);
      const scope = reviewerFeedbackScopeDisplay(request.scope);
      return [
        `- #${index + 1}: ${instructions}`,
        proposalId ? `  Related proposal: ${proposalId}.` : '',
        scope.summary ? `  Scope summary: ${scope.summary}` : '',
        scope.details.length ? '  Scope details:' : '',
        ...scope.details.map((detail) => `  - ${detail}`),
        ...reviewerContextSnapshotLines(request),
      ].filter(Boolean);
    })
    .filter(Boolean);

  const previousFeedbackCount = Array.isArray(bundle?.reviewerFeedback)
    ? bundle.reviewerFeedback.length
    : 0;
  const previousFeedbackLines = Array.isArray(bundle?.reviewerFeedback)
    ? bundle.reviewerFeedback
        .filter(isRecord)
        .slice(0, 12)
        .map((feedback, index) => {
          const decision = asCleanString(feedback.decision) || 'unknown';
          const target = JSON.stringify(feedback.target ?? {});
          const finalValue =
            feedback.finalValue !== undefined
              ? feedback.finalValue
              : feedback.finalText !== undefined
                ? feedback.finalText
                : feedback.editedValue !== undefined
                  ? feedback.editedValue
                  : feedback.editedText !== undefined
                    ? feedback.editedText
                    : undefined;
          const proposedValue =
            feedback.proposedValue !== undefined
              ? feedback.proposedValue
              : feedback.proposedText !== undefined
                ? feedback.proposedText
                : undefined;
          const note = asCleanString(feedback.note);
          const parts = [
            `- Decision #${index + 1}: ${decision} ${target}`,
            finalValue !== undefined ? `human final=${JSON.stringify(finalValue)}` : '',
            proposedValue !== undefined ? `agent proposal=${JSON.stringify(proposedValue)}` : '',
            note ? `note=${JSON.stringify(note)}` : '',
          ].filter(Boolean);
          return parts.join('; ');
        })
    : [];

  if (!requestLines.length && !previousFeedbackCount) return [];

  return [
    'Reviewer feedback to address:',
    ...requestLines,
    previousFeedbackCount
      ? `- Previous reviewer decisions/notes: ${previousFeedbackCount} entries in the full bundle.`
      : '',
    ...previousFeedbackLines,
  ].filter(Boolean);
}

function decisionHistoryValue(decision) {
  if (!isRecord(decision)) return undefined;
  if (decision.editedValue !== undefined) return decision.editedValue;
  if (decision.editedText !== undefined) return decision.editedText;
  if (decision.finalValue !== undefined) return decision.finalValue;
  if (decision.finalText !== undefined) return decision.finalText;
  return undefined;
}

function decisionHistoryPromptLines(bundle) {
  const batches = Array.isArray(bundle?.decisionHistory)
    ? bundle.decisionHistory.filter(isRecord)
    : [];
  const entries = batches.flatMap((batch, batchIndex) => {
    const decisions = Array.isArray(batch.decisions) ? batch.decisions.filter(isRecord).slice(0, 8) : [];
    if (!decisions.length) return [];
    const proposalId = asCleanString(batch.proposalId) || 'unknown proposal';
    const proposalVersion = batch.proposalVersion ?? 'unknown version';
    const savedAt = asCleanString(batch.savedAt);
    const count = Number.isFinite(Number(batch.savedDecisionCount))
      ? Number(batch.savedDecisionCount)
      : decisions.length;
    return [
      `- Batch #${batchIndex + 1}: proposal ${proposalId} v${proposalVersion}; ${count} saved decision${count === 1 ? '' : 's'}${savedAt ? `; saved ${savedAt}` : ''}.`,
      ...decisions.map((decision, decisionIndex) => {
        const kind = asCleanString(decision.decision) || 'unknown';
        const targetKey = asCleanString(decision.targetKey);
        const target = JSON.stringify(decision.target ?? {});
        const value = decisionHistoryValue(decision);
        const note = asCleanString(decision.note);
        const parts = [
          `  - Decision ${batchIndex + 1}.${decisionIndex + 1}: ${kind}`,
          targetKey ? `targetKey=${targetKey}` : '',
          target !== '{}' ? `target=${target}` : '',
          value !== undefined ? `human value=${JSON.stringify(value)}` : '',
          note ? `note=${JSON.stringify(note)}` : '',
        ].filter(Boolean);
        return parts.join('; ');
      }),
    ];
  });

  if (!entries.length) return [];

  return [
    'Human decision history:',
    '- Preserve accepted human decisions unless the latest reviewer feedback explicitly asks to revisit them.',
    '- Treat edited human values/text as the baseline for matching targets in the next proposal.',
    ...entries.slice(0, 60),
  ];
}

function reviewSignalContractFromBundle(bundle) {
  const handoffContract = isRecord(bundle?.handoff?.reviewSignalContract)
    ? bundle.handoff.reviewSignalContract
    : null;
  const bundleContract = isRecord(bundle?.reviewSignalContract) ? bundle.reviewSignalContract : null;
  return handoffContract ?? bundleContract;
}

function reviewSignalContractPromptLines(bundle) {
  const contract = reviewSignalContractFromBundle(bundle);
  if (!contract) return [];
  const requiredPerTarget = cleanStringArray(contract.requiredPerTarget);
  const requiredPerTargetLabels = cleanStringArray(contract.requiredPerTargetLabels);
  const requiredSignalLabels = requiredPerTargetLabels.length
    ? requiredPerTargetLabels
    : requiredPerTarget.map(reviewSignalGroupLabel).filter(Boolean);
  const requiredReviewContext = cleanStringArray(contract.requiredReviewContext);
  const requiredReviewContextLabels = cleanStringArray(contract.requiredReviewContextLabels);
  const requiredContextLabels = requiredReviewContextLabels.length
    ? requiredReviewContextLabels
    : requiredReviewContext.map(reviewSignalGroupLabel).filter(Boolean);
  const targetLevels = cleanStringArray(contract.targetLevels);
  const qualityGates = isRecord(contract.qualityGates)
    ? [
        asCleanString(contract.qualityGates.missingKeywordMapping),
        asCleanString(contract.qualityGates.missingRationale),
        asCleanString(contract.qualityGates.noWarningsReported),
      ].filter(Boolean)
    : [];
  const agentInstruction = asCleanString(contract.agentInstruction);
  const humanReviewInstruction = asCleanString(contract.humanReviewInstruction);

  return [
    'Review signal contract:',
    requiredSignalLabels.length ? `- Required per target: ${requiredSignalLabels.join(', ')}` : '',
    requiredContextLabels.length ? `- Required review context: ${requiredContextLabels.join(', ')}` : '',
    targetLevels.length ? `- Target levels: ${targetLevels.join(', ')}` : '',
    contract.emptySignalsMeanConsidered === true
      ? '- Empty assignedKeywords, unassignedKeywords, or warnings arrays mean the agent checked the signal and found no item.'
      : '',
    agentInstruction ? `- Agent instruction: ${agentInstruction}` : '',
    humanReviewInstruction ? `- Human review instruction: ${humanReviewInstruction}` : '',
    ...qualityGates.map((gate) => `- Quality gate: ${gate}`),
  ].filter(Boolean);
}

function fallbackAgentPromptFromBundle(bundle, label, kind) {
  if (!isRecord(bundle)) {
    throw new Error(`${label} is missing or invalid.`);
  }

  const job = isRecord(bundle.job) ? bundle.job : {};
  const surface = asCleanString(bundle.surface) || asCleanString(job.surface) || (kind === 'field' ? 'metadata' : 'screenshots');
  const isPricingField = kind === 'field' && surface === 'pricing';
  const fieldCurrentValueRules =
    kind === 'field'
      ? [
          '- For field-review changes, set currentValue from the bundle/context snapshot only; stale or invented currentValue entries are rejected.',
          '- Metadata currentValue must match context.currentValues/currentFieldsByLocale/context.locales[locale].fields for the target field.',
          '- Pricing currentValue must match context.currentPricing[].currentPrice for the target territoryId.',
          '- Keyword removal currentValue must contain only keyword(s) present in keywordContext for that locale; additions/preferred keywords may use an empty currentValue.',
        ]
      : [];
  const brief = isPricingField ? null : kind === 'field' ? buildFieldKeywordBrief(bundle) : buildScreenshotKeywordBrief(bundle);
  const pricingBrief = isPricingField ? buildFieldPricingBrief(bundle) : null;
  const coverageLines = brief ? keywordCoveragePromptLines(bundle, brief) : [];
  const automationLines = brief ? keywordAutomationPromptLines(bundle, brief) : [];
  const screenshotContextLines = kind === 'field' ? screenshotContextPromptLines(bundle) : [];
  const reviewerFeedbackLines = reviewerFeedbackPromptLines(bundle);
  const decisionHistoryLines = decisionHistoryPromptLines(bundle);
  const signalContractLines = reviewSignalContractPromptLines(bundle);
  const stableReferenceLines = stableTargetReferencePromptLines(bundle, kind);
  const proposalShape = bundle.proposalRequestShape?.body ?? bundle.proposalShape ?? {};
  const localeLines = Array.isArray(brief?.locales)
    ? brief.locales.map((locale) => `- ${locale.locale}: ${locale.keywordCount ?? 0} keywords`).join('\n')
    : '';
  const pricingBriefLines = pricingBrief
    ? [
        'Pricing review brief:',
        `- Territories: ${pricingBrief.summary?.territoryCount ?? 0}`,
        `- Current prices: ${pricingBrief.summary?.currentPriceCount ?? 0}`,
        `- Scheduled prices: ${pricingBrief.summary?.scheduledPriceCount ?? 0}`,
        `- Warnings: ${pricingBrief.summary?.warningCount ?? 0}`,
        `- Upcoming price changes: ${pricingBrief.riskSummary?.upcomingPriceChangeCount ?? 0}`,
        pricingBrief.riskSummary?.scheduledTerritoryIds?.length
          ? `- Scheduled territories: ${pricingBrief.riskSummary.scheduledTerritoryIds.join(', ')}`
          : '',
        pricingBrief.riskSummary?.warningTerritoryIds?.length
          ? `- Warning territories: ${pricingBrief.riskSummary.warningTerritoryIds.join(', ')}`
          : '',
        '- Treat pricing evidence as review context only; do not export, schedule, submit, or mark status from this agent pass.',
      ].filter(Boolean)
    : [];

  return [
    '# LocalizeASO Agent Proposal Prompt',
    '',
    `Generate a LocalizeASO ${surface} review proposal for job ${job.id ?? 'unknown'}.`,
    '',
    'Rules:',
    '- Create a structured proposal only.',
    '- Preserve every target identifier, locale, frameId, layerId, field, entityId, and territoryId from the bundle.',
    ...stableReferenceLines,
    '- Include current values, proposed values, assignedKeywords, unassignedKeywords, warnings, and rationale for every changed target where the proposal shape supports them; use empty arrays when no keyword or warning items apply.',
    isPricingField
      ? '- Pricing reviews do not use keyword research automation; use explicit empty assignedKeywords/unassignedKeywords as not-applicable markers and rely on pricing evidence, territory context, schedule warnings, and rationale.'
      : '- If keyword coverage is incomplete, run the keyword automation/brief first or mark the affected locale, field, frame, or layer with warnings plus unassignedKeywords before submitting the proposal.',
    ...fieldCurrentValueRules,
    '- Treat decisionHistory, reviewerFeedback, proposalHistory, and job.instructions as higher priority than generic ASO advice.',
    '- Do not approve, apply, mark status, upload/submit to App Store Connect, schedule pricing, or write to Figma.',
    '',
    `App: ${job.appName ?? bundle.appName ?? 'unknown'} (${job.appId ?? bundle.appId ?? 'unknown'})`,
    `Surface: ${surface}`,
    `Job status: ${job.status ?? 'unknown'}`,
    job.instructions ? `Human instructions: ${job.instructions}` : '',
    '',
    reviewerFeedbackLines.length ? reviewerFeedbackLines.join('\n') : '',
    decisionHistoryLines.length ? decisionHistoryLines.join('\n') : '',
    '',
    coverageLines.length ? `Keyword coverage:\n${coverageLines.join('\n')}` : '',
    automationLines.length ? automationLines.join('\n') : '',
    pricingBriefLines.length ? pricingBriefLines.join('\n') : '',
    screenshotContextLines.length ? screenshotContextLines.join('\n') : '',
    signalContractLines.length ? signalContractLines.join('\n') : '',
    localeLines ? `Locale keyword summary:\n${localeLines}` : '',
    '',
    'Expected proposal body shape:',
    '```json',
    JSON.stringify(proposalShape, null, 2),
    '```',
    '',
    'Full agent bundle:',
    '```json',
    JSON.stringify(bundle, null, 2),
    '```',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

function agentPromptFromBundle(bundle, label, kind) {
  const prompt = bundle?.handoff?.agentPrompt;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return fallbackAgentPromptFromBundle(bundle, label, kind);
  }
  const signalContractLines = reviewSignalContractPromptLines(bundle);
  const decisionHistoryLines = decisionHistoryPromptLines(bundle);
  const extraSections = [
    decisionHistoryLines.length ? decisionHistoryLines.join('\n') : '',
    signalContractLines.length ? signalContractLines.join('\n') : '',
  ].filter(Boolean);
  if (!extraSections.length) return prompt.trim();
  return [prompt.trim(), '', ...extraSections].join('\n\n');
}

function emptyReviewSignals(rationale = '') {
  return {
    assignedKeywords: [],
    unassignedKeywords: [],
    warnings: [],
    rationale,
  };
}

function proposalTemplateReviewGuide(bundle, kind) {
  const reviewSignalContract = reviewSignalContractFromBundle(bundle);
  const handoffSafety = isRecord(bundle?.handoff?.handoffSafety)
    ? structuredClone(bundle.handoff.handoffSafety)
    : undefined;
  const monetizationBoundary = isRecord(bundle?.monetizationBoundary)
    ? structuredClone(bundle.monetizationBoundary)
    : monetizationBoundaryForBundle(bundle, kind === 'field' ? 'field' : 'screenshots');
  return {
    kind: 'localizeaso_proposal_template_guide',
    reviewKind: kind === 'field' ? 'field' : 'screenshots',
    proposalSubmissionOnly: true,
    humanReviewRequired: true,
    humanApprovalRequiredBeforeApplyOrSubmit: true,
    protectedActionsAllowed: false,
    protectedActions: [
      'human_approval',
      'review_rejection',
      'figma_apply',
      'metadata_apply',
      'keyword_apply',
      'pricing_schedule',
      'app_store_submit',
      'status_update',
    ],
    requiredReviewSignals: ['assignedKeywords', 'unassignedKeywords', 'warnings', 'rationale'],
    emptySignalsMeanConsidered: reviewSignalContract?.emptySignalsMeanConsidered === true,
    agentInstruction:
      'Edit proposed values and review signals before submitting. Every target must keep explicit assignedKeywords, unassignedKeywords, warnings, and rationale fields; use empty arrays only after considering the signal. This template is not approval and must not be used to apply, publish, schedule pricing, mark status, or submit to App Store Connect.',
    ...(reviewSignalContract ? { reviewSignalContract: structuredClone(reviewSignalContract) } : {}),
    ...(handoffSafety ? { handoffSafety } : {}),
    monetizationBoundary,
  };
}

function normalizeStableRefLocale(value) {
  const trimmed = asCleanString(value).replace(/_/g, '-');
  if (!trimmed) return '';
  const parts = trimmed.split('-').filter(Boolean);
  if (!parts.length) return trimmed;
  const normalized = [parts[0].toLowerCase()];
  for (const part of parts.slice(1)) {
    if (part.length === 4) {
      normalized.push(part[0].toUpperCase() + part.slice(1).toLowerCase());
    } else {
      normalized.push(part.toUpperCase());
    }
  }
  return normalized.join('-');
}

function fieldProposalTargetRef(target) {
  if (!isRecord(target)) return '';
  return JSON.stringify([
    asCleanString(target.surface),
    target.locale ? normalizeStableRefLocale(target.locale) : '',
    asCleanString(target.field),
    asCleanString(target.entityId),
    asCleanString(target.territoryId),
  ]);
}

function screenshotProposalFrameRef(locale, frame) {
  const frameId = asCleanString(frame?.frameId);
  if (!frameId) return '';
  return JSON.stringify(['screenshot-frame', locale, frameId]);
}

function screenshotProposalLayerRef(locale, frame, layer) {
  const frameId = asCleanString(frame?.frameId);
  const layerId = asCleanString(layer?.layerId);
  if (!frameId || !layerId) return '';
  return JSON.stringify(['screenshot', locale, frameId, layerId]);
}

function stableTargetReferencesFromPayload(kind, payload) {
  const references = [];
  if (kind === 'field') {
    const changes = Array.isArray(payload?.changes) ? payload.changes : [];
    for (const change of changes) {
      if (!isRecord(change)) continue;
      const ref = fieldProposalTargetRef(change.target);
      if (!ref) continue;
      references.push({
        kind: 'field',
        ref,
        target: structuredClone(change.target),
      });
    }
    return references;
  }

  const locales = Array.isArray(payload?.locales) ? payload.locales : [];
  for (const localeProposal of locales) {
    if (!isRecord(localeProposal)) continue;
    const locale = asCleanString(localeProposal.locale);
    const frames = Array.isArray(localeProposal.frames) ? localeProposal.frames : [];
    for (const frame of frames) {
      if (!isRecord(frame)) continue;
      const frameRef = screenshotProposalFrameRef(locale, frame);
      if (frameRef) {
        references.push({
          kind: 'screenshot-frame',
          ref: frameRef,
          locale,
          frameId: asCleanString(frame.frameId),
        });
      }
      const layers = Array.isArray(frame.layers) ? frame.layers : [];
      for (const layer of layers) {
        if (!isRecord(layer)) continue;
        const layerRef = screenshotProposalLayerRef(locale, frame, layer);
        if (!layerRef) continue;
        references.push({
          kind: 'screenshot-layer',
          ref: layerRef,
          locale,
          frameId: asCleanString(frame.frameId),
          layerId: asCleanString(layer.layerId),
        });
      }
    }
  }
  return references;
}

function reviewerDecisionTargetRef(kind, target) {
  if (!isRecord(target)) return '';
  if (kind === 'field') return fieldProposalTargetRef(target);
  const locale = asCleanString(target.locale);
  const frameId = asCleanString(target.frameId);
  const layerId = asCleanString(target.layerId);
  const targetKind = asCleanString(target.kind);
  if (targetKind === 'layer' && locale && frameId && layerId) {
    return JSON.stringify(['screenshot', locale, frameId, layerId]);
  }
  if (targetKind === 'frame' && locale && frameId) {
    return JSON.stringify(['screenshot-frame', locale, frameId]);
  }
  if (targetKind === 'locale' && locale) {
    return JSON.stringify(['screenshot-locale', locale]);
  }
  return '';
}

function reviewerDecisionContextFromBundle(bundle, kind) {
  const feedback = Array.isArray(bundle?.reviewerFeedback)
    ? bundle.reviewerFeedback.filter(isRecord)
    : [];
  if (!feedback.length) return [];

  return feedback.slice(0, 50).map((item) => {
    const target = isRecord(item.target) ? item.target : {};
    const humanFinal =
      item.finalValue !== undefined
        ? item.finalValue
        : item.finalText !== undefined
          ? item.finalText
          : item.editedValue !== undefined
            ? item.editedValue
            : item.editedText !== undefined
              ? item.editedText
              : undefined;
    const agentProposal =
      item.proposedValue !== undefined
        ? item.proposedValue
        : item.proposedText !== undefined
          ? item.proposedText
          : undefined;
    const decision = {
      proposalId: asCleanString(item.proposalId),
      decision: asCleanString(item.decision),
      targetRef: reviewerDecisionTargetRef(kind, target),
      target: structuredClone(target),
      valueSource: asCleanString(item.valueSource),
      ...(item.currentValue !== undefined ? { currentValue: item.currentValue } : {}),
      ...(agentProposal !== undefined ? { agentProposal } : {}),
      ...(humanFinal !== undefined ? { humanFinal } : {}),
      ...(Array.isArray(item.affectedLayers) ? { affectedLayers: structuredClone(item.affectedLayers) } : {}),
      ...(asCleanString(item.note) ? { note: asCleanString(item.note) } : {}),
    };
    return Object.fromEntries(Object.entries(decision).filter(([, value]) => value !== '' && value !== undefined));
  });
}

function stableTargetReferencePromptLines(bundle, kind) {
  let template;
  try {
    template = kind === 'field' ? buildFieldProposalTemplate(bundle) : buildScreenshotProposalTemplate(bundle);
  } catch {
    return [
      '- Use Target ref, Frame ref, and Layer ref values from proposal-template _localizeasoReviewGuide.stableTargetReferences and review context snapshots as stable reviewer anchors in feedback/refinement.',
    ];
  }

  const guide = isRecord(template?._localizeasoReviewGuide) ? template._localizeasoReviewGuide : {};
  const refs = Array.isArray(guide.stableTargetReferences)
    ? guide.stableTargetReferences.filter(isRecord)
    : [];
  const base =
    kind === 'field'
      ? [
          '- Use Target ref values from proposal-template _localizeasoReviewGuide.stableTargetReferences and review context snapshots as stable reviewer anchors in feedback/refinement.',
          '- Target ref format: ["<surface>","<locale>","<field>","<entityId>","<territoryId>"].',
        ]
      : [
          '- Use Frame ref and Layer ref values from proposal-template _localizeasoReviewGuide.stableTargetReferences and review context snapshots as stable reviewer anchors in feedback/refinement.',
          '- Frame ref format: ["screenshot-frame","<locale>","<frameId>"]; Layer ref format: ["screenshot","<locale>","<frameId>","<layerId>"].',
        ];
  if (!refs.length) return base;

  const previewLimit = 20;
  const preview = refs.slice(0, previewLimit).map((entry) => {
    if (entry.kind === 'field') {
      const target = isRecord(entry.target) ? entry.target : {};
      const targetParts = [
        asCleanString(target.surface),
        asCleanString(target.locale),
        asCleanString(target.field),
        asCleanString(target.entityId),
        asCleanString(target.territoryId),
      ].filter(Boolean);
      return `- Target ref ${asCleanString(entry.ref)}${targetParts.length ? `: ${targetParts.join(' / ')}` : ''}`;
    }
    if (entry.kind === 'screenshot-frame') {
      return `- Frame ref ${asCleanString(entry.ref)}: locale ${asCleanString(entry.locale)}, frameId ${asCleanString(entry.frameId)}`;
    }
    if (entry.kind === 'screenshot-layer') {
      return `- Layer ref ${asCleanString(entry.ref)}: locale ${asCleanString(entry.locale)}, frameId ${asCleanString(entry.frameId)}, layerId ${asCleanString(entry.layerId)}`;
    }
    return `- ${asCleanString(entry.kind) || 'ref'} ${asCleanString(entry.ref)}`;
  });

  return [
    ...base,
    'Stable target refs preview:',
    ...preview,
    ...(refs.length > previewLimit
      ? [`- ${refs.length - previewLimit} more refs are available in proposal-template _localizeasoReviewGuide.stableTargetReferences.`]
      : []),
  ];
}

function proposalRequestTemplateBase(bundle, fallbackPayload) {
  const requestShapeBody = isRecord(bundle?.proposalRequestShape?.body)
    ? structuredClone(bundle.proposalRequestShape.body)
    : {};
  const kind =
    asCleanString(bundle?.surface) || asCleanString(bundle?.job?.surface)
      ? 'field'
      : 'screenshots';
  const reviewGuide = proposalTemplateReviewGuide(bundle, kind);
  const stableTargetReferences = stableTargetReferencesFromPayload(kind, fallbackPayload);
  const previousReviewerDecisions = reviewerDecisionContextFromBundle(bundle, kind);
  if (stableTargetReferences.length) {
    reviewGuide.stableTargetReferences = stableTargetReferences;
    reviewGuide.stableTargetReferenceInstruction =
      'Use these refs as stable reviewer anchors in feedback/refinement. Keep locale, frameId, layerId, field, entityId, and territoryId unchanged in the proposal payload.';
  }
  if (previousReviewerDecisions.length) {
    reviewGuide.previousReviewerDecisions = previousReviewerDecisions;
    reviewGuide.previousReviewerDecisionInstruction =
      'Treat these human decisions and humanFinal values as reviewer feedback context. Preserve human edits unless the latest reviewer instructions explicitly request a different revision; rejected targets should stay skipped unless the reviewer asks to revisit them.';
  }
  return {
    _localizeasoReviewGuide: reviewGuide,
    source: 'agent',
    agentName: 'codex',
    prompt: 'Describe the local Codex/AI-agent run and any keyword sources used.',
    ...requestShapeBody,
    payload: {
      ...(isRecord(requestShapeBody.payload) ? requestShapeBody.payload : {}),
      ...fallbackPayload,
    },
  };
}

function screenshotTemplateLocales(manifest, frames) {
  const locales = [];
  for (const locale of cleanStringArray(manifest?.targetLocales)) {
    addReviewLocale(locales, locale);
  }
  for (const locale of cleanStringArray(manifest?.locales)) {
    addReviewLocale(locales, locale);
  }
  for (const frame of frames) {
    addReviewLocale(locales, frame.locale);
  }
  if (!locales.length && frames.length) {
    locales.push('<locale>');
  }
  return locales;
}

function buildScreenshotProposalTemplate(bundle) {
  if (!isRecord(bundle)) {
    throw new Error('Screenshot review bundle is missing or invalid.');
  }
  const job = isRecord(bundle.job) ? bundle.job : {};
  const manifest = isRecord(job.manifest) ? job.manifest : {};
  const frames = Array.isArray(manifest.frames) ? manifest.frames.filter(isRecord) : [];
  const targetLocales = screenshotTemplateLocales(manifest, frames);
  const locales = targetLocales.map((locale) => ({
    locale,
    ...emptyReviewSignals('Required before submitting: explain the locale-level ASO direction.'),
    frames: frames
      .filter((frame) => {
        const frameLocale = asCleanString(frame.locale);
        return !frameLocale || normalizeReviewLocale(frameLocale) === normalizeReviewLocale(locale);
      })
      .map((frame) => {
        const frameId = asCleanString(frame.id) || asCleanString(frame.frameId);
        const layers = Array.isArray(frame.textLayers)
          ? frame.textLayers
          : Array.isArray(frame.layers)
            ? frame.layers
            : [];
        return {
          frameId,
          frameName: asCleanString(frame.name) || undefined,
          displayType: asCleanString(frame.displayType) || undefined,
          ...emptyReviewSignals('Required before submitting: explain the frame-level keyword/copy direction.'),
          layers: layers.filter(isRecord).map((layer) => {
            const sourceText = asCleanString(layer.text) || asCleanString(layer.sourceText);
            return {
              layerId: asCleanString(layer.id) || asCleanString(layer.layerId),
              layerName: asCleanString(layer.name) || undefined,
              sourceText,
              proposedText: sourceText,
              ...emptyReviewSignals('Required before submitting: explain this layer change.'),
            };
          }),
        };
      }),
  }));

  return proposalRequestTemplateBase(bundle, {
    summary: 'Draft screenshot proposal. Replace unchanged proposedText values before submitting.',
    locales,
  });
}

function fieldContextLocales(context) {
  const locales = [];
  for (const locale of cleanStringArray(context?.targetLocales)) {
    addReviewLocale(locales, locale);
  }
  if (Array.isArray(context?.currentKeywords)) {
    for (const row of context.currentKeywords) {
      if (isRecord(row)) addReviewLocale(locales, row.locale);
    }
  }
  if (isRecord(context?.locales)) {
    for (const locale of Object.keys(context.locales)) {
      addReviewLocale(locales, locale);
    }
  } else if (Array.isArray(context?.locales)) {
    for (const locale of cleanStringArray(context.locales)) {
      addReviewLocale(locales, locale);
    }
  }
  if (isRecord(context?.currentFieldsByLocale)) {
    for (const locale of Object.keys(context.currentFieldsByLocale)) {
      addReviewLocale(locales, locale);
    }
  }
  if (isRecord(context?.currentValues)) {
    for (const locale of Object.keys(context.currentValues)) {
      addReviewLocale(locales, locale);
    }
  }
  if (isRecord(context?.keywordContext?.keywords)) {
    for (const locale of Object.keys(context.keywordContext.keywords)) {
      addReviewLocale(locales, locale);
    }
  }
  return locales.sort((a, b) => a.localeCompare(b));
}

function metadataFieldsForLocale(context, locale) {
  const normalizedLocale = normalizeReviewLocale(locale);
  const localeKey = isRecord(context?.locales)
    ? Object.keys(context.locales).find((key) => normalizeReviewLocale(key) === normalizedLocale)
    : '';
  const currentFieldsKey = isRecord(context?.currentFieldsByLocale)
    ? Object.keys(context.currentFieldsByLocale).find((key) => normalizeReviewLocale(key) === normalizedLocale)
    : '';
  const currentValuesKey = isRecord(context?.currentValues)
    ? Object.keys(context.currentValues).find((key) => normalizeReviewLocale(key) === normalizedLocale)
    : '';
  const fields =
    (localeKey && isRecord(context?.locales?.[localeKey]?.fields) ? context.locales[localeKey].fields : null) ??
    (currentFieldsKey && isRecord(context?.currentFieldsByLocale?.[currentFieldsKey]) ? context.currentFieldsByLocale[currentFieldsKey] : null) ??
    (currentValuesKey && isRecord(context?.currentValues?.[currentValuesKey]) ? context.currentValues[currentValuesKey] : null) ??
    {};
  const entries = Object.entries(fields)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries;
}

function buildMetadataFieldTemplateChanges(context) {
  const changes = [];
  for (const locale of fieldContextLocales(context)) {
    for (const [field, currentValue] of metadataFieldsForLocale(context, locale)) {
      changes.push({
        target: { surface: 'metadata', locale, field },
        currentValue,
        proposedValue: currentValue,
        ...emptyReviewSignals('Required before submitting: explain this metadata change.'),
      });
    }
  }
  if (!changes.length) {
    changes.push({
      target: { surface: 'metadata', locale: '<locale>', field: '<field>' },
      currentValue: '',
      proposedValue: '',
      ...emptyReviewSignals('Required before submitting: explain this metadata change.'),
    });
  }
  return changes.map((change) => ({
    ...change,
    target: { ...change.target, surface: 'metadata' },
  }));
}

function buildKeywordFieldTemplateChanges(context) {
  const locales = fieldContextLocales(context);
  const rows = Array.isArray(context?.currentKeywords) ? context.currentKeywords.filter(isRecord) : [];
  const changes = [];
  for (const locale of locales.length ? locales : ['<locale>']) {
    const normalizedLocale = normalizeReviewLocale(locale);
    const localeRows = rows.filter((row) => normalizeReviewLocale(row.locale) === normalizedLocale);
    const existingKeyword = asCleanString(localeRows[0]?.keyword);
    changes.push({
      target: { surface: 'keywords', locale, field: existingKeyword ? 'preferred' : 'add' },
      currentValue: existingKeyword || '',
      proposedValue: existingKeyword || '<keyword>',
      ...emptyReviewSignals('Required before submitting: explain why this keyword should be added, preferred, or removed.'),
    });
  }
  return changes;
}

function priceFromRows(rows, territoryId, key) {
  for (const row of rows) {
    if (!isRecord(row) || asCleanString(row.territoryId) !== territoryId) continue;
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = parseAmount(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstPricingRowForTerritory(rows, territoryId) {
  const normalizedTerritoryId = normalizeTerritoryId(territoryId);
  return rows.find((row) => {
    if (!isRecord(row)) return false;
    const rowTerritoryId = asCleanString(row.territoryId);
    return rowTerritoryId === territoryId || normalizeTerritoryId(rowTerritoryId) === normalizedTerritoryId;
  });
}

function pricingTemplateWarningsForTerritory(args) {
  const warnings = [];
  const territoryId = asCleanString(args.territoryId);
  for (const row of [args.currentRow, args.suggestionRow, args.scheduledRow]) {
    if (!isRecord(row)) continue;
    addUniqueString(warnings, row.warning);
    addUniqueString(warnings, row.risk);
  }

  const scheduledRow = isRecord(args.scheduledRow) ? args.scheduledRow : null;
  if (scheduledRow) {
    const scheduledPrice = parseAmount(scheduledRow.scheduledPrice);
    const scheduledStartDate =
      asCleanString(scheduledRow.scheduledStartDate) || asCleanString(scheduledRow.startDate);
    const currency =
      asCleanString(scheduledRow.currency) ||
      asCleanString(scheduledRow.currencyCode) ||
      asCleanString(args.currentRow?.currency) ||
      asCleanString(args.suggestionRow?.currency);
    if (scheduledPrice !== null || scheduledStartDate) {
      const details = [
        scheduledPrice !== null ? `${currency ? `${currency} ` : ''}${scheduledPrice}` : '',
        scheduledStartDate ? `from ${scheduledStartDate}` : '',
      ].filter(Boolean);
      addUniqueString(
        warnings,
        `Existing scheduled price${details.length ? ` ${details.join(' ')}` : ''}${territoryId ? ` for ${territoryId}` : ''}; review before replacing or scheduling.`,
      );
    }
  }

  return warnings;
}

function buildPricingFieldTemplateChanges(context) {
  const currentPricing = Array.isArray(context?.currentPricing) ? context.currentPricing : [];
  const suggestions = Array.isArray(context?.localizedSuggestions) ? context.localizedSuggestions : [];
  const scheduledPricing = Array.isArray(context?.scheduledPricing) ? context.scheduledPricing : [];
  const draftPrices = isRecord(context?.draftPrices) ? context.draftPrices : {};
  const territoryIds = new Set([
    ...cleanStringArray(context?.changedTerritoryIds),
    ...Object.keys(draftPrices).map(asCleanString).filter(Boolean),
    ...currentPricing.map((row) => (isRecord(row) ? asCleanString(row.territoryId) : '')).filter(Boolean),
    ...suggestions.map((row) => (isRecord(row) ? asCleanString(row.territoryId) : '')).filter(Boolean),
    ...scheduledPricing.map((row) => (isRecord(row) ? asCleanString(row.territoryId) : '')).filter(Boolean),
  ]);
  const entityId = asCleanString(context?.productId) || asCleanString(context?.product?.id) || asCleanString(context?.product?.productId);
  const ids = Array.from(territoryIds).sort((a, b) => a.localeCompare(b));
  const targets = ids.length ? ids : ['<territoryId>'];
  return targets.map((territoryId) => {
    const currentRow = firstPricingRowForTerritory(currentPricing, territoryId);
    const suggestionRow = firstPricingRowForTerritory(suggestions, territoryId);
    const scheduledRow = firstPricingRowForTerritory(scheduledPricing, territoryId);
    const currentValue = priceFromRows(currentPricing, territoryId, 'currentPrice');
    const draftValue = parseAmount(draftPrices[territoryId]);
    const suggestedValue =
      priceFromRows(suggestions, territoryId, 'newPrice') ??
      priceFromRows(suggestions, territoryId, 'newPriceInput') ??
      draftValue ??
      currentValue;
    return {
      target: {
        surface: 'pricing',
        field: 'price',
        ...(entityId ? { entityId } : {}),
        territoryId,
      },
      currentValue,
      proposedValue: suggestedValue,
      ...emptyReviewSignals('Required before submitting: explain this pricing change and any schedule risk.'),
      warnings: pricingTemplateWarningsForTerritory({
        territoryId,
        currentRow,
        suggestionRow,
        scheduledRow,
      }),
    };
  });
}

function buildFieldProposalTemplate(bundle) {
  if (!isRecord(bundle)) {
    throw new Error('Field review bundle is missing or invalid.');
  }
  const job = isRecord(bundle.job) ? bundle.job : {};
  const context = isRecord(bundle.context) ? bundle.context : {};
  const surface = asCleanString(bundle.surface) || asCleanString(job.surface) || 'metadata';
  const appId = asCleanString(job.appId) || asCleanString(bundle.appId) || asCleanString(context.appId);
  let changes;
  if (surface === 'keywords') {
    changes = buildKeywordFieldTemplateChanges(context);
  } else if (surface === 'pricing') {
    changes = buildPricingFieldTemplateChanges(context);
  } else {
    changes = buildMetadataFieldTemplateChanges(context);
  }

  return proposalRequestTemplateBase(bundle, {
    surface,
    appId,
    summary: `Draft ${surface} proposal. Replace unchanged proposedValue values before submitting.`,
    changes,
  });
}

function getDashboardBaseUrl() {
  const configured = (
    process.env.LOCALIZEASO_DASHBOARD ||
    process.env.LOCALIZEASO_DASHBOARD_URL ||
    process.env.PUBLIC_DASHBOARD_URL ||
    process.env.EXPO_PUBLIC_DASHBOARD_URL ||
    defaultDashboard()
  ).replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return configured;
  try {
    const parsed = new URL(configured);
    if (parsed.hostname.toLowerCase().endsWith('.test')) return defaultDashboard();
  } catch {
    return configured;
  }
  return configured;
}

function isLocalDashboardHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function isLocalDashboardTestHostname(hostname) {
  return String(hostname ?? '').toLowerCase() === 'dashboard.test';
}

function normalizeReviewUrlForLocalDashboard(value) {
  const reviewUrl = asCleanString(value);
  if (!reviewUrl) return '';
  let parsed;
  try {
    parsed = new URL(reviewUrl);
  } catch {
    return reviewUrl;
  }
  if (!isLocalDashboardTestHostname(parsed.hostname)) return reviewUrl;

  let dashboardBase;
  try {
    dashboardBase = new URL(getDashboardBaseUrl());
  } catch {
    return reviewUrl;
  }
  if (!isLocalDashboardHostname(dashboardBase.hostname)) return reviewUrl;
  return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, dashboardBase).toString();
}

function shouldNormalizeLocalDashboardUrl(url) {
  return isLocalDashboardTestHostname(url.hostname);
}

function normalizeReviewTextForLocalDashboard(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text.trim()) return text;
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (candidate) => {
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      return candidate;
    }
    if (!shouldNormalizeLocalDashboardUrl(parsed)) return candidate;
    return normalizeReviewUrlForLocalDashboard(candidate) || candidate;
  });
}

function normalizeReviewUrlsForLocalDashboard(value) {
  if (typeof value === 'string') return normalizeReviewTextForLocalDashboard(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeReviewUrlsForLocalDashboard(item));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if ((key === 'reviewUrl' || key === 'dashboardUrl') && typeof entry === 'string') {
        return [key, normalizeReviewUrlForLocalDashboard(entry)];
      }
      return [key, normalizeReviewUrlsForLocalDashboard(entry)];
    }),
  );
}

function getReviewUrl(agentBundle) {
  const handoff = agentBundle?.handoff;
  if (typeof handoff?.reviewUrl === 'string' && handoff.reviewUrl.trim()) {
    return normalizeReviewUrlForLocalDashboard(handoff.reviewUrl);
  }
  if (typeof handoff?.dashboardUrl === 'string' && handoff.dashboardUrl.trim()) {
    return normalizeReviewUrlForLocalDashboard(handoff.dashboardUrl);
  }
  if (typeof handoff?.dashboardPath === 'string' && handoff.dashboardPath.trim()) {
    return new URL(handoff.dashboardPath, getDashboardBaseUrl()).toString();
  }
  throw new Error('Agent bundle does not include a review URL.');
}

function getPostProposalReviewUrl(payload) {
  const humanReview = isRecord(payload?.humanReview) ? payload.humanReview : {};
  const nextHumanAction = isRecord(payload?.nextHumanAction) ? payload.nextHumanAction : {};
  const humanReviewUrl = asCleanString(humanReview.reviewUrl);
  if (humanReviewUrl) return normalizeReviewUrlForLocalDashboard(humanReviewUrl);
  const nextHumanActionUrl = asCleanString(nextHumanAction.reviewUrl);
  if (nextHumanActionUrl) return normalizeReviewUrlForLocalDashboard(nextHumanActionUrl);
  return '';
}

function safeReviewReturnToFromUrl(value) {
  const reviewUrl = asCleanString(value);
  if (!reviewUrl) return '';
  let parsed;
  try {
    parsed = new URL(reviewUrl, getDashboardBaseUrl());
  } catch {
    return '';
  }
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '';
  if (!parsed.pathname.includes('/field-review') && !parsed.pathname.includes('/screenshot-review')) return '';
  return path;
}

function appIdFromReviewReturnTo(returnTo) {
  const pathname = String(returnTo ?? '').split(/[?#]/, 1)[0] || '';
  const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
  if (!firstSegment || firstSegment === 'field-review' || firstSegment === 'screenshot-review') return '';
  return firstSegment;
}

function browserOpenDisabled() {
  return process.env.LOCALIZEASO_DISABLE_OPEN === '1' || process.env.LOCALIZEASO_DISABLE_BROWSER_OPEN === '1';
}

function localDashboardReviewInfo(reviewUrl) {
  try {
    const parsed = new URL(reviewUrl);
    if (!isLocalDashboardHostname(parsed.hostname)) return {};
    return {
      localDashboardReviewUrl: true,
      localDashboardOrigin: parsed.origin,
    };
  } catch {
    return {};
  }
}

async function authenticatedDashboardReviewUrl(reviewUrl) {
  if (process.env.LOCALIZEASO_AUTH_REVIEW_LINK === '0') return reviewUrl;
  if (!configuredToken()) return reviewUrl;
  const returnTo = safeReviewReturnToFromUrl(reviewUrl);
  if (!returnTo) return reviewUrl;

  try {
    const payload = await request('/auth/plugin-dashboard-link', {
      method: 'POST',
      body: {
        next: 'dashboard',
        appId: appIdFromReviewReturnTo(returnTo) || undefined,
        returnTo,
      },
    });
    return asCleanString(payload?.url) || reviewUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not create authenticated dashboard review link; opening raw review URL. ${message}`);
    return reviewUrl;
  }
}

async function openHumanReviewUrl(reviewUrl) {
  if (browserOpenDisabled()) {
    return { requested: true, opened: false, disabled: true, authenticatedDashboardLink: false };
  }
  const browserUrl = await authenticatedDashboardReviewUrl(reviewUrl);
  return {
    requested: true,
    opened: openUrl(browserUrl),
    disabled: false,
    authenticatedDashboardLink: browserUrl !== reviewUrl,
  };
}

function withPostProposalHumanReview(payload, agentBundle, kind) {
  const humanReview = isRecord(payload?.humanReview) ? payload.humanReview : {};
  const nextHumanAction = isRecord(payload?.nextHumanAction) ? payload.nextHumanAction : {};
  const handoffSafety = isRecord(payload?.handoffSafety) ? payload.handoffSafety : {};
  const reviewSignalContract = isRecord(payload?.reviewSignalContract)
    ? structuredClone(payload.reviewSignalContract)
    : isRecord(agentBundle?.handoff?.reviewSignalContract)
      ? structuredClone(agentBundle.handoff.reviewSignalContract)
      : isRecord(agentBundle?.reviewSignalContract)
        ? structuredClone(agentBundle.reviewSignalContract)
        : null;
  const reviewUrl = getPostProposalReviewUrl(payload) || getReviewUrl(agentBundle);
  const job = isRecord(agentBundle?.job) ? agentBundle.job : {};
  const responseJob = isRecord(payload?.job) ? payload.job : {};
  const surface =
    asCleanString(responseJob.surface) ||
    asCleanString(job.surface) ||
    asCleanString(agentBundle?.surface);
  const reviewKind = kind === 'screenshot' ? 'screenshots' : kind;
  const jobId = asCleanString(job.id) || asCleanString(responseJob.id);
  const fallbackOpenReviewCommand = kind === 'field'
    ? `pnpm review:agent field-open ${shellQuote(jobId || '<jobId>')}`
    : `pnpm review:agent open ${shellQuote(jobId || '<jobId>')}`;
  const openReviewCommand =
    asCleanString(humanReview.openReviewCommand) ||
    asCleanString(nextHumanAction.command) ||
    fallbackOpenReviewCommand;
  const protectedActions = Array.isArray(handoffSafety.protectedActions) &&
      handoffSafety.protectedActions.length
    ? handoffSafety.protectedActions.map(asCleanString).filter(Boolean)
    : [
        'human_approval',
        'review_rejection',
        'figma_apply',
        'metadata_apply',
        'metadata_publish',
        'pricing_schedule',
        'pricing_publish',
        'screenshot_publish',
        'app_store_upload',
        'app_store_submit',
        'app_store_publish',
        'status_update',
      ];
  if (!protectedActions.includes('review_rejection')) {
    const humanApprovalIndex = protectedActions.indexOf('human_approval');
    protectedActions.splice(humanApprovalIndex >= 0 ? humanApprovalIndex + 1 : 0, 0, 'review_rejection');
  }
  const postProposalReviewGate = buildPostProposalReviewGate(payload);
  return {
    ...payload,
    ...(postProposalReviewGate ? { postProposalReviewGate } : {}),
    monetizationBoundary: isRecord(payload?.monetizationBoundary)
      ? payload.monetizationBoundary
      : buildMonetizationBoundary(kind),
    humanReview: {
      ...humanReview,
      required: true,
      actor: 'human',
      reviewUrl,
      openReviewCommand,
      consentBoundary: asCleanString(humanReview.consentBoundary) ||
        'Open the review screen so a human can accept, reject, edit, or request another agent pass. This output does not approve, apply, submit, schedule pricing, or mark status.',
    },
    nextHumanAction: {
      ...nextHumanAction,
      id: 'open_review_and_decide',
      label: asCleanString(nextHumanAction.label) || 'Open review and decide',
      reviewUrl,
      command: openReviewCommand,
    },
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    handoffSafety: {
      ...handoffSafety,
      agentSafe: true,
      humanOnly: false,
      requiresLocalizeAsoPass: true,
      requiredLocalizeAsoCapabilities: reviewStartCapabilities(reviewKind, surface),
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
      mutatesReviewData: true,
      mutatesPersistentKeywordInventory: false,
      mutatesAppStoreConnect: false,
      proposalSubmissionOnly: true,
      protectedActionsAllowed: false,
      approvalAllowed: false,
      rejectionAllowed: false,
      figmaApplyAllowed: false,
      metadataApplyAllowed: false,
      metadataExportAllowed: false,
      metadataPublishAllowed: false,
      keywordApplyAllowed: false,
      pricingExportAllowed: false,
      pricingScheduleAllowed: false,
      pricingPublishAllowed: false,
      screenshotUploadAllowed: false,
      screenshotPublishAllowed: false,
      appStoreUploadAllowed: false,
      appStoreSubmitAllowed: false,
      appStorePublishAllowed: false,
      statusUpdateAllowed: false,
      postApprovalActionAllowed: false,
      humanApprovalConsentGranted: false,
      humanRejectionConsentGranted: false,
      humanPostApprovalConsentGranted: false,
      phase: 'post_proposal_human_review',
      protectedActions,
      agentInstruction: asCleanString(handoffSafety.agentInstruction) ||
        'Proposal submission is complete. Do not approve or apply anything; hand this review URL to the human reviewer.',
    },
  };
}

function browserOpenMetadata(reviewUrl, result = {}) {
  return {
    requested: result.requested === true,
    opened: result.opened === true,
    disabled: result.disabled === true,
    authenticatedDashboardLink: result.authenticatedDashboardLink === true,
    reviewUrl,
    ...localDashboardReviewInfo(reviewUrl),
  };
}

function reviewAuthHandoff(reviewUrl, browserOpen = {}) {
  const tokenAvailable = Boolean(configuredToken());
  const authLinkEnabled = process.env.LOCALIZEASO_AUTH_REVIEW_LINK !== '0';
  const authenticatedDashboardLink = browserOpen.authenticatedDashboardLink === true;
  const browserOpeningDisabled = browserOpen.disabled === true;
  const browserOpenRequested = browserOpen.requested === true;
  const mode = authenticatedDashboardLink
    ? 'authenticated_dashboard_link'
    : browserOpenRequested
      ? 'raw_review_url'
      : 'review_url_only';
  const guidance = authenticatedDashboardLink
    ? 'A short-lived dashboard continue link was used; an existing browser dashboard session should not be required.'
    : browserOpeningDisabled
      ? 'Browser opening is disabled. Open reviewUrl manually while signed in, or rerun without LOCALIZEASO_DISABLE_OPEN and with LOCALIZEASO_TOKEN so the CLI can create a short-lived dashboard continue link.'
      : tokenAvailable && authLinkEnabled
        ? 'The CLI could not confirm an authenticated continue link; if the dashboard shows sign-in, rerun localizeaso doctor and retry with LOCALIZEASO_TOKEN.'
        : 'Raw reviewUrl may require an existing dashboard browser session. Set LOCALIZEASO_TOKEN before opening review links to let the CLI request a short-lived authenticated continue link.';

  return {
    kind: 'localizeaso_review_auth_handoff',
    reviewUrl,
    mode,
    authenticatedDashboardLink,
    dashboardSessionMayBeRequired: !authenticatedDashboardLink,
    tokenAvailable,
    authLinkEnabled,
    browserOpeningDisabled,
    ...localDashboardReviewInfo(reviewUrl),
    guidance,
  };
}

function withReviewAuthHandoff(payload, browserOpen) {
  if (!browserOpen) return payload;
  return {
    ...payload,
    browserOpen,
    reviewAuth: reviewAuthHandoff(browserOpen.reviewUrl, browserOpen),
  };
}

async function withPostProposalHumanReviewFallback(payload, encodedJobId, kind) {
  if (getPostProposalReviewUrl(payload)) {
    return withPostProposalHumanReview(payload, null, kind);
  }
  const bundlePath = kind === 'field'
    ? `/field-review/jobs/${encodedJobId}/agent-bundle`
    : `/screenshot-review/jobs/${encodedJobId}/agent-bundle`;
  const bundlePayload = await request(bundlePath);
  return withPostProposalHumanReview(payload, bundlePayload.agentBundle, kind);
}

async function maybeOpenPostProposalReview(payload, flags) {
  const url = getPostProposalReviewUrl(payload);
  if (flags.open !== true || flags['no-open'] === true || flags.open === false || flags.open === 'false' || flags.open === '0') {
    return url ? browserOpenMetadata(url, { requested: false }) : undefined;
  }
  if (!url) throw new Error('Proposal response does not include a review URL.');
  const result = await openHumanReviewUrl(url);
  if (result.opened) {
    console.error(
      result.authenticatedDashboardLink
        ? `Opened authenticated dashboard review link for: ${url}`
        : `Opened review URL: ${url}`,
    );
  } else {
    console.error(`Review URL not opened because browser opening is disabled: ${url}`);
  }
  return browserOpenMetadata(url, result);
}

function openUrl(url) {
  if (browserOpenDisabled()) {
    return false;
  }
  if (process.env.LOCALIZEASO_CAPTURE_OPEN_URL === '1') {
    return true;
  }
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}

async function maybeOpenReview(agentBundle, flags) {
  if (flags.open !== true) return;
  const url = getReviewUrl(agentBundle);
  const result = await openHumanReviewUrl(url);
  if (result.opened) {
    console.error(
      result.authenticatedDashboardLink
        ? `Opened authenticated dashboard review link for: ${url}`
        : `Opened review URL: ${url}`,
    );
  } else {
    console.error(`Review URL not opened because browser opening is disabled: ${url}`);
  }
  return browserOpenMetadata(url, result);
}

function fieldOpenReviewCommand(jobId) {
  return `pnpm review:agent field-open ${shellQuote(jobId || '<jobId>')}`;
}

function screenshotOpenReviewCommand(jobId) {
  return `pnpm review:agent open ${shellQuote(jobId || '<jobId>')}`;
}

function pricingOpenReviewCommand(jobId) {
  return `pnpm localizeaso pricing open ${shellQuote(jobId || '<jobId>')}`;
}

function normalizeReviewOpenCommandForSurface(kind, surface, jobId, command) {
  const cleaned = asCleanString(command);
  if (kind === 'field' && asCleanString(surface) === 'pricing' && /^pnpm\s+review:agent\s+field-open\b/.test(cleaned)) {
    return pricingOpenReviewCommand(jobId);
  }
  return cleaned;
}

function reviewUrlFromHandoff(handoff) {
  if (!isRecord(handoff)) return '';
  const reviewUrl = asCleanString(handoff.reviewUrl);
  if (reviewUrl) return normalizeReviewUrlForLocalDashboard(reviewUrl);
  const dashboardUrl = asCleanString(handoff.dashboardUrl);
  if (dashboardUrl) return normalizeReviewUrlForLocalDashboard(dashboardUrl);
  const dashboardPath = asCleanString(handoff.dashboardPath);
  if (dashboardPath) return new URL(dashboardPath, getDashboardBaseUrl()).toString();
  return '';
}

function reviewStartUrl(agentBundle, createAgentHandoff, jobId, kind) {
  const bundleHandoffUrl = reviewUrlFromHandoff(agentBundle?.handoff);
  if (bundleHandoffUrl) return bundleHandoffUrl;
  const createHandoffUrl = reviewUrlFromHandoff(createAgentHandoff);
  if (createHandoffUrl) return createHandoffUrl;
  const job = isRecord(agentBundle?.job) ? agentBundle.job : {};
  const appId = asCleanString(job.appId);
  const normalizedJobId = asCleanString(jobId) || asCleanString(job.id);
  if (appId && normalizedJobId) {
    const path = kind === 'field'
      ? `/${encodeURIComponent(appId)}/field-review?jobId=${encodeURIComponent(normalizedJobId)}`
      : `/${encodeURIComponent(appId)}/screenshot-review?jobId=${encodeURIComponent(normalizedJobId)}`;
    return new URL(path, getDashboardBaseUrl()).toString();
  }
  return '';
}

function createPayloadStartHandoff(payload) {
  if (!isRecord(payload)) return null;
  const agentHandoff = isRecord(payload.agentHandoff) ? payload.agentHandoff : {};
  const humanReview = isRecord(payload.humanReview) ? payload.humanReview : {};
  const nextHumanAction = isRecord(payload.nextHumanAction) ? payload.nextHumanAction : {};
  const handoff = {
    ...structuredClone(agentHandoff),
  };
  const reviewUrl = firstCleanString(
    agentHandoff.reviewUrl,
    agentHandoff.dashboardUrl,
    humanReview.reviewUrl,
    nextHumanAction.reviewUrl,
  );
  if (reviewUrl) handoff.reviewUrl = reviewUrl;
  const dashboardPath = firstCleanString(agentHandoff.dashboardPath, humanReview.dashboardPath);
  if (dashboardPath) handoff.dashboardPath = dashboardPath;
  const openReviewCommand = firstCleanString(
    agentHandoff.openReviewCommand,
    humanReview.openReviewCommand,
    nextHumanAction.command,
  );
  if (openReviewCommand) handoff.openReviewCommand = openReviewCommand;
  const reviewInstruction = firstCleanString(agentHandoff.reviewInstruction, humanReview.consentBoundary);
  if (reviewInstruction) handoff.reviewInstruction = reviewInstruction;
  if (!Array.isArray(handoff.consentChecklist) && Array.isArray(humanReview.consentChecklist)) {
    handoff.consentChecklist = structuredClone(humanReview.consentChecklist);
  }
  if (!isRecord(handoff.reviewConsent) && isRecord(payload.reviewConsent)) {
    handoff.reviewConsent = structuredClone(payload.reviewConsent);
  }
  if (!isRecord(handoff.reviewSignalContract) && isRecord(payload.reviewSignalContract)) {
    handoff.reviewSignalContract = structuredClone(payload.reviewSignalContract);
  }
  return Object.keys(handoff).length ? normalizeReviewUrlsForLocalDashboard(handoff) : null;
}

function reviewStartHumanReview(agentBundle, createAgentHandoff, jobId, kind, options = {}) {
  const reviewUrl = reviewStartUrl(agentBundle, createAgentHandoff, jobId, kind) || getReviewUrl(agentBundle);
  const handoffCommand = asCleanString(createAgentHandoff?.openReviewCommand);
  const fallbackCommand = kind === 'field' ? fieldOpenReviewCommand(jobId) : screenshotOpenReviewCommand(jobId);
  const overrideCommand = firstCleanString(options.openReviewCommand, options.command);
  const nextCommand = overrideCommand || handoffCommand || fallbackCommand;
  const label = asCleanString(options.label) || (kind === 'field' ? 'Open field review workspace' : 'Open screenshot review workspace');
  const id = asCleanString(options.id) || (kind === 'field' ? 'open_field_review_workspace' : 'open_screenshot_review_workspace');
  const consentBoundary = asCleanString(options.consentBoundary) ||
    'Open the review screen so a human can inspect the agent context, submit or review proposals, edit decisions, and approve later. This start output does not approve, apply, export, schedule, submit, or mark status.';
  return {
    humanReview: {
      required: true,
      actor: 'human',
      reviewUrl,
      openReviewCommand: nextCommand,
      consentBoundary,
    },
    nextHumanAction: {
      id,
      label,
      reviewUrl,
      command: nextCommand,
    },
  };
}

function reviewStartCapabilities(kind, surface = '') {
  const capabilities = ['byoAgent', 'reviewHistory'];
  if (kind === 'screenshots') capabilities.push('figmaPlugin');
  if (kind === 'field' && asCleanString(surface) === 'pricing') capabilities.push('pricingReview');
  return capabilities;
}

function reviewOpenMcpToolName(kind, surface = '') {
  if (kind === 'screenshots') return 'localizeaso_screenshot_open_review';
  const normalizedSurface = asCleanString(surface);
  if (normalizedSurface === 'metadata') return 'localizeaso_metadata_open_review';
  if (normalizedSurface === 'keywords') return 'localizeaso_keywords_open_review';
  if (normalizedSurface === 'pricing') return 'localizeaso_pricing_open_review';
  return 'localizeaso_field_open_review';
}

function reviewStartConsentChecklist(kind, surface = '') {
  if (kind === 'screenshots') {
    return normalizeReviewConsentChecklist([
      'Open the screenshot review screen after the job start.',
      'Let the agent generate screenshot copy proposals only; never apply Figma text from setup.',
      'Review current screenshot text, agent proposals, frame/layer refs, assigned keywords, unassigned keywords, warnings, rationale, diffs, and screenshot evidence per locale, frame, and layer.',
      'Approve, reject, edit, or request an agent revision in the review UI.',
      'Only after approval may a human apply accepted or edited copy through the Figma plugin, upload screenshots, submit, or mark status.',
    ]);
  }

  const normalizedSurface = asCleanString(surface);
  if (normalizedSurface === 'pricing') {
    return normalizeReviewConsentChecklist([
      'Open the pricing field-review screen after the job start.',
      'Let the agent generate pricing proposals only; never schedule or publish prices from setup.',
      'Review current price, target price, schedules, territory warnings, rationale, and final value per territory.',
      'Approve, reject, edit, or request an agent revision in the review UI.',
      'Only after approval may a human export an asc CSV, schedule pricing, use hosted submit, or mark status.',
    ]);
  }

  if (normalizedSurface === 'keywords') {
    return normalizeReviewConsentChecklist([
      'Open the keyword field-review screen after the job start.',
      'Sync existing ASO keywords and attach optional Astro/CSV or provider-neutral keyword context before proposal generation.',
      'Review current keywords, agent proposals, assigned keywords, unassigned keywords, warnings, rationale, and diffs per locale.',
      'Approve, reject, edit, or request an agent revision in the review UI.',
      'Only after approval may a human apply accepted or edited keyword changes to the LocalizeASO keyword store.',
    ]);
  }

  return normalizeReviewConsentChecklist([
    'Open the metadata field-review screen after the job start.',
    'Sync existing ASO keywords and attach optional Astro/CSV or provider-neutral keyword context before proposal generation.',
    'Review current metadata, agent proposals, assigned keywords, unassigned keywords, warnings, rationale, and diffs per locale and field.',
    'Approve, reject, edit, or request an agent revision in the review UI.',
    'Only after approval may a human apply drafts, export local asc metadata files, use hosted submit, or mark status.',
  ]);
}

function reviewStartProhibitedAgentActions(kind, surface = '') {
  if (kind === 'screenshots') {
    return [
      'approve_review',
      'reject_review',
      'figma_apply',
      'upload_or_publish_screenshots',
      'submit_to_app_store_connect',
      'mark_status_applied_or_submitted',
    ];
  }

  const common = [
    'approve_review',
    'reject_review',
    'submit_to_app_store_connect',
    'mark_status_applied_or_submitted',
  ];
  const normalizedSurface = asCleanString(surface);
  if (normalizedSurface === 'pricing') {
    return [
      ...common,
      'export_pricing_payload',
      'schedule_or_publish_pricing',
    ];
  }
  if (normalizedSurface === 'keywords') {
    return [
      ...common,
      'apply_keyword_store_changes',
      'push_or_publish_metadata',
    ];
  }
  return [
    ...common,
    'apply_metadata_drafts',
    'export_metadata_files',
    'push_or_publish_metadata',
  ];
}

function reviewStartConsentFromHandoff(kind, surface, startReview, jobId, handoffReviewConsent) {
  if (!isRecord(handoffReviewConsent)) return null;
  const toolName = reviewOpenMcpToolName(kind, surface);
  const existingNextHumanAction = isRecord(handoffReviewConsent.nextHumanAction)
    ? handoffReviewConsent.nextHumanAction
    : {};
  const isScreenshot = kind === 'screenshots';
  const normalizedSurface = asCleanString(surface);
  const defaultLabel = isScreenshot
    ? 'Open screenshot review and consent screen'
    : normalizedSurface === 'pricing'
      ? 'Open pricing review and consent screen'
      : normalizedSurface === 'keywords'
        ? 'Open keyword review and consent screen'
        : 'Open metadata review and consent screen';
  const handoffChecklist = normalizeReviewConsentChecklist(handoffReviewConsent.checklist);
  const handoffProhibitedAgentActions = cleanStringArray(handoffReviewConsent.prohibitedAgentActions);
  return {
    opensHumanReviewScreen: true,
    ...structuredClone(handoffReviewConsent),
    consentScreen:
      asCleanString(handoffReviewConsent.consentScreen) ||
      (isScreenshot ? 'LocalizeASO screenshot review' : 'LocalizeASO field review'),
    checklist: handoffChecklist.length ? handoffChecklist : reviewStartConsentChecklist(kind, surface),
    prohibitedAgentActions: handoffProhibitedAgentActions.length
      ? handoffProhibitedAgentActions
      : reviewStartProhibitedAgentActions(kind, surface),
    nextHumanAction: {
      ...structuredClone(existingNextHumanAction),
      id: asCleanString(existingNextHumanAction.id) || (isScreenshot ? 'open_screenshot_review_consent' : 'open_field_review_consent'),
      label: asCleanString(existingNextHumanAction.label) || defaultLabel,
      reviewUrl:
        asCleanString(existingNextHumanAction.reviewUrl) ||
        asCleanString(startReview?.nextHumanAction?.reviewUrl),
      command:
        normalizeReviewOpenCommandForSurface(kind, surface, jobId, existingNextHumanAction.command) ||
        normalizeReviewOpenCommandForSurface(kind, surface, jobId, startReview?.nextHumanAction?.command),
      mcpToolCall:
        asCleanString(existingNextHumanAction.mcpToolCall) ||
        mcpToolCommand(toolName, { jobId }),
      requiresLocalizeAsoPass:
        typeof existingNextHumanAction.requiresLocalizeAsoPass === 'boolean'
          ? existingNextHumanAction.requiresLocalizeAsoPass
          : true,
      requiredLocalizeAsoCapabilities:
        Array.isArray(existingNextHumanAction.requiredLocalizeAsoCapabilities)
          ? structuredClone(existingNextHumanAction.requiredLocalizeAsoCapabilities)
          : reviewStartCapabilities(kind, surface),
      requiresHostedAi:
        typeof existingNextHumanAction.requiresHostedAi === 'boolean'
          ? existingNextHumanAction.requiresHostedAi
          : false,
      requiresAppStoreConnectCredentials:
        typeof existingNextHumanAction.requiresAppStoreConnectCredentials === 'boolean'
          ? existingNextHumanAction.requiresAppStoreConnectCredentials
          : false,
    },
  };
}

function reviewStartConsent(kind, surface, startReview, jobId, ...handoffReviewConsentCandidates) {
  for (const candidate of handoffReviewConsentCandidates) {
    const consent = reviewStartConsentFromHandoff(kind, surface, startReview, jobId, candidate);
    if (consent) return consent;
  }
  const isScreenshot = kind === 'screenshots';
  const toolName = reviewOpenMcpToolName(kind, surface);
  const normalizedSurface = asCleanString(surface);
  const label = isScreenshot
    ? 'Open screenshot review and consent screen'
    : normalizedSurface === 'pricing'
      ? 'Open pricing review and consent screen'
      : normalizedSurface === 'keywords'
        ? 'Open keyword review and consent screen'
        : 'Open metadata review and consent screen';

  return {
    opensHumanReviewScreen: true,
    consentScreen: isScreenshot ? 'LocalizeASO screenshot review' : 'LocalizeASO field review',
    checklist: reviewStartConsentChecklist(kind, surface),
    prohibitedAgentActions: reviewStartProhibitedAgentActions(kind, surface),
    nextHumanAction: {
      id: isScreenshot ? 'open_screenshot_review_consent' : 'open_field_review_consent',
      label,
      reviewUrl: startReview?.nextHumanAction?.reviewUrl,
      command: startReview?.nextHumanAction?.command,
      mcpToolCall: mcpToolCommand(toolName, { jobId }),
      requiresLocalizeAsoPass: true,
      requiredLocalizeAsoCapabilities: reviewStartCapabilities(kind, surface),
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
    },
  };
}

function startHandoffSafety(kind, phase, surface = '') {
  const protectedActions = kind === 'field'
    ? [
        'human_approval',
        'review_rejection',
        'metadata_apply',
        'metadata_publish',
        'keyword_apply',
        'pricing_export',
        'pricing_schedule',
        'pricing_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ]
    : [
        'human_approval',
        'review_rejection',
        'figma_apply',
        'screenshot_upload',
        'screenshot_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ];
  return {
    agentSafe: true,
    humanOnly: false,
    humanReviewRequired: true,
    requiresLocalizeAsoPass: true,
    requiredLocalizeAsoCapabilities: reviewStartCapabilities(kind, surface),
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    readOnly: false,
    mutatesReviewData: true,
    mutatesPersistentKeywordInventory: false,
    mutatesAppStoreConnect: false,
    proposalSubmissionOnly: false,
    protectedActionsAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
    figmaApplyAllowed: false,
    metadataApplyAllowed: false,
    metadataExportAllowed: false,
    metadataPublishAllowed: false,
    keywordApplyAllowed: false,
    pricingExportAllowed: false,
    pricingScheduleAllowed: false,
    pricingPublishAllowed: false,
    screenshotUploadAllowed: false,
    screenshotPublishAllowed: false,
    appStoreUploadAllowed: false,
    appStoreSubmitAllowed: false,
    appStorePublishAllowed: false,
    statusUpdateAllowed: false,
    postApprovalActionAllowed: false,
    humanApprovalConsentGranted: false,
    humanRejectionConsentGranted: false,
    humanPostApprovalConsentGranted: false,
    protectedActions,
    phase,
    agentInstruction:
      'Review job was created. Use agent-safe bundle, keyword, prompt, and proposal commands only; open the human review screen before approval, apply/export, scheduling, hosted submit, local asc handoff, or status updates.',
  };
}

function bundleHandoffSafety(kind) {
  const protectedActions = kind === 'field'
    ? [
        'human_approval',
        'review_rejection',
        'metadata_apply',
        'metadata_publish',
        'keyword_apply',
        'pricing_export',
        'pricing_schedule',
        'pricing_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ]
    : [
        'human_approval',
        'review_rejection',
        'figma_apply',
        'screenshot_upload',
        'screenshot_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ];
  return {
    agentSafe: true,
    humanOnly: false,
    readOnly: true,
    mutatesReviewData: false,
    mutatesAppStoreConnect: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    bundleContextOnly: true,
    proposalSubmissionOnly: false,
    protectedActionsAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
    figmaApplyAllowed: false,
    metadataApplyAllowed: false,
    metadataExportAllowed: false,
    metadataPublishAllowed: false,
    keywordApplyAllowed: false,
    pricingExportAllowed: false,
    pricingScheduleAllowed: false,
    pricingPublishAllowed: false,
    screenshotUploadAllowed: false,
    screenshotPublishAllowed: false,
    appStoreUploadAllowed: false,
    appStoreSubmitAllowed: false,
    appStorePublishAllowed: false,
    statusUpdateAllowed: false,
    postApprovalActionAllowed: false,
    humanApprovalConsentGranted: false,
    humanRejectionConsentGranted: false,
    humanPostApprovalConsentGranted: false,
    protectedActions,
    phase: kind === 'field' ? 'field_review_bundle' : 'screenshot_review_bundle',
    agentInstruction:
      'This bundle fetch is context-only. Generate or submit proposals with agent-safe commands, but do not approve, apply/export, schedule, submit, or mark status from this bundle output.',
  };
}

function withAgentBundleMetadata(bundle, kind) {
  if (!isRecord(bundle)) return bundle;
  const existingSafety = isRecord(bundle.handoffSafety) ? bundle.handoffSafety : {};
  const existingBoundary = isRecord(bundle.monetizationBoundary) ? bundle.monetizationBoundary : null;
  return {
    ...bundle,
    monetizationBoundary: existingBoundary ?? monetizationBoundaryForBundle(bundle, kind),
    handoffSafety: {
      ...existingSafety,
      ...bundleHandoffSafety(kind),
      protectedActions: Array.isArray(existingSafety.protectedActions) && existingSafety.protectedActions.length
        ? existingSafety.protectedActions.map(asCleanString).filter(Boolean)
        : bundleHandoffSafety(kind).protectedActions,
      agentInstruction:
        asCleanString(existingSafety.agentInstruction) || bundleHandoffSafety(kind).agentInstruction,
    },
  };
}

function openReviewNavigationPayload(url, jobId, kind, surface = '', browserOpen = undefined) {
  const command = kind === 'field' ? fieldOpenReviewCommand(jobId) : screenshotOpenReviewCommand(jobId);
  const nextHumanAction = {
    id: kind === 'field' ? 'review_field_changes' : 'review_screenshot_changes',
    label: kind === 'field' ? 'Review field changes' : 'Review screenshot changes',
    reviewUrl: url,
    command,
  };
  const protectedActions = kind === 'field'
    ? [
        'human_approval',
        'review_rejection',
        'metadata_apply',
        'metadata_publish',
        'keyword_apply',
        'pricing_export',
        'pricing_schedule',
        'pricing_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ]
    : [
        'human_approval',
        'review_rejection',
        'figma_apply',
        'screenshot_upload',
        'screenshot_publish',
        'app_store_upload',
        'app_store_submit',
        'status_update',
      ];
  return {
    reviewUrl: url,
    ...(browserOpen
      ? {
          browserOpen: {
            requested: browserOpen.requested === true,
            opened: browserOpen.opened === true,
            disabled: browserOpen.disabled === true,
            authenticatedDashboardLink: browserOpen.authenticatedDashboardLink === true,
            reviewUrl: url,
            ...localDashboardReviewInfo(url),
          },
        }
      : {}),
    ...(browserOpen ? { reviewAuth: reviewAuthHandoff(url, browserOpen) } : {}),
    monetizationBoundary: monetizationBoundaryForReview(kind, surface),
    humanReview: {
      required: true,
      actor: 'human',
      reviewUrl: url,
      openReviewCommand: command,
      consentBoundary:
        'This command only opens the human review screen. It does not approve, reject, apply, export, schedule, submit, or mark status.',
    },
    nextHumanAction: {
      ...nextHumanAction,
    },
    reviewConsent: {
      ...reviewStartConsent(kind, surface, { nextHumanAction }, jobId),
      consentScreen: kind === 'field' ? 'LocalizeASO field review' : 'LocalizeASO screenshot review',
    },
    handoffSafety: {
      agentSafe: true,
      humanOnly: false,
      readOnly: true,
      opensHumanReview: true,
      humanReviewNavigationOnly: true,
      protectedActionsAllowed: false,
      approvalAllowed: false,
      rejectionAllowed: false,
      figmaApplyAllowed: false,
      metadataApplyAllowed: false,
      metadataExportAllowed: false,
      metadataPublishAllowed: false,
      keywordApplyAllowed: false,
      pricingExportAllowed: false,
      pricingScheduleAllowed: false,
      pricingPublishAllowed: false,
      screenshotUploadAllowed: false,
      screenshotPublishAllowed: false,
      appStoreUploadAllowed: false,
      appStoreSubmitAllowed: false,
      appStorePublishAllowed: false,
      statusUpdateAllowed: false,
      postApprovalActionAllowed: false,
      humanApprovalConsentGranted: false,
      humanRejectionConsentGranted: false,
      humanPostApprovalConsentGranted: false,
      protectedActions,
      phase: kind === 'field' ? 'field_review_navigation' : 'screenshot_review_navigation',
      agentInstruction:
        'Navigation to the review UI is complete. Wait for explicit human decisions and consent before running approval, apply/export, submit, schedule, or status commands.',
    },
  };
}

function pricingParityStartHumanReview(agentBundle, createAgentHandoff, jobId) {
  return reviewStartHumanReview(agentBundle, createAgentHandoff, jobId, 'field', {
    id: 'open_pricing_review_workspace',
    label: 'Open pricing review workspace',
    openReviewCommand: pricingOpenReviewCommand(jobId),
    consentBoundary:
      'Open the pricing review screen so a human can inspect the parity plan, request an agent proposal, edit decisions, and approve later. This start output does not approve, export, schedule, submit, or mark status.',
  });
}

function requirePayloadJobId(payload, command) {
  const id = payload?.job?.id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`${command} did not return job.id.`);
  }
  return id;
}

class BackendRequestError extends Error {
  constructor({ status, path, payload, message }) {
    super(message);
    this.name = 'BackendRequestError';
    this.status = status;
    this.path = path;
    this.payload = payload;
    this.code = typeof payload?.code === 'string' ? payload.code : undefined;
    this.pendingTargets = Array.isArray(payload?.pendingTargets) ? payload.pendingTargets : [];
  }
}

function backendEntitlementText(error) {
  const payload = isRecord(error.payload) ? error.payload : {};
  const capabilityTokens = [
    payload.capability,
    payload.requiredCapability,
    ...(Array.isArray(payload.requiredCapabilities) ? payload.requiredCapabilities : []),
  ]
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter(Boolean)
    .join(' ');
  return `${error.message ?? ''} ${error.path ?? ''} ${capabilityTokens}`;
}

function backendEntitlementCapability(error) {
  const text = backendEntitlementText(error);
  if (/hostedAi|hosted ai proposals/i.test(text)) return 'hostedAi';
  if (/appStoreSubmit|hosted_submit|hosted_upload|app store connect|upload convenience|submit convenience|upload\/submit convenience|upload-|submit-|upload |submit |publishing|submit-metadata|submit-pricing/i.test(text)) {
    return 'appStoreSubmit';
  }
  if (/pricingReview|pricing review|pricing/i.test(text)) return 'pricingReview';
  if (/figmaPlugin|figma plugin|figma apply|screenshot review/i.test(text)) return 'figmaPlugin';
  if (/reviewHistory|review history|approval handoffs|handoffs/i.test(text)) return 'reviewHistory';
  if (/byoAgent|byo agent|own codex|ai agent|agent workflows|codex\/ai-agent/i.test(text)) return 'byoAgent';
  return undefined;
}

function backendCountValue(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function backendOpenReviewActions(error) {
  const counts = isRecord(error.payload?.openReviewActions) ? error.payload.openReviewActions : undefined;
  if (!counts) return undefined;

  const field = backendCountValue(counts.field);
  const screenshot = backendCountValue(counts.screenshot);
  const total = Math.max(backendCountValue(counts.total), field + screenshot);
  if (total <= 0) return undefined;
  return { field, screenshot, total };
}

function backendOpenReviewActionsHint(error) {
  const counts = backendOpenReviewActions(error);
  if (!counts) return undefined;

  const details = [
    counts.field > 0 ? `${counts.field} field review action${counts.field === 1 ? '' : 's'}` : '',
    counts.screenshot > 0
      ? `${counts.screenshot} screenshot review action${counts.screenshot === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);
  const detailText = details.length ? ` (${details.join(', ')})` : '';
  return `${counts.total} open review action${counts.total === 1 ? '' : 's'}${detailText} must be resolved before applying, exporting, uploading, scheduling, submitting, or marking status. Open the Review Workspace, finish or reject the pending reviews, then retry this approved handoff.`;
}

function backendErrorHint(error) {
  const humanOnlyHint = postApprovalHumanOnlyErrorHint(error.path);
  const keywordContextLock = keywordContextLockErrorSafety(error);
  const openReviewActionsHint = backendOpenReviewActionsHint(error);
  const consentGate = isRecord(error.payload?.consentGate) ? error.payload.consentGate : undefined;
  const agentInstruction = asCleanString(error.payload?.agentInstruction);
  if (keywordContextLock) {
    return keywordContextLock.agentInstruction;
  }
  if (openReviewActionsHint) {
    return humanOnlyHint ? `${humanOnlyHint} ${openReviewActionsHint}` : openReviewActionsHint;
  }
  if (consentGate) {
    const kind = asCleanString(consentGate.kind);
    const instruction = asCleanString(consentGate.agentInstruction);
    const flag = asCleanString(consentGate.cliFlag);
    const consentField = asCleanString(consentGate.consentField);
    const boundary = asCleanString(consentGate.protectedActionBoundary);
    const protectedActions = Array.isArray(consentGate.protectedActions)
      ? consentGate.protectedActions.map(asCleanString).filter(Boolean)
      : [];
    const kindText = kind ? ` Gate: ${kind.replace(/_/g, ' ')}.` : '';
    const flagText = flag ? ` Required human-only CLI flag: ${flag}.` : '';
    const fieldText = consentField ? ` Consent field: ${consentField}.` : '';
    const actionsText = protectedActions.length
      ? ` Protected actions: ${protectedActions.slice(0, 6).join(', ')}.`
      : '';
    const boundaryText = boundary ? ` ${boundary}` : '';
    return `${instruction || 'Open the human review UI and collect explicit human consent before retrying this command.'}${kindText}${flagText}${fieldText}${actionsText}${boundaryText}`;
  }
  if (agentInstruction) return agentInstruction;
  if (error.status === 402) {
    if (error.code === 'ENTITLEMENT_REQUIRED') {
      if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass for BYO Codex/AI review workflows, Submit Pass for hosted App Store Connect convenience without hosted AI, or a hosted AI pass when LocalizeASO should generate proposals.`;
      return 'Choose Agent Pass for BYO Codex/AI review workflows without spending LocalizeASO hosted proposal allowance, Submit Pass for hosted App Store Connect convenience without hosted AI, or a hosted AI pass for LocalizeASO AI proposal generation.';
    }
    if (error.code === 'ENTITLEMENT_APP_LIMIT') {
      if (humanOnlyHint) return `${humanOnlyHint} Buy another app slot/pass or upgrade before running this post-approval handoff.`;
      return 'This pass is already assigned to its app limit. Buy another app slot/pass or upgrade before creating another review job.';
    }
    if (error.code === 'ENTITLEMENT_LANGUAGE_LIMIT') {
      if (humanOnlyHint) return `${humanOnlyHint} Reduce the requested locales or choose a pass that includes those languages.`;
      return 'Reduce the requested locales or choose a pass that includes those languages.';
    }
    if (error.code === 'ENTITLEMENT_CAPABILITY_REQUIRED') {
      const capability = backendEntitlementCapability(error);
      if (capability === 'hostedAi') {
        if (humanOnlyHint) return `${humanOnlyHint} Hosted AI proposals require a hosted LocalizeASO pass. Agent Pass uses your own Codex/AI subscription through the CLI/MCP review handoff instead.`;
        return 'Hosted AI proposals require a hosted LocalizeASO pass. Agent Pass uses your own Codex/AI subscription through the CLI/MCP review handoff instead.';
      }
      if (capability === 'pricingReview') {
        if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass or a hosted pass with pricing review before exporting or submitting pricing handoffs.`;
        return 'Choose Agent Pass or a hosted pass with pricing review before creating or submitting pricing review jobs.';
      }
      if (capability === 'appStoreSubmit') {
        if (humanOnlyHint) return `${humanOnlyHint} Hosted App Store Connect upload/submit convenience requires Submit Pass or a hosted LocalizeASO pass. Agent Pass users should export local asc handoffs instead.`;
        return 'Hosted App Store Connect upload/submit convenience requires Submit Pass or a hosted LocalizeASO pass. Agent Pass users should export local asc handoffs instead.';
      }
      if (capability === 'reviewHistory') {
        if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass or a hosted pass before inspecting review history, decisions, and post-approval handoffs.`;
        return 'Choose Agent Pass or a hosted pass before inspecting review history, decisions, and post-approval handoffs.';
      }
      if (capability === 'figmaPlugin') {
        if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass or a hosted pass for Figma plugin review and approved apply-plan workflows.`;
        return 'Choose Agent Pass or a hosted pass for Figma plugin review and approved apply-plan workflows.';
      }
      if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass or a hosted pass that includes this LocalizeASO review capability.`;
      return 'Choose Agent Pass or a hosted pass that includes this LocalizeASO review capability.';
    }
    if (error.code === 'ENTITLEMENT_SURFACE_EXPIRED') {
      if (humanOnlyHint) return `${humanOnlyHint} Choose another pass before running this app workflow.`;
      return 'Choose another pass before creating a new review job for this app workflow.';
    }
    if (humanOnlyHint) return `${humanOnlyHint} Choose Agent Pass for BYO-agent mode, Submit Pass for hosted App Store Connect convenience without hosted AI, or a hosted AI pass when LocalizeASO should generate proposals.`;
    return 'Choose Agent Pass for BYO-agent mode, Submit Pass for hosted App Store Connect convenience without hosted AI, or a hosted AI pass when LocalizeASO should generate proposals.';
  }
  if (error.status === 409 && error.pendingTargets.length) {
    return 'Finish human review decisions before approval, apply, or status changes.';
  }
  if (
    error.status === 409 &&
    (isRecord(error.payload?.finalValueGate) || (Array.isArray(error.payload?.blockingIssues) && error.payload.blockingIssues.length))
  ) {
    return 'Resolve final-value blockers in the human review UI by saving valid final values or requesting another agent revision before approval or post-approval handoff.';
  }
  if (humanOnlyHint) return humanOnlyHint;
  return undefined;
}

function keywordContextLockErrorSafety(error) {
  if (error.status !== 409) return undefined;
  const pathValue = typeof error.path === 'string' ? error.path : '';
  const errorText = typeof error.payload?.error === 'string' ? error.payload.error : error.message;
  const isKeywordContextPath =
    /^\/screenshot-review\/jobs\/[^/]+\/keyword-context$/.test(pathValue) ||
    /^\/field-review\/jobs\/[^/]+\/keyword-context$/.test(pathValue) ||
    /^\/field-review\/jobs\/[^/]+\/sync-aso-keywords$/.test(pathValue);
  if (!isKeywordContextPath || !/keyword context|review context is locked/i.test(errorText)) return undefined;
  const reviewKind = pathValue.startsWith('/screenshot-review/') ? 'screenshot' : 'field';
  const action = pathValue.endsWith('/sync-aso-keywords')
    ? 'sync_aso_keywords'
    : pathValue.includes('/field-review/')
      ? 'field_keyword_context'
      : 'screenshot_keyword_context';
  return {
    action,
    reviewKind,
    humanOnly: false,
    agentSafe: false,
    blocked: true,
    requiresRevision: true,
    phase: 'review_context_locked',
    status: typeof error.payload?.status === 'string' ? error.payload.status : undefined,
    protectedActions: ['keyword_context_attach', 'keyword_context_sync'],
    nextHumanAction: 'Request revisions in the human review UI, then rerun the keyword context step on the revised job state.',
    agentInstruction:
      'Keyword context is locked for this review job. Do not retry this attach/sync command from the current agent pass; ask the human reviewer to request revisions, then fetch a fresh bundle before attaching new keyword context.',
  };
}

function postApprovalHumanOnlyErrorSafety(errorPath) {
  const pathValue = typeof errorPath === 'string' ? errorPath : '';
  const pathWithoutQuery = pathValue.split('?')[0];
  const match = pathWithoutQuery.match(/^\/(?:screenshot-review|field-review)\/jobs\/[^/]+\/([^/?#]+)$/);
  if (!match) return undefined;
  const endpoint = match[1];
  const actionByEndpoint = {
    'apply-plan': pathWithoutQuery.startsWith('/screenshot-review/')
      ? 'screenshot_apply_plan'
      : 'field_apply_plan',
    status: pathWithoutQuery.startsWith('/screenshot-review/')
      ? 'screenshot_status'
      : 'field_status',
    'apply-drafts': 'field_apply_drafts',
    'apply-keywords': 'field_apply_keywords',
    'pricing-payload': 'field_pricing_payload',
    'submit-metadata': 'field_submit_metadata',
    'submit-pricing': 'field_submit_pricing',
  };
  const action = actionByEndpoint[endpoint];
  if (!action) return undefined;
  return humanOnlyPostApprovalHandoff(action, [
    'This backend error happened while running a human-only post-approval command.',
    'Do not retry this command from an autonomous agent proposal pass.',
  ]);
}

function postApprovalHumanOnlyErrorHint(errorPath) {
  const safety = postApprovalHumanOnlyErrorSafety(errorPath);
  if (!safety) return undefined;
  if (safety.action === 'field_submit_metadata' || safety.action === 'field_submit_pricing') {
    return 'This is a human-only post-approval upload/submit step. Hosted upload/submit convenience needs a hosted pass; Agent Pass users should use local asc handoffs after approval.';
  }
  if (safety.action === 'field_pricing_payload') {
    return 'This is a human-only post-approval pricing export step. Review the approved pricing plan first, then export a payload or asc CSV only from the human workflow.';
  }
  if (safety.action === 'screenshot_status' || safety.action === 'field_status') {
    return 'This is a human-only post-approval status step. Mark applied/submitted only after the human-run external apply or submit has completed.';
  }
  return 'This is a human-only post-approval apply/export step. Inspect the approved plan first and run it only from the human review workflow.';
}

function backendErrorJson(error) {
  const handoffSafety = postApprovalHumanOnlyErrorSafety(error.path);
  const keywordContextLock = keywordContextLockErrorSafety(error);
  const openReviewActions = backendOpenReviewActions(error);
  const consentGate = isRecord(error.payload?.consentGate) ? error.payload.consentGate : undefined;
  const signalAudit = isRecord(error.payload?.signalAudit) ? error.payload.signalAudit : undefined;
  const reviewGateSummary = isRecord(error.payload?.reviewGateSummary)
    ? error.payload.reviewGateSummary
    : undefined;
  const finalValueGate = isRecord(error.payload?.finalValueGate) ? error.payload.finalValueGate : undefined;
  const readinessBoundary = isRecord(error.payload?.readinessBoundary)
    ? error.payload.readinessBoundary
    : undefined;
  const readinessReviewGate = isRecord(error.payload?.readinessReviewGate)
    ? error.payload.readinessReviewGate
    : undefined;
  const reviewSignalContract = isRecord(error.payload?.reviewSignalContract)
    ? error.payload.reviewSignalContract
    : undefined;
  const missingFields = Array.isArray(error.payload?.missingFields)
    ? error.payload.missingFields.map(asCleanString).filter(Boolean)
    : [];
  const target = isRecord(error.payload?.target) ? error.payload.target : undefined;
  const agentInstruction = asCleanString(error.payload?.agentInstruction);
  const capability = asCleanString(error.payload?.capability);
  const requiredCapability = asCleanString(error.payload?.requiredCapability);
  const requiredCapabilities = Array.isArray(error.payload?.requiredCapabilities)
    ? error.payload.requiredCapabilities.map(asCleanString).filter(Boolean)
    : [];
  return {
    kind: 'backend_error',
    status: error.status,
    code: error.code,
    path: error.path,
    error: error.message,
    pendingTargets: error.pendingTargets,
    ...(openReviewActions ? { openReviewActions } : {}),
    ...(capability ? { capability } : {}),
    ...(requiredCapability ? { requiredCapability } : {}),
    ...(requiredCapabilities.length ? { requiredCapabilities } : {}),
    ...(signalAudit ? { signalAudit } : {}),
    ...(reviewGateSummary ? { reviewGateSummary } : {}),
    ...(finalValueGate ? { finalValueGate } : {}),
    ...(readinessBoundary ? { readinessBoundary } : {}),
    ...(readinessReviewGate ? { readinessReviewGate } : {}),
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    ...(missingFields.length ? { missingFields } : {}),
    ...(target ? { target } : {}),
    ...(agentInstruction ? { agentInstruction } : {}),
    ...(consentGate ? { consentGate } : {}),
    hint: backendErrorHint(error),
    ...(handoffSafety ? { handoffSafety } : {}),
    ...(keywordContextLock ? { keywordContextLock } : {}),
    payload: error.payload,
  };
}

async function request(path, options = {}) {
  const { token, backend } = getConfig();
  const response = await fetch(`${backend}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error ?? payload?.message ?? response.statusText;
    const pendingTargets = Array.isArray(payload?.pendingTargets) ? payload.pendingTargets : [];
    const pendingSummary = pendingTargets.length
      ? ` ${pendingTargets.length} target${pendingTargets.length === 1 ? '' : 's'} still need a decision before approval.`
      : '';
    throw new BackendRequestError({
      status: response.status,
      path,
      payload,
      message: `${message}${pendingSummary}`,
    });
  }
  return payload;
}

const LOCAL_REVIEW_SIGNAL_FIELDS = ['assignedKeywords', 'unassignedKeywords', 'warnings', 'rationale'];
const LOCAL_REVIEW_SIGNAL_FIELD_LABELS = ['assigned keywords', 'unassigned keywords', 'warnings', 'rationale'];
const LOCAL_PRICING_REVIEW_SIGNAL_FIELD_LABELS = ['keyword mapping n/a', 'warnings', 'rationale'];
const LOCAL_REQUIRED_REVIEW_CONTEXT = ['currentValue', 'agentProposal', 'humanFinal', 'diff'];
const LOCAL_REQUIRED_REVIEW_CONTEXT_LABELS = ['current content', 'agent proposal', 'human final', 'diff'];
const LOCAL_SCREENSHOT_REVIEW_SIGNAL_CONTRACT = {
  kind: 'localizeaso_review_signal_contract',
  requiredPerTarget: LOCAL_REVIEW_SIGNAL_FIELDS,
  requiredPerTargetLabels: LOCAL_REVIEW_SIGNAL_FIELD_LABELS,
  requiredReviewContext: LOCAL_REQUIRED_REVIEW_CONTEXT,
  requiredReviewContextLabels: LOCAL_REQUIRED_REVIEW_CONTEXT_LABELS,
  targetLevels: ['locale', 'frame', 'layer'],
  emptySignalsMeanConsidered: true,
  qualityGates: {
    missingKeywordMapping:
      'A layer target needs assignedKeywords or unassignedKeywords after merging locale, frame, and layer signals.',
    missingRationale:
      'A layer target needs rationale after merging locale, frame, and layer rationale.',
    noWarningsReported:
      'An empty warnings array is allowed and means the agent found no warning after checking the target.',
  },
  agentInstruction:
    'Populate review signals for every locale/frame/layer target before submitting. Use empty arrays only after considering the signal.',
  humanReviewInstruction:
    'Review keyword mapping, unassigned keywords, warnings, and rationale before accepting or editing the proposal.',
};
const LOCAL_FIELD_REVIEW_SIGNAL_CONTRACT = {
  kind: 'localizeaso_review_signal_contract',
  requiredPerTarget: LOCAL_REVIEW_SIGNAL_FIELDS,
  requiredPerTargetLabels: LOCAL_REVIEW_SIGNAL_FIELD_LABELS,
  requiredReviewContext: LOCAL_REQUIRED_REVIEW_CONTEXT,
  requiredReviewContextLabels: LOCAL_REQUIRED_REVIEW_CONTEXT_LABELS,
  targetLevels: ['field'],
  emptySignalsMeanConsidered: true,
  qualityGates: {
    missingKeywordMapping:
      'Each changed field target needs assignedKeywords or unassignedKeywords so ASO coverage gaps are visible.',
    missingRationale: 'Each changed field target needs rationale for the proposed value and any tradeoff.',
    noWarningsReported:
      'An empty warnings array is allowed and means the agent found no warning after checking limits, schedules, keyword fit, and source context.',
  },
  agentInstruction:
    'Populate review signals for every changed field target before submitting. Use empty arrays only after considering the signal.',
  humanReviewInstruction:
    'Review keyword mapping, unassigned keywords, warnings, rationale, and final value fit before approval.',
};
const LOCAL_PRICING_REVIEW_SIGNAL_CONTRACT = {
  kind: 'localizeaso_review_signal_contract',
  requiredPerTarget: LOCAL_REVIEW_SIGNAL_FIELDS,
  requiredPerTargetLabels: LOCAL_PRICING_REVIEW_SIGNAL_FIELD_LABELS,
  requiredReviewContext: LOCAL_REQUIRED_REVIEW_CONTEXT,
  requiredReviewContextLabels: LOCAL_REQUIRED_REVIEW_CONTEXT_LABELS,
  targetLevels: ['pricing-change'],
  emptySignalsMeanConsidered: true,
  qualityGates: {
    missingKeywordMapping:
      'Pricing targets normally have empty keyword arrays, but the agent should still include them explicitly so the reviewer sees that keyword mapping was considered not applicable.',
    missingRationale: 'Each changed field target needs rationale for the proposed value and any tradeoff.',
    noWarningsReported:
      'An empty warnings array is allowed and means the agent found no warning after checking limits, schedules, keyword fit, and source context.',
  },
  agentInstruction:
    'Populate review signals for every changed field target before submitting. Use empty arrays only after considering the signal.',
  humanReviewInstruction:
    'Review pricing context, warnings, rationale, final value fit, and the not-applicable keyword mapping marker before approval.',
};

function localFieldReviewSignalContract(surface) {
  if (surface === 'pricing') return LOCAL_PRICING_REVIEW_SIGNAL_CONTRACT;
  const targetLevel = surface ? `${surface}-field-change` : 'field';
  return {
    ...LOCAL_FIELD_REVIEW_SIGNAL_CONTRACT,
    targetLevels: [targetLevel],
  };
}

function localMissingReviewSignalFields(value) {
  if (!isRecord(value)) return LOCAL_REVIEW_SIGNAL_FIELDS;
  return LOCAL_REVIEW_SIGNAL_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
}

function localReviewSignalContractUsesPricingKeywordMarker(contract) {
  return Array.isArray(contract?.requiredPerTargetLabels) &&
    contract.requiredPerTargetLabels.some((label) => asCleanString(label).toLowerCase() === 'keyword mapping n/a');
}

function throwLocalReviewSignalContractError({ path, targetLabel, target, value, contract, agentInstruction }) {
  const missingFields = localMissingReviewSignalFields(value);
  if (!missingFields.length) return;
  const missingText = missingFields.join(', ');
  const signalGuidance = localReviewSignalContractUsesPricingKeywordMarker(contract)
    ? 'include empty keyword arrays when ASO keyword mapping is not applicable, and still include warnings plus rationale for the human reviewer.'
    : 'include empty arrays when no keyword or warning items apply so the human reviewer can verify the signal was considered.';
  throw new BackendRequestError({
    status: 400,
    path,
    payload: {
      code: 'REVIEW_SIGNAL_CONTRACT_REQUIRED',
      target,
      missingFields,
      reviewSignalContract: contract,
      agentInstruction,
    },
    message: `${targetLabel} must include ${missingText} review signal field${
      missingFields.length === 1 ? '' : 's'
    }; ${signalGuidance}`,
  });
}

function preflightScreenshotProposalSignals(body, path) {
  const payload = isRecord(body?.payload) ? body.payload : {};
  const locales = Array.isArray(payload.locales) ? payload.locales : [];
  const agentInstruction =
    'Include explicit assignedKeywords, unassignedKeywords, warnings, and rationale on every proposed locale, frame, and layer target. Use empty arrays or an empty rationale only after considering that signal for the human reviewer.';

  for (const localeProposal of locales) {
    if (!isRecord(localeProposal)) continue;
    const locale = asCleanString(localeProposal.locale);
    throwLocalReviewSignalContractError({
      path,
      targetLabel: `Proposal locale ${locale || 'unknown'}`,
      target: { kind: 'locale', locale },
      value: localeProposal,
      contract: LOCAL_SCREENSHOT_REVIEW_SIGNAL_CONTRACT,
      agentInstruction,
    });
    const frames = Array.isArray(localeProposal.frames) ? localeProposal.frames : [];
    for (const frameProposal of frames) {
      if (!isRecord(frameProposal)) continue;
      const frameId = asCleanString(frameProposal.frameId);
      throwLocalReviewSignalContractError({
        path,
        targetLabel: `Proposal frame ${frameId || 'unknown'} for locale ${locale || 'unknown'}`,
        target: { kind: 'frame', locale, frameId },
        value: frameProposal,
        contract: LOCAL_SCREENSHOT_REVIEW_SIGNAL_CONTRACT,
        agentInstruction,
      });
      const layers = Array.isArray(frameProposal.layers) ? frameProposal.layers : [];
      for (const layerProposal of layers) {
        if (!isRecord(layerProposal)) continue;
        const layerId = asCleanString(layerProposal.layerId);
        throwLocalReviewSignalContractError({
          path,
          targetLabel: `Proposal layer ${layerId || 'unknown'} in frame ${frameId || 'unknown'} for locale ${locale || 'unknown'}`,
          target: { kind: 'layer', locale, frameId, layerId },
          value: layerProposal,
          contract: LOCAL_SCREENSHOT_REVIEW_SIGNAL_CONTRACT,
          agentInstruction,
        });
      }
    }
  }
}

function preflightFieldProposalSignals(body, path) {
  const payload = isRecord(body?.payload) ? body.payload : {};
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const fieldAgentInstruction =
    'Include explicit assignedKeywords, unassignedKeywords, warnings, and rationale on every proposed field target. Use empty arrays or an empty rationale only after considering that signal for the human reviewer.';
  const pricingAgentInstruction =
    'Include explicit assignedKeywords, unassignedKeywords, warnings, and rationale on every proposed pricing change target. Use empty keyword arrays when ASO keyword mapping is not applicable, and still include warnings plus rationale for the human reviewer.';

  for (const change of changes) {
    if (!isRecord(change)) continue;
    const target = isRecord(change.target) ? change.target : {};
    const pricingTarget = asCleanString(target.surface) === 'pricing';
    const targetLabel = `Proposal field target ${JSON.stringify([
      asCleanString(target.surface),
      asCleanString(target.locale),
      asCleanString(target.field),
      asCleanString(target.entityId),
      asCleanString(target.territoryId),
    ])}`;
    throwLocalReviewSignalContractError({
      path,
      targetLabel,
      target,
      value: change,
      contract: localFieldReviewSignalContract(asCleanString(target.surface)),
      agentInstruction: pricingTarget ? pricingAgentInstruction : fieldAgentInstruction,
    });
  }
}

async function main() {
  const { command, jobId, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'monetization-boundary' || command === 'pricing-boundary' || command === 'plans') {
    await writeJson(buildMonetizationBoundary(monetizationBoundaryKind(flags)), flags.out);
    return;
  }

  if (command === 'bundle') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/agent-bundle`);
    const agentBundle = withAgentBundleMetadata(normalizeReviewUrlsForLocalDashboard(payload.agentBundle), 'screenshots');
    await writeOptionalJson(handoffExportPayload(agentBundle?.handoff), flags.handoff);
    const browserOpen = await maybeOpenReview(agentBundle, flags);
    await writeJson(withReviewAuthHandoff(agentBundle, browserOpen), flags.out);
    return;
  }

  if (command === 'jobs' || command === 'screenshot-jobs') {
    await writeJson(await fetchReviewJobs('screenshots', flags), flags.out);
    return;
  }

  if (command === 'review-jobs' || command === 'workspace-jobs') {
    await writeJson(await fetchReviewWorkspaceJobs(flags), flags.out);
    return;
  }

  if (command === 'review-open-next' || command === 'workspace-open-next') {
    const queue = await fetchReviewWorkspaceJobs(flags);
    const nextJob = queue.nextJob;
    if (!nextJob?.id) {
      await writeJson({
        ...queue,
        opened: false,
        message: 'No review job needs human navigation.',
      }, flags.out);
      return;
    }
    const encodedJobId = requireJobId(nextJob.id);
    const endpoint =
      nextJob.kind === 'field'
        ? `/field-review/jobs/${encodedJobId}/agent-bundle`
        : `/screenshot-review/jobs/${encodedJobId}/agent-bundle`;
    const payload = await request(endpoint);
    const url = getReviewUrl(payload.agentBundle);
    const browserOpen = await openHumanReviewUrl(url);
    await writeJson({
      ...openReviewNavigationPayload(
        url,
        encodedJobId,
        nextJob.kind === 'field' ? 'field' : 'screenshots',
        fieldReviewSurfaceFromBundle(payload.agentBundle),
        browserOpen,
      ),
      queue,
      openedJob: nextJob,
      workspaceReviewNavigation: true,
    }, flags.out);
    return;
  }

  if (command === 'open-next' || command === 'screenshot-open-next') {
    const queue = await fetchReviewJobs('screenshots', flags);
    const nextJob = queue.nextJob;
    if (!nextJob?.id) {
      await writeJson({
        ...queue,
        opened: false,
        message: 'No screenshot review job needs human navigation.',
      }, flags.out);
      return;
    }
    const encodedJobId = requireJobId(nextJob.id);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/agent-bundle`);
    const url = getReviewUrl(payload.agentBundle);
    const browserOpen = await openHumanReviewUrl(url);
    await writeJson({
      ...openReviewNavigationPayload(url, encodedJobId, 'screenshots', '', browserOpen),
      queue,
      openedJob: nextJob,
    }, flags.out);
    return;
  }

  if (command === 'handoff-summary' || command === 'screenshot-handoff-summary') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(handoffCommandSummaryFromBundle(bundle, 'screenshots'), flags.out);
    return;
  }

  if (command === 'open' || command === 'screenshot-open') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/agent-bundle`);
    const url = getReviewUrl(payload.agentBundle);
    const browserOpen = await openHumanReviewUrl(url);
    await writeJson(openReviewNavigationPayload(url, encodedJobId, 'screenshots', '', browserOpen), flags.out);
    return;
  }

  if (command === 'keyword-brief' || command === 'screenshot-keyword-brief') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(buildScreenshotKeywordBrief(bundle), flags.out);
    return;
  }

  if (command === 'keyword-automation' || command === 'screenshot-keyword-automation') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(keywordAutomationRunbookFromBundle(bundle, 'Screenshot review bundle', 'screenshot'), flags.out);
    return;
  }

  if (command === 'keyword-prompt' || command === 'screenshot-keyword-prompt') {
    const briefFromFile = await readBriefFromFlag(flags);
    const brief = briefFromFile
      ? briefFromFile
      : buildScreenshotKeywordBrief(
          (await readBundleFromFlag(flags, 'agentBundle')) ??
            (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle,
        );
    await writeText(keywordResearchPromptFromBrief(brief, 'screenshot'), flags.out);
    return;
  }

  if (command === 'prompt' || command === 'screenshot-prompt') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeText(agentPromptFromBundle(bundle, 'Screenshot review bundle', 'screenshot'), flags.out);
    return;
  }

  if (command === 'proposal-template' || command === 'screenshot-proposal-template') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/screenshot-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(buildScreenshotProposalTemplate(bundle), flags.out);
    return;
  }

  if (command === 'create' || command === 'screenshot-create') {
    const body = await readJsonFile(flags.file);
    const payload = await request('/screenshot-review/jobs', {
      method: 'POST',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'start' || command === 'screenshot-start') {
    const body = await readJsonFile(flags.file);
    if (flags['keywords-csv'] === true) {
      throw new Error('Provide a CSV file with --keywords-csv <path>.');
    }
    const optionalKeywordCsv = isOptionalAutoCsvFlag(flags['keywords-csv'], flags);
    const csvFlags = { ...flags, file: flags['keywords-csv'] };
    const csvKeywordContext = flags['keywords-csv']
      ? await readKeywordContextFromCsv(csvFlags, { optionalAuto: optionalKeywordCsv })
      : null;
    const keywordCsvDiscovery = csvFlags.__lastCsvDiscovery ?? null;
    if (flags['import-keywords'] && !csvKeywordContext && !optionalKeywordCsv) {
      throw new Error('--import-keywords requires --keywords-csv <path>.');
    }
    const keywordImportAppId = flags['import-keywords'] && csvKeywordContext ? appIdFromJobBody(body, 'start') : null;

    const createPayload = await request('/screenshot-review/jobs', {
      method: 'POST',
      body,
    });
    const createdJobId = requirePayloadJobId(createPayload, 'start');
    const encodedJobId = encodeURIComponent(createdJobId);

    const keywordImportPayload = flags['import-keywords'] && csvKeywordContext
      ? await importAsoKeywordsFromCsv(keywordImportAppId, {
          ...flags,
          file: flags['keywords-csv'],
        })
      : null;

    let keywordContextPayload = null;
    if (csvKeywordContext) {
      keywordContextPayload = await request(`/screenshot-review/jobs/${encodedJobId}/keyword-context`, {
        method: 'PUT',
        body: csvKeywordContext,
      });
    }

    const bundlePayload = await request(`/screenshot-review/jobs/${encodedJobId}/agent-bundle`);
    const agentBundle = withAgentBundleMetadata(normalizeReviewUrlsForLocalDashboard(bundlePayload.agentBundle), 'screenshots');
    const createAgentHandoff = createPayloadStartHandoff(createPayload);
    await writeOptionalJson(agentBundle, flags['bundle-out']);
    await writeOptionalJson(handoffExportPayload(agentBundle?.handoff), flags.handoff);
    const browserOpen = await maybeOpenReview(agentBundle, flags);
    const startReview = reviewStartHumanReview(agentBundle, createAgentHandoff, createdJobId, 'screenshots');
    const reviewConsent = reviewStartConsent(
      'screenshots',
      '',
      startReview,
      createdJobId,
      agentBundle?.handoff?.reviewConsent,
      createAgentHandoff?.reviewConsent,
    );
    await writeJson(
      {
        job: createPayload.job,
        createAgentHandoff,
        keywordImport: keywordImportPayload,
        keywordContextUpdate: keywordContextPayload,
        ...(keywordCsvDiscovery ? { keywordCsvDiscovery } : {}),
        agentBundle,
        monetizationBoundary: buildMonetizationBoundary('screenshots'),
        ...startReview,
        ...(browserOpen
          ? {
              browserOpen,
              reviewAuth: reviewAuthHandoff(browserOpen.reviewUrl, browserOpen),
            }
          : {}),
        reviewConsent,
        handoffSafety: startHandoffSafety('screenshots', 'screenshot_review_start'),
      },
      flags.out,
    );
    return;
  }

  if (command === 'submit-proposal') {
    const encodedJobId = requireJobId(jobId);
    const body = await readJsonFile(flags.file);
    preflightScreenshotProposalSignals(body, `/screenshot-review/jobs/${encodedJobId}/proposals`);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/proposals`, {
      method: 'POST',
      body,
    });
    const handoffPayload = await withPostProposalHumanReviewFallback(payload, encodedJobId, 'screenshot');
    const browserOpen = await maybeOpenPostProposalReview(handoffPayload, flags);
    await writeJson(withReviewAuthHandoff(handoffPayload, browserOpen), flags.out);
    return;
  }

  if (command === 'keyword-context') {
    const encodedJobId = requireJobId(jobId);
    const body = await readJsonFile(flags.file);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/keyword-context`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'keyword-context-from-csv') {
    const body = await readKeywordContextFromCsv(flags, { optionalAuto: true });
    if (!jobId) {
      await writeJson(
        body ?? {
          skipped: true,
          reason: 'missing_optional_astro_csv',
          ...(flags.__lastCsvDiscovery ? { discovery: flags.__lastCsvDiscovery } : {}),
          keywordContext: null,
          message: 'No optional Astro/keyword CSV was found; keyword context conversion was skipped.',
          nextAgentAction: missingOptionalCsvNextAgentAction('conversion'),
        },
        flags.out,
      );
      return;
    }

    const encodedJobId = requireJobId(jobId);
    if (!body) {
      await writeJson(
        {
          jobId: encodedJobId,
          skipped: true,
          reason: 'missing_optional_astro_csv',
          ...(flags.__lastCsvDiscovery ? { discovery: flags.__lastCsvDiscovery } : {}),
          keywordContextUpdate: null,
          message: 'No optional Astro/keyword CSV was found; screenshot keyword context attach was skipped.',
          nextAgentAction: missingOptionalCsvNextAgentAction('screenshot', { jobId: encodedJobId }),
        },
        flags.out,
      );
      return;
    }
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/keyword-context`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'import-aso-keywords-from-csv' || command === 'aso-keywords-import-csv') {
    const appId = requireJobId(jobId);
    await writeJson(await importAsoKeywordsFromCsv(appId, flags), flags.out);
    return;
  }

  if (command === 'save-decisions') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    requireHumanReviewConsent(flags);
    const body = await readDecisionBatch(flags);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/proposals/${proposalId}/decisions`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'approve') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    requireHumanApprovalConsent(flags);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/proposals/${proposalId}/approve`, {
      method: 'POST',
      body: humanApprovalBody(flags),
    });
    await writeJson(withApprovalReceiptPostApprovalGuidance(payload), flags.out);
    return;
  }

  if (command === 'readiness') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/proposals/${proposalId}/readiness`);
    await writeJson(withReviewGateSummary(payload, 'screenshots'), flags.out);
    return;
  }

  if (command === 'refine-request') {
    const encodedJobId = requireJobId(jobId);
    const body = await readRefineRequest(flags);
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/refine-request`, {
      method: 'POST',
      body,
    });
    await writeJson(withRefineNextAgentRunContextBoundary(payload), flags.out);
    return;
  }

  if (command === 'apply-plan') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(
      `/screenshot-review/jobs/${encodedJobId}/apply-plan${screenshotApplyPlanQuery(flags)}`,
    );
    await writeJson(
      withScreenshotApplyPlanHumanCommands(
        withHumanOnlyPostApprovalHandoff(payload.applyPlan, 'screenshot_apply_plan', [
          'Inspect this approved plan before applying it in Figma.',
          'The Figma plugin must still verify the selected app and current file before changing text.',
          'After the human-run Figma apply or screenshot upload succeeds, record the result with the fingerprint-protected LocalizeASO status command.',
        ], summarizeScreenshotApplyPlanForHuman(payload.applyPlan)),
      ),
      flags.out,
    );
    return;
  }

  if (command === 'status') {
    const encodedJobId = requireJobId(jobId);
    const status = requireFlag(flags, 'status');
    const appId = requireFlag(flags, 'app-id');
    const fileKey = requireFlag(flags, 'file-key');
    const humanStatusConsent = requireHumanStatusConsent(status, flags);
    const body =
      status === 'rejected'
        ? { status, appId, fileKey, ...humanStatusConsent }
        : withOptionalScreenshotApprovedProposalGuards(
            withRequiredScreenshotExpectedApplyPlanFingerprint(
              { status, appId, fileKey, ...humanStatusConsent },
              flags,
            ),
            flags,
          );
    const payload = await request(`/screenshot-review/jobs/${encodedJobId}/status`, {
      method: 'POST',
      body,
    });
    const humanOnlyHandoff =
      status === 'rejected'
        ? withHumanOnlyReviewRejectionHandoff(payload, 'screenshot_status', [
            'This status update records an explicit human rejection decision only.',
            'Do not reject screenshot reviews from an autonomous agent pass.',
          ], payload.reviewSummary)
        : withHumanOnlyPostApprovalHandoff(payload, 'screenshot_status', [
            'This status update records a human-run Figma apply or App Store submit outcome.',
            'Do not mark screenshot reviews applied or submitted from an autonomous agent pass.',
          ], payload.reviewSummary);
    await writeJson(
      humanOnlyHandoff,
      flags.out,
    );
    return;
  }

  if (command === 'pricing-parity-manifest' || command === 'pricing-ppp-manifest') {
    const plan = await readJsonFile(flags.file);
    await writeJson(
      normalizePricingParityPlan(plan, {
        ...flags,
        __pricingParityManifestCommand: true,
      }),
      flags.out,
    );
    return;
  }

  if (command === 'pricing-parity' || command === 'pricing-parity-start' || command === 'pricing-ppp-start') {
    const plan = await readJsonFile(flags.file);
    const body = pricingParityStartBody(
      normalizePricingParityPlan(plan, flags, {
        manifestOut: pricingParityManifestOutputPath(flags),
      }),
    );
    await writeOptionalJson(body, flags['manifest-out']);

    const createPayload = await request('/field-review/jobs', {
      method: 'POST',
      body,
    });
    const createdJobId = requirePayloadJobId(createPayload, 'pricing-parity-start');
    const encodedJobId = encodeURIComponent(createdJobId);
    const bundlePayload = await request(`/field-review/jobs/${encodedJobId}/agent-bundle`);
    const agentBundle = withAgentBundleMetadata(normalizeReviewUrlsForLocalDashboard(bundlePayload.agentBundle), 'field');
    const createAgentHandoff = createPayloadStartHandoff(createPayload);

    await writeOptionalJson(agentBundle, flags['bundle-out']);
    await writeOptionalJson(handoffExportPayload(agentBundle?.handoff), flags.handoff);
    const browserOpen = await maybeOpenReview(agentBundle, flags);
    const pricingParityReview = pricingParityStartHumanReview(agentBundle, createAgentHandoff, createdJobId);
    const reviewConsent = reviewStartConsent(
      'field',
      'pricing',
      pricingParityReview,
      createdJobId,
      agentBundle?.handoff?.reviewConsent,
      createAgentHandoff?.reviewConsent,
    );
    await writeJson(
      {
        job: createPayload.job,
        createAgentHandoff,
        pricingParityManifest: body,
        agentBundle,
        monetizationBoundary: buildMonetizationBoundary('pricing'),
        ...pricingParityReview,
        ...(browserOpen
          ? {
              browserOpen,
              reviewAuth: reviewAuthHandoff(browserOpen.reviewUrl, browserOpen),
            }
          : {}),
        reviewConsent,
        handoffSafety: {
          agentSafe: true,
          humanOnly: false,
          humanReviewRequired: true,
          requiresLocalizeAsoPass: true,
          requiredLocalizeAsoCapabilities: ['byoAgent', 'reviewHistory', 'pricingReview'],
          requiresHostedAi: false,
          requiresAppStoreConnectCredentials: false,
          mutatesReviewData: true,
          mutatesPersistentKeywordInventory: false,
          mutatesAppStoreConnect: false,
          proposalSubmissionOnly: false,
          protectedActionsAllowed: false,
          approvalAllowed: false,
          rejectionAllowed: false,
          metadataApplyAllowed: false,
          keywordApplyAllowed: false,
          pricingExportAllowed: false,
          pricingScheduleAllowed: false,
          pricingPublishAllowed: false,
          appStoreUploadAllowed: false,
          appStoreSubmitAllowed: false,
          appStorePublishAllowed: false,
          statusUpdateAllowed: false,
          postApprovalActionAllowed: false,
          humanApprovalConsentGranted: false,
          humanRejectionConsentGranted: false,
          humanPostApprovalConsentGranted: false,
          protectedActions: [
            'human_approval',
            'review_rejection',
            'pricing_export',
            'pricing_schedule',
            'pricing_publish',
            'app_store_submit',
            'status_update',
          ],
          phase: 'pricing_parity_review_start',
          agentInstruction:
            'Pricing parity review job was created. Open the human review screen before approval, scheduling, hosted submit, local asc scheduling, or status updates.',
        },
      },
      flags.out,
    );
    return;
  }

  if (command === 'field-create') {
    const body = fieldReviewBodyWithSurfaceFlag(await readJsonFile(flags.file), flags, 'field-create');
    const payload = await request('/field-review/jobs', {
      method: 'POST',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-start') {
    const body = fieldReviewBodyWithSurfaceFlag(await readJsonFile(flags.file), flags, 'field-start');
    rejectPricingFieldStartKeywordFlags(body, flags);
    if (flags['keywords-csv'] === true) {
      throw new Error('Provide a CSV file with --keywords-csv <path>.');
    }
    const optionalKeywordCsv = isOptionalAutoCsvFlag(flags['keywords-csv'], flags);
    const csvFlags = { ...flags, file: flags['keywords-csv'] };
    const csvKeywordContext = flags['keywords-csv']
      ? await readKeywordContextFromCsv(csvFlags, { optionalAuto: optionalKeywordCsv })
      : null;
    const keywordCsvDiscovery = csvFlags.__lastCsvDiscovery ?? null;
    if (flags['import-keywords'] && !csvKeywordContext && !optionalKeywordCsv) {
      throw new Error('--import-keywords requires --keywords-csv <path>.');
    }
    const keywordImportAppId = flags['import-keywords'] && csvKeywordContext ? appIdFromJobBody(body, 'field-start') : null;

    const createPayload = await request('/field-review/jobs', {
      method: 'POST',
      body,
    });
    const createdJobId = requirePayloadJobId(createPayload, 'field-start');
    const encodedJobId = encodeURIComponent(createdJobId);

    const keywordImportPayload = flags['import-keywords'] && csvKeywordContext
      ? await importAsoKeywordsFromCsv(keywordImportAppId, {
          ...flags,
          file: flags['keywords-csv'],
        })
      : null;

    let keywordSyncPayload = null;
    if (flags['sync-keywords']) {
      keywordSyncPayload = await request(`/field-review/jobs/${encodedJobId}/sync-aso-keywords`, {
        method: 'POST',
      });
    }

    let keywordContextPayload = null;
    if (csvKeywordContext) {
      keywordContextPayload = await request(`/field-review/jobs/${encodedJobId}/keyword-context`, {
        method: 'PUT',
        body: csvKeywordContext,
      });
    }

    const bundlePayload = await request(`/field-review/jobs/${encodedJobId}/agent-bundle`);
    const agentBundle = withAgentBundleMetadata(normalizeReviewUrlsForLocalDashboard(bundlePayload.agentBundle), 'field');
    const createAgentHandoff = createPayloadStartHandoff(createPayload);
    await writeOptionalJson(agentBundle, flags['bundle-out']);
    await writeOptionalJson(handoffExportPayload(agentBundle?.handoff), flags.handoff);
    const browserOpen = await maybeOpenReview(agentBundle, flags);
    const startReview = reviewStartHumanReview(agentBundle, createAgentHandoff, createdJobId, 'field');
    const reviewConsent = reviewStartConsent(
      'field',
      body.surface,
      startReview,
      createdJobId,
      agentBundle?.handoff?.reviewConsent,
      createAgentHandoff?.reviewConsent,
    );
    await writeJson(
      {
        job: createPayload.job,
        createAgentHandoff,
        keywordImport: keywordImportPayload,
        keywordSync: keywordSyncPayload,
        keywordContextUpdate: keywordContextPayload,
        ...(keywordCsvDiscovery ? { keywordCsvDiscovery } : {}),
        agentBundle,
        monetizationBoundary: monetizationBoundaryForReview('field', body.surface),
        ...startReview,
        ...(browserOpen
          ? {
              browserOpen,
              reviewAuth: reviewAuthHandoff(browserOpen.reviewUrl, browserOpen),
            }
          : {}),
        reviewConsent,
        handoffSafety: startHandoffSafety('field', 'field_review_start', body.surface),
      },
      flags.out,
    );
    return;
  }

  if (command === 'field-bundle') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/field-review/jobs/${encodedJobId}/agent-bundle`);
    const agentBundle = withAgentBundleMetadata(normalizeReviewUrlsForLocalDashboard(payload.agentBundle), 'field');
    await writeOptionalJson(handoffExportPayload(agentBundle?.handoff), flags.handoff);
    const browserOpen = await maybeOpenReview(agentBundle, flags);
    await writeJson(withReviewAuthHandoff(agentBundle, browserOpen), flags.out);
    return;
  }

  if (command === 'field-handoff-summary') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(handoffCommandSummaryFromBundle(bundle, 'field'), flags.out);
    return;
  }

  if (command === 'field-jobs') {
    await writeJson(await fetchReviewJobs('field', flags), flags.out);
    return;
  }

  if (command === 'field-open-next') {
    const queue = await fetchReviewJobs('field', flags);
    const nextJob = queue.nextJob;
    if (!nextJob?.id) {
      await writeJson({
        ...queue,
        opened: false,
        message: 'No field review job needs human navigation.',
      }, flags.out);
      return;
    }
    const encodedJobId = requireJobId(nextJob.id);
    const payload = await request(`/field-review/jobs/${encodedJobId}/agent-bundle`);
    const url = getReviewUrl(payload.agentBundle);
    const browserOpen = await openHumanReviewUrl(url);
    await writeJson({
      ...openReviewNavigationPayload(
        url,
        encodedJobId,
        'field',
        fieldReviewSurfaceFromBundle(payload.agentBundle),
        browserOpen,
      ),
      queue,
      openedJob: nextJob,
    }, flags.out);
    return;
  }

  if (command === 'field-open') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/field-review/jobs/${encodedJobId}/agent-bundle`);
    const url = getReviewUrl(payload.agentBundle);
    const browserOpen = await openHumanReviewUrl(url);
    await writeJson(
      openReviewNavigationPayload(
        url,
        encodedJobId,
        'field',
        fieldReviewSurfaceFromBundle(payload.agentBundle),
        browserOpen,
      ),
      flags.out,
    );
    return;
  }

  if (command === 'field-keyword-brief') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(buildFieldKeywordBrief(bundle), flags.out);
    return;
  }

  if (command === 'field-aso-keyword-map') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    if (bundleFromFile) {
      assertFieldKeywordResearchSurface(bundleFromFile);
      await writeJson(
        {
          jobId: bundleFromFile?.job?.id,
          appId: bundleFromFile?.appId,
          surface: bundleFromFile?.surface,
          asoKeywordMap: bundleFromFile?.asoKeywordMap ?? null,
          agentCompatibility: bundleFromFile?.asoKeywordMap?.agentCompatibility ?? {
            audience: 'any_coding_agent',
            protocol: 'provider_neutral_json',
            requiresHumanApprovalBeforeApply: true,
            notes: [
              'Any coding agent can consume this report as read-only proposal context.',
            ],
          },
          agents: bundleFromFile?.asoKeywordMap?.agents ?? ['any-coding-agent'],
          safety: {
            readOnly: true,
            appliesChanges: false,
            submitsToAppStoreConnect: false,
            requiresHumanApprovalBeforeApply: true,
          },
        },
        flags.out,
      );
      return;
    }
    const payload = await request(`/field-review/jobs/${requireJobId(jobId)}/aso-keyword-map`);
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-keyword-automation') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(keywordAutomationRunbookFromBundle(bundle, 'Field review bundle', 'field'), flags.out);
    return;
  }

  if (command === 'field-keyword-prompt') {
    const briefFromFile = await readBriefFromFlag(flags);
    if (briefFromFile) {
      assertFieldKeywordResearchSurface(briefFromFile);
    }
    const brief = briefFromFile
      ? briefFromFile
      : buildFieldKeywordBrief(
          (await readBundleFromFlag(flags, 'agentBundle')) ??
            (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle,
        );
    await writeText(keywordResearchPromptFromBrief(brief, 'field'), flags.out);
    return;
  }

  if (command === 'field-pricing-brief') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(buildFieldPricingBrief(bundle), flags.out);
    return;
  }

  if (command === 'field-prompt') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeText(agentPromptFromBundle(bundle, 'Field review bundle', 'field'), flags.out);
    return;
  }

  if (command === 'field-proposal-template') {
    const bundleFromFile = await readBundleFromFlag(flags, 'agentBundle');
    const bundle = bundleFromFile
      ? bundleFromFile
      : (await request(`/field-review/jobs/${requireJobId(jobId)}/agent-bundle`)).agentBundle;
    await writeJson(buildFieldProposalTemplate(bundle), flags.out);
    return;
  }

  if (command === 'field-keyword-context') {
    const encodedJobId = requireJobId(jobId);
    const body = await readJsonFile(flags.file);
    const payload = await request(`/field-review/jobs/${encodedJobId}/keyword-context`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-keyword-context-from-csv') {
    const encodedJobId = requireJobId(jobId);
    const body = await readKeywordContextFromCsv(flags, { optionalAuto: true });
    if (!body) {
      await writeJson(
        {
          jobId: encodedJobId,
          skipped: true,
          reason: 'missing_optional_astro_csv',
          ...(flags.__lastCsvDiscovery ? { discovery: flags.__lastCsvDiscovery } : {}),
          keywordContextUpdate: null,
          message: 'No optional Astro/keyword CSV was found; field keyword context attach was skipped.',
          nextAgentAction: missingOptionalCsvNextAgentAction('field', {
            jobId: encodedJobId,
            surface: flags.surface,
          }),
        },
        flags.out,
      );
      return;
    }
    const payload = await request(`/field-review/jobs/${encodedJobId}/keyword-context`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-sync-keywords') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/field-review/jobs/${encodedJobId}/sync-aso-keywords`, {
      method: 'POST',
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-submit-proposal') {
    const encodedJobId = requireJobId(jobId);
    const body = await readJsonFile(flags.file);
    preflightFieldProposalSignals(body, `/field-review/jobs/${encodedJobId}/proposals`);
    const payload = await request(`/field-review/jobs/${encodedJobId}/proposals`, {
      method: 'POST',
      body,
    });
    const handoffPayload = await withPostProposalHumanReviewFallback(payload, encodedJobId, 'field');
    const browserOpen = await maybeOpenPostProposalReview(handoffPayload, flags);
    await writeJson(withReviewAuthHandoff(handoffPayload, browserOpen), flags.out);
    return;
  }

  if (command === 'field-save-decisions') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    requireHumanReviewConsent(flags);
    const body = await readDecisionBatch(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/proposals/${proposalId}/decisions`, {
      method: 'PUT',
      body,
    });
    await writeJson(payload, flags.out);
    return;
  }

  if (command === 'field-approve') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    requireHumanApprovalConsent(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/proposals/${proposalId}/approve`, {
      method: 'POST',
      body: humanApprovalBody(flags),
    });
    await writeJson(withApprovalReceiptPostApprovalGuidance(payload), flags.out);
    return;
  }

  if (command === 'field-readiness') {
    const encodedJobId = requireJobId(jobId);
    const proposalId = encodeURIComponent(requireFlag(flags, 'proposal-id'));
    const payload = await request(`/field-review/jobs/${encodedJobId}/proposals/${proposalId}/readiness`);
    await writeJson(withReviewGateSummary(payload, 'field'), flags.out);
    return;
  }

  if (command === 'field-refine-request') {
    const encodedJobId = requireJobId(jobId);
    const body = await readRefineRequest(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/refine-request`, {
      method: 'POST',
      body,
    });
    await writeJson(withRefineNextAgentRunContextBoundary(payload), flags.out);
    return;
  }

  if (command === 'field-apply-plan') {
    const encodedJobId = requireJobId(jobId);
    const payload = await request(`/field-review/jobs/${encodedJobId}/apply-plan${fieldApplyPlanQuery(flags)}`);
    await writeJson(
      withFieldApplyPlanHumanCommands(
        withHumanOnlyPostApprovalHandoff(payload.applyPlan, 'field_apply_plan', [
          'Inspect this approved plan before applying metadata, keywords, or pricing handoffs.',
          'Run only the surface-appropriate fingerprint-protected commands after the human confirms the approved apply plan.',
        ], summarizeFieldApplyPlanForHuman(payload.applyPlan)),
      ),
      flags.out,
    );
    return;
  }

  if (command === 'field-metadata-files') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    requireFieldExpectedApplyPlanFingerprint(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/apply-plan${fieldApplyPlanQuery(flags)}`);
    const exportResult = await exportFieldMetadataFiles(payload.applyPlan, flags);
    const receiptPayload = await request(`/field-review/jobs/${encodedJobId}/metadata-export-receipt`, {
      method: 'POST',
      body: withRequiredFieldExpectedApplyPlanFingerprint(
        withOptionalFieldApprovedProposalGuards(
          { appId: optionalFlag(flags, 'app-id') || undefined, humanPostApprovalConsent: true },
          flags,
        ),
        flags,
      ),
    });
    const exportResultWithReceipt = {
      ...exportResult,
      ...(isRecord(receiptPayload.postApprovalReceipt)
        ? { postApprovalReceipt: receiptPayload.postApprovalReceipt }
        : {}),
      ...(Array.isArray(receiptPayload.postApprovalReceipts)
        ? { postApprovalReceipts: receiptPayload.postApprovalReceipts }
        : {}),
    };
    await writeJson(
      withHumanOnlyPostApprovalHandoff(exportResultWithReceipt, 'field_metadata_files', [
        'This command wrote local metadata files only.',
        'Run validate and dry-run manually before any App Store Connect push.',
      ], exportResult.reviewSummary),
      flags.out,
    );
    return;
  }

  if (command === 'field-apply-drafts') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/apply-drafts`, {
      method: 'POST',
      body: withRequiredFieldExpectedApplyPlanFingerprint(
        withOptionalFieldApprovedProposalGuards(
          { appId: optionalFlag(flags, 'app-id') || undefined, humanPostApprovalConsent: true },
          flags,
        ),
        flags,
      ),
    });
    await writeJson(
      withHumanOnlyPostApprovalHandoff(payload, 'field_apply_drafts', [
        'This command applies approved metadata decisions to LocalizeASO drafts.',
        'Run it only from the human post-approval workflow after reviewing the approved apply plan.',
      ], payload.reviewSummary),
      flags.out,
    );
    return;
  }

  if (command === 'field-apply-keywords') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/apply-keywords`, {
      method: 'POST',
      body: withRequiredFieldExpectedApplyPlanFingerprint(
        withOptionalFieldApprovedProposalGuards(
          { appId: optionalFlag(flags, 'app-id') || undefined, humanPostApprovalConsent: true },
          flags,
        ),
        flags,
      ),
    });
    await writeJson(
      withHumanOnlyPostApprovalHandoff(payload, 'field_apply_keywords', [
        'This command applies approved keyword decisions to the LocalizeASO ASO keyword store.',
        'Run it only from the human post-approval workflow after reviewing the approved keyword plan.',
      ], payload.reviewSummary),
      flags.out,
    );
    return;
  }

  if (command === 'field-pricing-payload') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    requireFieldExpectedApplyPlanFingerprint(flags);
    const payload = await request(`/field-review/jobs/${encodedJobId}/pricing-payload${fieldPricingPayloadQuery(flags)}`);
    if (flags['asc-csv-out'] && flags['asc-csv-out'] !== true) {
      const csv = payload.pricingPayload?.ascExport?.csv;
      if (typeof csv !== 'string' || !csv.trim()) {
        throw new Error('No asc CSV export is available for this pricing payload.');
      }
      await writeFile(flags['asc-csv-out'], csv.endsWith('\n') ? csv : `${csv}\n`, 'utf8');
      console.error(`Wrote ${flags['asc-csv-out']}`);
    }
    const pricingPayloadWithReceipt = {
      ...(isRecord(payload.pricingPayload) ? payload.pricingPayload : {}),
      ...(isRecord(payload.postApprovalReceipt)
        ? { postApprovalReceipt: payload.postApprovalReceipt }
        : {}),
      ...(Array.isArray(payload.postApprovalReceipts)
        ? { postApprovalReceipts: payload.postApprovalReceipts }
        : {}),
    };
    await writeJson(
      withHumanOnlyPostApprovalHandoff(pricingPayloadWithReceipt, 'field_pricing_payload', [
        'Choose the pricing start date manually after reviewing the exported payload.',
        'Run asc imports or LocalizeASO submit-pricing only from the human post-approval workflow.',
      ]),
      flags.out,
    );
    return;
  }

  if (command === 'field-submit-metadata') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    const body = withRequiredFieldExpectedApplyPlanFingerprint(
      withOptionalFieldApprovedProposalGuards({
        appId: optionalFlag(flags, 'app-id') || undefined,
        platform: typeof flags.platform === 'string' ? flags.platform : 'IOS',
        dryRun: Boolean(flags['dry-run']),
        force: Boolean(flags.force),
        humanPostApprovalConsent: true,
      }, flags),
      flags,
    );
    const payload = await request(`/field-review/jobs/${encodedJobId}/submit-metadata`, {
      method: 'POST',
      body,
    });
    await writeJson(
      withHumanOnlyPostApprovalHandoff(payload, 'field_submit_metadata', [
        'This command starts the human-approved App Store Connect metadata push workflow.',
        'Do not submit metadata from an autonomous agent pass.',
      ], payload.reviewSummary),
      flags.out,
    );
    return;
  }

  if (command === 'field-submit-pricing') {
    const encodedJobId = requireJobId(jobId);
    requireHumanPostApprovalConsent(flags);
    const body = withRequiredFieldExpectedApplyPlanFingerprint(
      withOptionalFieldApprovedProposalGuards({
        appId: optionalFlag(flags, 'app-id') || undefined,
        startDate: typeof flags['start-date'] === 'string' ? flags['start-date'] : undefined,
        concurrency: typeof flags.concurrency === 'string' ? Number(flags.concurrency) : undefined,
        overwriteExistingScheduled: Boolean(flags['overwrite-existing-scheduled']),
        humanPostApprovalConsent: true,
      }, flags),
      flags,
    );
    const payload = await request(`/field-review/jobs/${encodedJobId}/submit-pricing`, {
      method: 'POST',
      body,
    });
    await writeJson(
      withHumanOnlyPostApprovalHandoff(payload, 'field_submit_pricing', [
        'This command starts the human-approved App Store Connect pricing schedule workflow.',
        'Do not schedule pricing from an autonomous agent pass.',
      ], payload.reviewSummary),
      flags.out,
    );
    return;
  }

  if (command === 'field-status') {
    const encodedJobId = requireJobId(jobId);
    const status = requireFlag(flags, 'status');
    const humanStatusConsent = requireHumanStatusConsent(status, flags);
    const body =
      status === 'rejected'
        ? { status, appId: optionalFlag(flags, 'app-id') || undefined, ...humanStatusConsent }
        : withRequiredFieldExpectedApplyPlanFingerprint(
            withOptionalFieldApprovedProposalGuards(
              { status, appId: optionalFlag(flags, 'app-id') || undefined, ...humanStatusConsent },
              flags,
            ),
            flags,
          );
    const payload = await request(`/field-review/jobs/${encodedJobId}/status`, {
      method: 'POST',
      body,
    });
    const humanOnlyHandoff =
      status === 'rejected'
        ? withHumanOnlyReviewRejectionHandoff(payload, 'field_status', [
            'This status update records an explicit human rejection decision only.',
            'Do not reject field reviews from an autonomous agent pass.',
          ], payload.reviewSummary)
        : withHumanOnlyPostApprovalHandoff(payload, 'field_status', [
            'This status update records a human-run metadata, keyword, or pricing apply or submit outcome.',
            'Do not mark field reviews applied or submitted from an autonomous agent pass.',
          ], payload.reviewSummary);
    await writeJson(
      humanOnlyHandoff,
      flags.out,
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  if (error instanceof BackendRequestError) {
    process.stdout.write(`${JSON.stringify(backendErrorJson(error), null, 2)}\n`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
