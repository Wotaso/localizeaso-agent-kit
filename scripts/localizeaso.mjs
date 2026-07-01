#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const reviewAgentScript = join(__dirname, 'review-agent.mjs');
const reviewMcpScript = join(__dirname, 'review-mcp.mjs');
const astroMcpExportScript = join(__dirname, 'export-astro-mcp-apps.mjs');
const ensureSharedBuildScript = join(__dirname, 'ensure-shared-build.mjs');
const DEFAULT_CLI_CONFIG_PATH = join(homedir(), '.localizeaso', 'config.json');
const LOCAL_BACKEND_URL = 'http://localhost:8787';
const LOCAL_DASHBOARD_URL = 'http://localhost:5174';

const HUMAN_ONLY_REVIEW_AGENT_COMMANDS = new Set([
  'approve',
  'save-decisions',
  'status',
  'apply-plan',
  'field-approve',
  'field-save-decisions',
  'field-status',
  'field-apply-plan',
  'field-metadata-files',
  'field-apply-drafts',
  'field-apply-keywords',
  'field-pricing-payload',
  'field-submit-metadata',
  'field-submit-pricing',
]);

const FRIENDLY_HUMAN_ONLY_SUBCOMMANDS = new Set([
  ...HUMAN_ONLY_REVIEW_AGENT_COMMANDS,
  'reject',
  'rejected',
  'apply',
  'apply-drafts',
  'apply-keywords',
  'metadata-files',
  'pricing-payload',
  'submit-metadata',
  'submit-pricing',
  'mark-applied',
  'mark-submitted',
  'mark-rejected',
]);

const FRIENDLY_HUMAN_ONLY_REVIEW_COMMANDS = {
  screenshots: {
    reject: 'status',
    rejected: 'status',
    apply: 'apply-plan',
    'mark-applied': 'status',
    'mark-submitted': 'status',
    'mark-rejected': 'status',
  },
  fields: {
    approve: 'field-approve',
    'save-decisions': 'field-save-decisions',
    status: 'field-status',
    reject: 'field-status',
    rejected: 'field-status',
    apply: 'field-apply-plan',
    'apply-plan': 'field-apply-plan',
    'apply-drafts': 'field-apply-drafts',
    'apply-keywords': 'field-apply-keywords',
    'metadata-files': 'field-metadata-files',
    'pricing-payload': 'field-pricing-payload',
    'submit-metadata': 'field-submit-metadata',
    'submit-pricing': 'field-submit-pricing',
    'mark-applied': 'field-status',
    'mark-submitted': 'field-status',
    'mark-rejected': 'field-status',
  },
  metadata: {
    approve: 'field-approve',
    'save-decisions': 'field-save-decisions',
    status: 'field-status',
    reject: 'field-status',
    rejected: 'field-status',
    apply: 'field-apply-drafts',
    'apply-plan': 'field-apply-plan',
    'apply-drafts': 'field-apply-drafts',
    'metadata-files': 'field-metadata-files',
    'submit-metadata': 'field-submit-metadata',
    'mark-applied': 'field-status',
    'mark-submitted': 'field-status',
    'mark-rejected': 'field-status',
  },
  keywords: {
    approve: 'field-approve',
    'save-decisions': 'field-save-decisions',
    status: 'field-status',
    reject: 'field-status',
    rejected: 'field-status',
    apply: 'field-apply-keywords',
    'apply-plan': 'field-apply-plan',
    'apply-keywords': 'field-apply-keywords',
    'mark-applied': 'field-status',
    'mark-submitted': 'field-status',
    'mark-rejected': 'field-status',
  },
  pricing: {
    approve: 'field-approve',
    'save-decisions': 'field-save-decisions',
    status: 'field-status',
    reject: 'field-status',
    rejected: 'field-status',
    apply: 'field-apply-plan',
    'apply-plan': 'field-apply-plan',
    'pricing-payload': 'field-pricing-payload',
    'submit-pricing': 'field-submit-pricing',
    'mark-applied': 'field-status',
    'mark-submitted': 'field-status',
    'mark-rejected': 'field-status',
  },
};

function printUsage() {
  console.log(`LocalizeASO CLI

Friendly entry point for BYO Codex/AI review workflows. Agents may create setup,
keyword context, proposals, and review jobs; protected apply, approval, schedule,
status, upload, publish, and App Store submit actions remain human-only.

Usage:
  localizeaso pricing parity --app-id APP_ID --file pricing-parity-plan.json
  localizeaso pricing popup --app-id APP_ID --file pricing-parity-plan.json
  localizeaso ppp popup --app-id APP_ID --file pricing-parity-plan.json
  localizeaso price-parity --app-id APP_ID --file pricing-parity-plan.json
    Create a pricing field-review job and export the human consent handoff.
    Use pricing popup or add --open when you explicitly want a browser window.
    Requires Agent Pass or hosted pass. Does not approve, export, schedule, or submit.
    ppp, price-parity, and pricing-parity are product aliases for the same safe surface.

  localizeaso pricing bundle JOB_ID --out field-bundle.json
  localizeaso pricing brief JOB_ID --out pricing-brief.json
  localizeaso pricing proposal-template JOB_ID --out field-proposal.json
  localizeaso pricing jobs --app-id APP_ID
  localizeaso pricing open-next --app-id APP_ID
  localizeaso pricing open JOB_ID
  localizeaso pricing popup JOB_ID
  localizeaso pricing readiness JOB_ID --proposal-id PROPOSAL_ID
  localizeaso pricing handoff-summary JOB_ID --out handoff-summary.json
  localizeaso pricing submit JOB_ID --file field-proposal.json [--no-open]
  localizeaso pricing refine JOB_ID --instructions "Reviewer feedback" --out field-refine-result.json
    Safe aliases for existing pricing field-review jobs. They do not approve,
    export/schedule prices, publish, or submit anything.
    Pricing refine snapshots should carry current price, agent proposal, human
    final price, not-applicable keyword mapping markers, pricing evidence,
    territory context, schedule warnings, signal coverage, rationale, decisions,
    and diffs for the next proposal pass.

  localizeaso pricing manifest --app-id APP_ID --file pricing-parity-plan.json --out pricing-field-job.json
    Free/local step. Convert a pricing parity plan into a field-review manifest only.
    Does not create a review job, use hosted AI, touch App Store Connect, or open approval.

  localizeaso boundary [--kind screenshots|field|metadata|keywords|pricing|workspace]
    Print the free/local vs Agent Pass vs hosted pass boundary.

  localizeaso doctor
  localizeaso doctor --json
  localizeaso dashboard doctor [--json]
    Local read-only DX check for backend/dashboard URLs. Detects common local
    dashboard ports and prints the recommended LOCALIZEASO_DASHBOARD value when
    dashboard.test or a stale localhost port would break human review links.
    Use --json when an agent, plugin, or backend handoff should consume the
    recommended URLs without scraping text.
    Also reports whether authenticated review links can be created from
    LOCALIZEASO_TOKEN, so a local agent can distinguish a broken URL from a
    dashboard sign-in/session problem.
    Friendly review and MCP commands auto-inject the detected local dashboard
    URL into their child process when dashboard.test or a stale local dashboard
    URL would break human review links.
    Auto/start/submit aliases return JSON/CLI handoff by default; add --open,
    or use popup/open, when the human is ready to open a browser window.

  localizeaso login [--staging|--prod] [--backend URL] [--dashboard URL]
  localizeaso login --email you@example.com --password-stdin [--backend URL] [--dashboard URL] [--staging]
  localizeaso whoami [--json]
  localizeaso logout
    Stores a local CLI session in ~/.localizeaso/config.json so agents do not
    need LOCALIZEASO_TOKEN in every shell. LOCALIZEASO_TOKEN, LOCALIZEASO_BACKEND,
    and LOCALIZEASO_DASHBOARD still override the local config for CI/automation.

  localizeaso workspace jobs --app-id APP_ID
  localizeaso workspace open-next --app-id APP_ID
  localizeaso workspace boundary
  localizeaso workspace runbook --app-id APP_ID [--astro-app APP_STORE_ID] [--json]
    Inspect the combined Field + Screenshot human-review queue or open the next
    human review screen, or print the workspace monetization boundary.
    Navigation/boundary only; does not approve, apply, publish, schedule, mark
    status, or submit.
    runbook prints an agent-safe BYO workflow for local doctor, Astro keyword
    export/import, metadata/keyword/screenshot/pricing review starts, proposal
    handoff, and human review navigation. It does not run the steps.

  localizeaso astro export [--app APP_STORE_ID] [--keyword-context-out keyword-context.json]
    Read-only Astro MCP export for own tracked apps. Can write provider-neutral
    keyword-context JSON for LocalizeASO review jobs. Does not approve, apply,
    submit, or touch App Store Connect.

  localizeaso astro keywords [--app APP_STORE_ID] [--out keyword-context.json]
  localizeaso astro context [--app APP_STORE_ID] [--out keyword-context.json]
    Friendly read-only Astro MCP keyword-context export for Codex/agent proposal
    generation. Defaults to keyword-context.json and skips ranking history.

  localizeaso keywords import-csv APP_ID --file optional-auto --astro-dir .
    Persist Astro/CSV keyword rows into LocalizeASO ASO keyword inventory.
    Agent-safe setup only; does not approve, apply, publish, schedule, or submit.

  localizeaso keywords attach-field FIELD_JOB_ID --file keyword-context.json
  localizeaso keywords attach-screenshot SCREENSHOT_JOB_ID --file keyword-context.json
  localizeaso keywords attach FIELD_JOB_ID --file keyword-context.json
  localizeaso keywords context FIELD_JOB_ID --file keyword-context.json
  localizeaso keywords attach-field-csv FIELD_JOB_ID --file optional-auto --astro-dir .
  localizeaso keywords attach-screenshot-csv SCREENSHOT_JOB_ID --file optional-auto --astro-dir .
  localizeaso keywords attach-csv FIELD_JOB_ID --file optional-auto --astro-dir .
  localizeaso keywords context-csv FIELD_JOB_ID --file optional-auto --astro-dir .
    Attach provider-neutral JSON or CSV-derived keyword context before proposal generation.
  localizeaso keywords start --file keywords-field-job.json --open
  localizeaso keywords auto --file keywords-field-job.json
  localizeaso keywords auto-import --file keywords-field-job.json
    Recommended for BYO-agent setup: auto uses optional Astro CSV discovery,
    existing keyword sync, and exports the human review handoff; auto-import also
    persists discovered CSV rows into the LocalizeASO ASO keyword inventory.
  localizeaso keywords bundle JOB_ID --out field-bundle.json
  localizeaso keywords prompt JOB_ID --out agent-prompt.md
  localizeaso keywords proposal-template JOB_ID --out field-proposal.json
  localizeaso keywords jobs --app-id APP_ID
  localizeaso keywords open-next --app-id APP_ID
  localizeaso keywords open JOB_ID
  localizeaso keywords popup JOB_ID
  localizeaso keywords readiness JOB_ID --proposal-id PROPOSAL_ID
  localizeaso keywords handoff-summary JOB_ID --out handoff-summary.json
  localizeaso keywords aso-map JOB_ID --out aso-keyword-map.json
  localizeaso keywords submit JOB_ID --file field-proposal.json [--no-open]
  localizeaso keywords refine JOB_ID --instructions "Reviewer feedback" --out field-refine-result.json
    Keyword-review aliases for the field-review surface. They do not approve,
    apply keywords, publish, mark status, or submit anything.

  localizeaso screenshots start --file screenshot-job.json --open
  localizeaso screenshots auto --file screenshot-job.json
  localizeaso screenshots auto-import --file screenshot-job.json
    Recommended for BYO-agent setup: auto uses optional Astro CSV discovery and
    exports the human review handoff; auto-import also persists discovered CSV rows
    into the LocalizeASO ASO keyword inventory before fetching the bundle.
  localizeaso screenshots bundle JOB_ID --out screenshot-bundle.json --handoff screenshot-handoff.json
  localizeaso screenshots prompt JOB_ID --out agent-prompt.md
  localizeaso screenshots proposal-template JOB_ID --out screenshot-proposal.json
  localizeaso screenshots jobs [--app-id APP_ID] [--status proposal_ready]
  localizeaso screenshots open-next [--app-id APP_ID]
  localizeaso screenshots open JOB_ID
  localizeaso screenshots popup JOB_ID
  localizeaso screenshots readiness JOB_ID --proposal-id PROPOSAL_ID
  localizeaso screenshots handoff-summary JOB_ID --out handoff-summary.json
  localizeaso screenshots attach-keywords JOB_ID --file keyword-context.json
  localizeaso screenshots attach JOB_ID --file keyword-context.json
  localizeaso screenshots context JOB_ID --file keyword-context.json
  localizeaso screenshots attach-keywords-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso screenshots attach-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso screenshots context-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso screenshots keyword-brief JOB_ID --out keyword-brief.json
  localizeaso screenshots keyword-prompt JOB_ID --out keyword-agent-prompt.md
  localizeaso screenshots keyword-automation JOB_ID --out keyword-automation.json
  localizeaso screenshots submit JOB_ID --file screenshot-proposal.json [--no-open]
  localizeaso screenshots submit-proposal JOB_ID --file screenshot-proposal.json [--no-open]
  localizeaso screenshots refine JOB_ID --target-locales de-DE --context-snapshot-file copied-review-context.md --instructions "Reviewer feedback" --out screenshot-refine-result.json
  localizeaso fields start --file field-job.json --open
  localizeaso fields auto --file field-job.json
  localizeaso fields auto-import --file field-job.json
    Recommended for metadata/keyword BYO-agent setup: auto uses optional Astro
    CSV discovery, existing keyword sync, and exports the human review handoff.
    Pricing auto-start skips keyword flags and uses pricing brief instead.
  localizeaso fields bundle JOB_ID --out field-bundle.json --handoff field-handoff.json
  localizeaso fields prompt JOB_ID --out agent-prompt.md
  localizeaso fields proposal-template JOB_ID --out field-proposal.json
  localizeaso fields jobs [--app-id APP_ID] [--surface metadata|keywords|pricing] [--status proposal_ready]
  localizeaso fields open-next [--app-id APP_ID] [--surface metadata|keywords|pricing]
  localizeaso fields open JOB_ID
  localizeaso fields popup JOB_ID
  localizeaso fields readiness JOB_ID --proposal-id PROPOSAL_ID
  localizeaso fields handoff-summary JOB_ID --out handoff-summary.json
  localizeaso fields sync-keywords JOB_ID --out synced-keyword-context.json
  localizeaso fields attach-keywords JOB_ID --file keyword-context.json
  localizeaso fields attach JOB_ID --file keyword-context.json
  localizeaso fields context JOB_ID --file keyword-context.json
  localizeaso fields attach-keywords-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso fields attach-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso fields context-csv JOB_ID --file optional-auto --astro-dir .
    Field keyword sync/context commands are metadata/keyword-only; pricing
    field-review jobs reject keyword inputs and use pricing brief instead.
  localizeaso fields keyword-brief JOB_ID --out keyword-brief.json
  localizeaso fields keyword-prompt JOB_ID --out keyword-agent-prompt.md
  localizeaso fields keyword-automation JOB_ID --out keyword-automation.json
  localizeaso fields aso-map JOB_ID --out aso-keyword-map.json
  localizeaso fields pricing-brief JOB_ID --out pricing-brief.json
  localizeaso fields submit JOB_ID --file field-proposal.json [--no-open]
  localizeaso fields submit-proposal JOB_ID --file field-proposal.json [--no-open]
  localizeaso fields refine JOB_ID --target-locales de-DE --context-snapshot-file copied-field-review-context.md --instructions "Reviewer feedback" --out field-refine-result.json
  localizeaso metadata start --file metadata-field-job.json --open
  localizeaso metadata auto --file metadata-field-job.json
  localizeaso metadata auto-import --file metadata-field-job.json
    Recommended for BYO-agent setup: auto uses optional Astro CSV discovery,
    existing keyword sync, and exports the human review handoff; auto-import also
    persists discovered CSV rows into the LocalizeASO ASO keyword inventory.
  localizeaso metadata bundle JOB_ID --out field-bundle.json
  localizeaso metadata prompt JOB_ID --out agent-prompt.md
  localizeaso metadata proposal-template JOB_ID --out field-proposal.json
  localizeaso metadata jobs --app-id APP_ID
  localizeaso metadata open-next --app-id APP_ID
  localizeaso metadata open JOB_ID
  localizeaso metadata popup JOB_ID
  localizeaso metadata readiness JOB_ID --proposal-id PROPOSAL_ID
  localizeaso metadata handoff-summary JOB_ID --out handoff-summary.json
  localizeaso metadata sync-keywords JOB_ID --out synced-keyword-context.json
  localizeaso metadata aso-map JOB_ID --out aso-keyword-map.json
  localizeaso metadata attach-keywords JOB_ID --file keyword-context.json
  localizeaso metadata attach JOB_ID --file keyword-context.json
  localizeaso metadata context JOB_ID --file keyword-context.json
  localizeaso metadata attach-keywords-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso metadata attach-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso metadata context-csv JOB_ID --file optional-auto --astro-dir .
  localizeaso metadata keyword-brief JOB_ID --out keyword-brief.json
  localizeaso metadata keyword-prompt JOB_ID --out keyword-agent-prompt.md
  localizeaso metadata keyword-automation JOB_ID --out keyword-automation.json
  localizeaso metadata submit JOB_ID --file field-proposal.json [--no-open]
  localizeaso metadata refine JOB_ID --instructions "Reviewer feedback" --out field-refine-result.json
    Metadata is a friendly alias for the field-review surface.
    Safe review-job setup, bundle/prompt/template, keyword sync/context attach,
    keyword brief/prompt/automation, proposal submission, open-review, readiness,
    refine, and handoff-summary aliases. The auto aliases add optional Astro CSV
    discovery, existing keyword sync for field reviews, and export the human review
    handoff; auto-import additionally persists discovered CSV rows into the ASO
    keyword inventory. Human-only approve/apply/status commands are not exposed
    on this friendly surface.
    Refine aliases return nextAgentRun for another proposal pass. Treat reviewer
    feedback, copied context snapshots, and nextAgentRun commands as proposal
    context only; they are not human approval receipts, signal-gap consent,
    post-approval consent, or apply-plan fingerprints.

	  localizeaso review <review-agent-command> [...flags]
	    Pass through to the lower-level pnpm review:agent command surface.
	    Use this explicit namespace for human-only approval, apply/export,
	    status, pricing schedule, upload, publish, or submit primitives.

  localizeaso mcp
    Start the safe stdio MCP bridge for Codex/MCP agents.
    Agent-safe tools include:
      localizeaso_local_doctor
      localizeaso_screenshot_auto_start / localizeaso_screenshot_auto_import_start
      localizeaso_metadata_auto_start / localizeaso_metadata_auto_import_start
      localizeaso_keywords_auto_start / localizeaso_keywords_auto_import_start
      localizeaso_field_auto_start / localizeaso_field_auto_import_start
      localizeaso_metadata_proposal_template / localizeaso_metadata_submit_proposal
      localizeaso_keywords_proposal_template / localizeaso_keywords_submit_proposal
      localizeaso_pricing_proposal_template / localizeaso_pricing_submit_proposal
      localizeaso_pricing_brief / localizeaso_pricing_handoff_summary
      localizeaso_pricing_jobs / localizeaso_pricing_open_next / localizeaso_pricing_readiness
      localizeaso_pricing_parity_manifest / localizeaso_pricing_parity / localizeaso_pricing_parity_start
      localizeaso_screenshot_proposal_template / localizeaso_screenshot_submit_proposal
      localizeaso_metadata_keyword_context / localizeaso_metadata_keyword_context_from_csv
      localizeaso_keywords_keyword_context / localizeaso_keywords_keyword_context_from_csv
      localizeaso_metadata_sync_keywords / localizeaso_keywords_sync_keywords
      localizeaso_review_jobs / localizeaso_review_open_next
      localizeaso_workspace_runbook
      localizeaso_astro_keywords / localizeaso_import_aso_keywords_from_csv
    Auto-start MCP tools default to keywordsCsv="optional-auto" and astroDir=".",
    then return the human review handoff for consent/review navigation. Pricing
    auto-start deliberately avoids keyword/Astro inputs and uses pricing briefs.
    The bridge intentionally does not expose approve, reject, apply, status,
    publish, pricing schedule, screenshot upload, or App Store submit tools.

Environment:
  LOCALIZEASO_TOKEN      Optional override for the local CLI login token.
  LOCALIZEASO_CONFIG     Optional path for the local CLI login config.
  LOCALIZEASO_BACKEND    Defaults in review-agent to http://localhost:8787.
  LOCALIZEASO_DASHBOARD  Local review URL fallback. Use localizeaso doctor if
                         Expo/Vite starts the dashboard on another port.
  EXPO_PUBLIC_DASHBOARD_URL also works as the shared local dashboard fallback.
`);
}

function normalizedArgs(argv) {
  const args = [...argv];
  const command = args.shift();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { kind: 'help', args: [] };
  }

  if (command === 'mcp') {
    return { kind: 'mcp', args };
  }

  if (command === 'doctor' || command === 'diagnose' || command === 'health') {
    return { kind: 'doctor', args };
  }

  if (command === 'login' || command === 'logout' || command === 'whoami') {
    return { kind: command, args };
  }

  if (command === 'dashboard' || command === 'dash') {
    const subcommand = args.shift();
    if (!subcommand || subcommand === 'doctor' || subcommand === 'diagnose' || subcommand === 'health') {
      return { kind: 'doctor', args };
    }
    return { kind: 'review-agent', args: [command, subcommand, ...args] };
  }

  if (command === 'astro') {
    return { kind: 'astro-export', args: mapAstroArgs(args) };
  }

  if (command === 'review') {
    return { kind: 'review-agent', args };
  }

  if (command === 'workspace' || command === 'work' || command === 'queue') {
    const workspaceMapped = mapWorkspaceArgs(args);
    if (workspaceMapped.kind === 'workspace-runbook') {
      return workspaceMapped;
    }
    return { kind: 'review-agent', args: workspaceMapped };
  }

  if (command === 'keywords' || command === 'keyword') {
    return mappedFriendlyNamespace('keywords', args, mapKeywordArgs);
  }

  if (command === 'screenshots' || command === 'screenshot') {
    return mappedFriendlyNamespace('screenshots', args, mapScreenshotArgs);
  }

  if (command === 'fields' || command === 'field') {
    return mappedFriendlyNamespace('fields', args, mapFieldArgs);
  }

  if (command === 'metadata') {
    return mappedFriendlyNamespace('metadata', args, (namespaceArgs) => mapFieldArgs(namespaceArgs, 'metadata'));
  }

  if (command === 'boundary' || command === 'monetization-boundary') {
    return { kind: 'review-agent', args: ['monetization-boundary', ...args] };
  }

  if (command === 'pricing') {
    return mappedFriendlyNamespace('pricing', args, mapPricingArgs);
  }

  if (command === 'ppp' || command === 'price-parity' || command === 'pricing-parity') {
    return mappedFriendlyNamespace('pricing', args, mapPricingProductArgs);
  }

  if (HUMAN_ONLY_REVIEW_AGENT_COMMANDS.has(command)) {
    return { kind: 'blocked-human-only', command, args };
  }

  return { kind: 'review-agent', args: [command, ...args] };
}

function mappedFriendlyNamespace(namespace, args, mapper) {
  const subcommand = args[0];
  if (isFriendlyProtectedMutationIntent(namespace, subcommand)) {
    return blockedFriendlyHumanOnly(namespace, subcommand, args.slice(1));
  }
  const mapped = mapper([...args]);
  if (mapped?.kind === 'blocked-human-only') return mapped;
  return { kind: 'review-agent', args: mapped };
}

function blockedFriendlyHumanOnly(namespace, subcommand, args) {
  const reviewCommand = FRIENDLY_HUMAN_ONLY_REVIEW_COMMANDS[namespace]?.[subcommand] ?? subcommand;
  return {
    kind: 'blocked-human-only',
    command: `${namespace} ${subcommand}`,
    reviewCommand,
    args,
  };
}

function isFriendlyHumanOnlySubcommand(subcommand) {
  return FRIENDLY_HUMAN_ONLY_SUBCOMMANDS.has(subcommand);
}

function wantsJsonOutput(args = []) {
  return args.includes('--json') || args.includes('-j');
}

function normalizedSubcommandTokens(subcommand) {
  return String(subcommand ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
}

function isFriendlyProtectedMutationIntent(namespace, subcommand) {
  if (isFriendlyHumanOnlySubcommand(subcommand)) return true;

  const tokens = normalizedSubcommandTokens(subcommand);
  if (!tokens.length) return false;

  const tokenSet = new Set(tokens);
  const hasAny = (values) => values.some((value) => tokenSet.has(value));
  const hasPair = (actions, targets) => hasAny(actions) && hasAny(targets);
  const writeActions = [
    'delete',
    'export',
    'finalize',
    'mutate',
    'mutated',
    'mutates',
    'mutation',
    'mutations',
    'payload',
    'publish',
    'published',
    'push',
    'reorder',
    'replace',
    'schedule',
    'submit',
    'submitted',
    'upload',
    'uploaded',
  ];
  const appStoreTargets = ['app', 'store', 'appstore', 'asc'];
  const surfaceTargets = ['metadata', 'keyword', 'keywords', 'pricing', 'price', 'prices', 'screenshot', 'screenshots'];

  if (hasPair(writeActions, appStoreTargets) || hasPair(writeActions, surfaceTargets)) return true;

  if (namespace === 'metadata') {
    return hasAny(['export', 'mutate', 'mutation', 'publish', 'push', 'replace', 'upload']);
  }
  if (namespace === 'keywords') {
    return hasAny(['export', 'mutate', 'mutation', 'publish', 'push', 'replace', 'upload']);
  }
  if (namespace === 'pricing') {
    return hasAny(['export', 'mutate', 'mutation', 'payload', 'publish', 'push', 'schedule', 'upload']);
  }
  if (namespace === 'screenshots') {
    return hasAny(['delete', 'mutate', 'mutation', 'publish', 'push', 'reorder', 'replace', 'upload']);
  }
  if (namespace === 'fields') {
    return hasAny(['export', 'mutate', 'mutation', 'payload', 'publish', 'push', 'schedule', 'upload']);
  }

  return false;
}

function hasFlag(args, flag) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function hasNoOpenFlag(args) {
  return args.some((arg) => arg === '--no-open' || arg === '--open=false' || arg === '--open=0');
}

function flagValue(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === flag) return args[index + 1];
    if (token.startsWith(`${flag}=`)) return token.slice(flag.length + 1);
  }
  return undefined;
}

function parseLocalFlagArgs(args = []) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const equalIndex = token.indexOf('=');
    if (equalIndex !== -1) {
      flags[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

function withDefaultFlag(args, flag, value) {
  if (hasFlag(args, flag)) return args;
  return value === undefined ? [...args, flag] : [...args, flag, value];
}

function withDefaultOpenFlag(args) {
  if (hasNoOpenFlag(args)) return args;
  return withDefaultFlag(args, '--open');
}

function withProposalSubmitDefaults(args) {
  return args;
}

function withAutoKeywordContextDefaults(args, { includeSync = false, includeImport = false } = {}) {
  let result = [...args];
  if (includeSync) result = withDefaultFlag(result, '--sync-keywords');
  result = withDefaultFlag(result, '--keywords-csv', 'optional-auto');
  result = withDefaultFlag(result, '--astro-dir', '.');
  if (includeImport) result = withDefaultFlag(result, '--import-keywords');
  return result;
}

function withFieldAutoDefaults(args, defaultSurface, options) {
  const surface = flagValue(args, '--surface') ?? defaultSurface;
  if (surface === 'pricing') {
    return [...args];
  }
  return withAutoKeywordContextDefaults(args, options);
}

function mapAstroKeywordContextArgs(args) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--out') {
      result.push('--keyword-context-out');
      if (args[index + 1] !== undefined) {
        result.push(args[index + 1]);
        index += 1;
      }
      continue;
    }
    if (token.startsWith('--out=')) {
      result.push(`--keyword-context-out=${token.slice('--out='.length)}`);
      continue;
    }
    result.push(token);
  }

  let mapped = withDefaultFlag(result, '--keyword-context-out', 'keyword-context.json');
  if (
    !hasFlag(mapped, '--skip-ranking-history') &&
    !hasFlag(mapped, '--history-period') &&
    !hasFlag(mapped, '--max-ranking-history')
  ) {
    mapped = withDefaultFlag(mapped, '--skip-ranking-history');
  }
  return mapped;
}

function mapAstroArgs(args) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'export') {
    return args;
  }
  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['--help'];
  }
  if (
    subcommand === 'keywords' ||
    subcommand === 'keyword-context' ||
    subcommand === 'context' ||
    subcommand === 'context-export'
  ) {
    return mapAstroKeywordContextArgs(args);
  }
  return [subcommand, ...args];
}

function mapWorkspaceArgs(args) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['help'];
  }
  if (
    subcommand === 'runbook' ||
    subcommand === 'agent-runbook' ||
    subcommand === 'prepare' ||
    subcommand === 'plan'
  ) {
    return { kind: 'workspace-runbook', args };
  }
  const mapping = {
    jobs: 'review-jobs',
    list: 'review-jobs',
    queue: 'review-jobs',
    'open-next': 'review-open-next',
    next: 'review-open-next',
    boundary: 'monetization-boundary',
    'monetization-boundary': 'monetization-boundary',
  };
  const command = mapping[subcommand] || 'help';
  return command === 'monetization-boundary'
    ? [command, '--kind', 'workspace', ...args]
    : [command, ...args];
}

function withDefaultSurface(command, args, surface) {
  if (
    command !== 'field-start' &&
    command !== 'field-create' &&
    command !== 'field-jobs' &&
    command !== 'field-open-next' &&
    command !== 'field-sync-keywords' &&
    command !== 'field-keyword-context' &&
    command !== 'field-keyword-context-from-csv' &&
    command !== 'field-keyword-brief' &&
    command !== 'field-keyword-prompt' &&
    command !== 'field-keyword-automation' &&
    command !== 'field-aso-keyword-map'
  ) {
    return [command, ...args];
  }
  if (hasFlag(args, '--surface')) {
    return [command, ...args];
  }
  return [command, ...args, '--surface', surface];
}

function mapPricingArgs(args) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['help'];
  }
  if (isFriendlyHumanOnlySubcommand(subcommand)) {
    return blockedFriendlyHumanOnly('pricing', subcommand, args);
  }

  if (
    subcommand === 'parity' ||
    subcommand === 'review'
  ) {
    return ['pricing-parity', ...args];
  }
  if (subcommand === 'popup' || subcommand === 'review-popup' || subcommand === 'consent-screen') {
    if (hasFlag(args, '--file') || hasFlag(args, '--app-id')) {
      return ['pricing-parity', ...withDefaultOpenFlag(args)];
    }
    return ['field-open', ...args];
  }
  if (subcommand === 'manifest' || subcommand === 'parity-manifest') {
    return ['pricing-parity-manifest', ...args];
  }
  if (subcommand === 'start' || subcommand === 'parity-start') {
    return ['pricing-parity-start', ...args];
  }
  if (subcommand === 'boundary') {
    return ['monetization-boundary', '--kind', 'pricing', ...args];
  }

  const mapping = {
    bundle: 'field-bundle',
    prompt: 'field-prompt',
    'agent-prompt': 'field-prompt',
    'proposal-template': 'field-proposal-template',
    template: 'field-proposal-template',
    'pricing-brief': 'field-pricing-brief',
    brief: 'field-pricing-brief',
    submit: 'field-submit-proposal',
    'submit-proposal': 'field-submit-proposal',
    refine: 'field-refine-request',
    'refine-request': 'field-refine-request',
    open: 'field-open',
    readiness: 'field-readiness',
    'handoff-summary': 'field-handoff-summary',
    jobs: 'field-jobs',
    list: 'field-jobs',
    queue: 'field-jobs',
    'open-next': 'field-open-next',
  };

  const command = mapping[subcommand] || 'help';
  const mappedArgs = command === 'field-submit-proposal' ? withProposalSubmitDefaults(args) : args;
  return withDefaultSurface(command, mappedArgs, 'pricing');
}

function mapPricingProductArgs(args) {
  const [subcommand] = args;
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return mapPricingArgs(args);
  }
  if (subcommand.startsWith('-')) {
    return mapPricingArgs(['parity', ...args]);
  }
  return mapPricingArgs(args);
}

function mapKeywordArgs(args) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['help'];
  }
  if (isFriendlyHumanOnlySubcommand(subcommand)) {
    return blockedFriendlyHumanOnly('keywords', subcommand, args);
  }

  if (subcommand === 'auto' || subcommand === 'auto-start') {
    return withDefaultSurface(
      'field-start',
      withFieldAutoDefaults(args, 'keywords', { includeSync: true }),
      'keywords',
    );
  }
  if (subcommand === 'auto-import' || subcommand === 'auto-start-import') {
    return withDefaultSurface(
      'field-start',
      withFieldAutoDefaults(args, 'keywords', { includeSync: true, includeImport: true }),
      'keywords',
    );
  }
  if (subcommand === 'import-csv' || subcommand === 'import-astro-csv') {
    return ['import-aso-keywords-from-csv', ...args];
  }
  if (subcommand === 'sync-field') {
    return ['field-sync-keywords', ...args];
  }
  if (subcommand === 'context-from-csv' || subcommand === 'convert-csv') {
    return ['keyword-context-from-csv', ...args];
  }
  if (subcommand === 'attach-screenshot') {
    return ['keyword-context', ...args];
  }
  if (subcommand === 'attach-field') {
    return ['field-keyword-context', ...args];
  }
  if (subcommand === 'attach' || subcommand === 'context') {
    return withDefaultSurface('field-keyword-context', args, 'keywords');
  }
  if (subcommand === 'attach-screenshot-csv') {
    return ['keyword-context-from-csv', ...args];
  }
  if (subcommand === 'attach-field-csv') {
    return ['field-keyword-context-from-csv', ...args];
  }
  if (subcommand === 'attach-csv' || subcommand === 'context-csv') {
    return withDefaultSurface('field-keyword-context-from-csv', args, 'keywords');
  }

  const mapping = {
    start: 'field-start',
    create: 'field-create',
    jobs: 'field-jobs',
    list: 'field-jobs',
    queue: 'field-jobs',
    'open-next': 'field-open-next',
    bundle: 'field-bundle',
    prompt: 'field-prompt',
    'agent-prompt': 'field-prompt',
    'proposal-template': 'field-proposal-template',
    template: 'field-proposal-template',
    'submit-proposal': 'field-submit-proposal',
    submit: 'field-submit-proposal',
    open: 'field-open',
    popup: 'field-open',
    'review-popup': 'field-open',
    'consent-screen': 'field-open',
    refine: 'field-refine-request',
    'refine-request': 'field-refine-request',
    readiness: 'field-readiness',
    'handoff-summary': 'field-handoff-summary',
    'sync-keywords': 'field-sync-keywords',
    'sync-keyword-context': 'field-sync-keywords',
    'keyword-context': 'field-keyword-context',
    context: 'field-keyword-context',
    attach: 'field-keyword-context',
    'attach-keywords': 'field-keyword-context',
    'attach-keyword-context': 'field-keyword-context',
    'keyword-context-from-csv': 'field-keyword-context-from-csv',
    'context-csv': 'field-keyword-context-from-csv',
    'attach-csv': 'field-keyword-context-from-csv',
    'attach-keywords-csv': 'field-keyword-context-from-csv',
    'attach-keyword-csv': 'field-keyword-context-from-csv',
    'aso-map': 'field-aso-keyword-map',
    'aso-keyword-map': 'field-aso-keyword-map',
    'keyword-map': 'field-aso-keyword-map',
    'keyword-brief': 'field-keyword-brief',
    'keyword-prompt': 'field-keyword-prompt',
    'keyword-automation': 'field-keyword-automation',
  };

  const command = mapping[subcommand] || 'help';
  const mappedArgs = command === 'field-submit-proposal' ? withProposalSubmitDefaults(args) : args;
  return withDefaultSurface(command, mappedArgs, 'keywords');
}

function mapScreenshotArgs(args) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['help'];
  }
  if (isFriendlyHumanOnlySubcommand(subcommand)) {
    return blockedFriendlyHumanOnly('screenshots', subcommand, args);
  }

  if (subcommand === 'auto' || subcommand === 'auto-start') {
    return ['start', ...withAutoKeywordContextDefaults(args)];
  }
  if (subcommand === 'auto-import' || subcommand === 'auto-start-import') {
    return ['start', ...withAutoKeywordContextDefaults(args, { includeImport: true })];
  }

  const mapping = {
    start: 'start',
    create: 'create',
    jobs: 'jobs',
    list: 'jobs',
    queue: 'jobs',
    'open-next': 'open-next',
    bundle: 'bundle',
    prompt: 'prompt',
    'agent-prompt': 'prompt',
    'proposal-template': 'proposal-template',
    template: 'proposal-template',
    'submit-proposal': 'submit-proposal',
    submit: 'submit-proposal',
    open: 'open',
    popup: 'open',
    'review-popup': 'open',
    'consent-screen': 'open',
    refine: 'refine-request',
    'refine-request': 'refine-request',
    readiness: 'readiness',
    'handoff-summary': 'handoff-summary',
    'keyword-context': 'keyword-context',
    context: 'keyword-context',
    attach: 'keyword-context',
    'attach-keywords': 'keyword-context',
    'attach-keyword-context': 'keyword-context',
    'keyword-context-from-csv': 'keyword-context-from-csv',
    'context-csv': 'keyword-context-from-csv',
    'attach-csv': 'keyword-context-from-csv',
    'attach-keywords-csv': 'keyword-context-from-csv',
    'attach-keyword-csv': 'keyword-context-from-csv',
    'keyword-brief': 'keyword-brief',
    'keyword-prompt': 'keyword-prompt',
    'keyword-automation': 'keyword-automation',
  };

  const command = mapping[subcommand] || 'help';
  const mappedArgs = command === 'submit-proposal' ? withProposalSubmitDefaults(args) : args;
  return [command, ...mappedArgs];
}

function mapFieldArgs(args, defaultSurface) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return ['help'];
  }
  if (isFriendlyHumanOnlySubcommand(subcommand)) {
    return blockedFriendlyHumanOnly(defaultSurface ?? 'fields', subcommand, args);
  }

  if (subcommand === 'auto' || subcommand === 'auto-start') {
    const startArgs = withFieldAutoDefaults(args, defaultSurface, { includeSync: true });
    return defaultSurface ? withDefaultSurface('field-start', startArgs, defaultSurface) : ['field-start', ...startArgs];
  }
  if (subcommand === 'auto-import' || subcommand === 'auto-start-import') {
    const startArgs = withFieldAutoDefaults(args, defaultSurface, { includeSync: true, includeImport: true });
    return defaultSurface ? withDefaultSurface('field-start', startArgs, defaultSurface) : ['field-start', ...startArgs];
  }
  if (subcommand === 'boundary') {
    return ['monetization-boundary', '--kind', defaultSurface ?? 'field', ...args];
  }

  const mapping = {
    start: 'field-start',
    create: 'field-create',
    jobs: 'field-jobs',
    list: 'field-jobs',
    queue: 'field-jobs',
    'open-next': 'field-open-next',
    bundle: 'field-bundle',
    prompt: 'field-prompt',
    'agent-prompt': 'field-prompt',
    'proposal-template': 'field-proposal-template',
    template: 'field-proposal-template',
    'submit-proposal': 'field-submit-proposal',
    submit: 'field-submit-proposal',
    open: 'field-open',
    popup: 'field-open',
    'review-popup': 'field-open',
    'consent-screen': 'field-open',
    refine: 'field-refine-request',
    'refine-request': 'field-refine-request',
    readiness: 'field-readiness',
    'handoff-summary': 'field-handoff-summary',
    'sync-keywords': 'field-sync-keywords',
    'sync-keyword-context': 'field-sync-keywords',
    'keyword-context': 'field-keyword-context',
    context: 'field-keyword-context',
    attach: 'field-keyword-context',
    'attach-keywords': 'field-keyword-context',
    'attach-keyword-context': 'field-keyword-context',
    'keyword-context-from-csv': 'field-keyword-context-from-csv',
    'context-csv': 'field-keyword-context-from-csv',
    'attach-csv': 'field-keyword-context-from-csv',
    'attach-keywords-csv': 'field-keyword-context-from-csv',
    'attach-keyword-csv': 'field-keyword-context-from-csv',
    'aso-map': 'field-aso-keyword-map',
    'aso-keyword-map': 'field-aso-keyword-map',
    'keyword-map': 'field-aso-keyword-map',
    'keyword-brief': 'field-keyword-brief',
    'keyword-prompt': 'field-keyword-prompt',
    'keyword-automation': 'field-keyword-automation',
    'pricing-brief': 'field-pricing-brief',
  };

  const command = mapping[subcommand] || 'help';
  const mappedArgs = command === 'field-submit-proposal' ? withProposalSubmitDefaults(args) : args;
  if (defaultSurface) {
    return withDefaultSurface(command, mappedArgs, defaultSurface);
  }
  return [command, ...mappedArgs];
}

function runNodeScript(script, args, options = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: options.injectLocalDashboard ? envWithDetectedLocalDashboard(process.env) : process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function ensureSharedBuild() {
  if (process.env.LOCALIZEASO_SKIP_SHARED_BUILD === '1') return 0;
  return runNodeScript(ensureSharedBuildScript, []);
}

function cleanEnvUrl(value) {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : '';
}

function readPackageMetadata() {
  try {
    const parsed = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPreviewNpmCliPackage() {
  const metadata = readPackageMetadata();
  return metadata.name === '@localizeaso/cli' && typeof metadata.version === 'string' && metadata.version.includes('-preview');
}

function defaultUrls() {
  return isPreviewNpmCliPackage()
    ? stagingUrls()
    : { backend: LOCAL_BACKEND_URL, dashboard: LOCAL_DASHBOARD_URL };
}

function cliConfigPath(env = process.env) {
  return typeof env.LOCALIZEASO_CONFIG === 'string' && env.LOCALIZEASO_CONFIG.trim()
    ? env.LOCALIZEASO_CONFIG.trim()
    : DEFAULT_CLI_CONFIG_PATH;
}

function readCliConfig(env = process.env) {
  try {
    const raw = readFileSync(cliConfigPath(env), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    return {};
  }
}

function writeCliConfig(config, env = process.env) {
  const path = cliConfigPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms/filesystems that support POSIX permissions.
  }
  return path;
}

function configuredToken(env = process.env) {
  const envToken = typeof env.LOCALIZEASO_TOKEN === 'string' ? env.LOCALIZEASO_TOKEN.trim() : '';
  if (envToken) return envToken;
  const config = readCliConfig(env);
  return typeof config.token === 'string' ? config.token.trim() : '';
}

function stagingUrls() {
  return {
    backend: 'https://api.staging.localizeaso.com',
    dashboard: 'https://dash.staging.localizeaso.com',
  };
}

function productionUrls() {
  return {
    backend: 'https://api.localizeaso.com',
    dashboard: 'https://dash.localizeaso.com',
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function configuredDashboardUrl(env = process.env) {
  const config = readCliConfig(env);
  const defaults = defaultUrls();
  return cleanEnvUrl(
    env.LOCALIZEASO_DASHBOARD ||
      env.LOCALIZEASO_DASHBOARD_URL ||
      env.PUBLIC_DASHBOARD_URL ||
      env.EXPO_PUBLIC_DASHBOARD_URL ||
      config.dashboard ||
      defaults.dashboard ||
      '',
  );
}

function configuredBackendUrl(env = process.env) {
  const config = readCliConfig(env);
  return cleanEnvUrl(env.LOCALIZEASO_BACKEND || config.backend || defaultUrls().backend);
}

function isDashboardTestUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase() === 'dashboard.test';
  } catch {
    return false;
  }
}

function isLocalDashboardUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function localDashboardCandidates(env = process.env) {
  return unique([
    configuredDashboardUrl(env),
    'http://localhost:5174',
    'http://localhost:5173',
    'http://localhost:8081',
    'http://localhost:8084',
    'http://localhost:19006',
  ]).filter((value) => value && !isDashboardTestUrl(value));
}

function probeUrl(url, timeoutMs) {
  const script = `
const url = process.argv[1];
const timeout = Number(process.argv[2] || 1200);
const net = require('node:net');
let parsed;
try {
  parsed = new URL(url);
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'invalid URL' }));
  process.exit(0);
}
const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
const socket = net.connect({ host: parsed.hostname, port });
const done = (payload) => {
  socket.removeAllListeners();
  socket.destroy();
  process.stdout.write(JSON.stringify(payload));
};
socket.setTimeout(timeout);
socket.once('connect', () => done({ ok: true, status: 'listening' }));
socket.once('timeout', () => done({ ok: false, error: 'timeout' }));
socket.once('error', (error) => done({ ok: false, error: error && error.message ? error.message : String(error) }));
`;
  const result = spawnSync(process.execPath, ['-e', script, url, String(timeoutMs)], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: timeoutMs + 1000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error) return { ok: false, error: result.error.message };
  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return { ok: false, error: 'invalid probe response' };
  }
}

export function detectedLocalDashboardUrl({
  env = process.env,
  probe = probeUrl,
  timeoutMs = Number(env.LOCALIZEASO_DASHBOARD_AUTO_TIMEOUT_MS || env.LOCALIZEASO_DOCTOR_TIMEOUT_MS || 250),
} = {}) {
  if (env.LOCALIZEASO_DASHBOARD_AUTO_DETECT === '0') return '';
  if (env.NODE_ENV === 'production') return '';
  const configured = configuredDashboardUrl(env);
  if (configured && !isDashboardTestUrl(configured) && !isLocalDashboardUrl(configured)) return '';

  for (const url of localDashboardCandidates(env)) {
    const result = probe(url, timeoutMs);
    if (result?.ok) return url === configured ? '' : url;
  }
  return '';
}

export function envWithDetectedLocalDashboard(env = process.env, probe = probeUrl) {
  const configured = configuredDashboardUrl(env);
  if (configured && !isDashboardTestUrl(configured) && !isLocalDashboardUrl(configured)) return env;

  const detected = detectedLocalDashboardUrl({ env, probe });
  if (!detected) return env;
  return {
    ...env,
    LOCALIZEASO_DASHBOARD: detected,
  };
}

function parseDoctorOptions(args = []) {
  const json = args.includes('--json') || args.includes('-j');
  return { json };
}

function printAuthUsage(command = 'login') {
  if (command === 'whoami') {
    console.log('Usage: localizeaso whoami [--json]');
    return;
  }
  if (command === 'logout') {
    console.log('Usage: localizeaso logout [--json]');
    return;
  }
  console.log(`Usage:
  localizeaso login [--staging|--prod] [--backend URL] [--dashboard URL]
  localizeaso login --email you@example.com --password-stdin [--backend URL] [--dashboard URL]
  localizeaso login --email you@example.com --password-stdin --staging
  localizeaso login --email you@example.com --password-stdin --prod

Options:
  Default             Open a browser-based dashboard login and wait for approval.
  --email EMAIL        Account email.
  --password-stdin    Read password from stdin.
  --password VALUE    Local-only convenience; avoid in shared shells.
  --backend URL       Backend API URL.
  --dashboard URL     Dashboard URL for review links.
  --staging           Use staging defaults.
  --prod              Use production defaults.
  --no-open           Print the dashboard login link without opening a browser.
  --timeout SECONDS   Browser-login wait timeout. Defaults to 600.
  --json              Print machine-readable result.
`);
}

function localAuthDiagnostics(env = process.env) {
  const tokenAvailable = configuredToken(env).length > 0;
  const authLinkEnabled = env.LOCALIZEASO_AUTH_REVIEW_LINK !== '0';
  const browserOpeningDisabled =
    env.LOCALIZEASO_DISABLE_OPEN === '1' || env.LOCALIZEASO_DISABLE_BROWSER_OPEN === '1';
  const canCreateAuthenticatedReviewLinks = Boolean(tokenAvailable && authLinkEnabled && !browserOpeningDisabled);
  const dashboardSessionMayBeRequired = !canCreateAuthenticatedReviewLinks;
  const guidance = canCreateAuthenticatedReviewLinks
    ? 'Friendly open/submit commands can request short-lived authenticated dashboard continue links for review URLs.'
    : browserOpeningDisabled
      ? 'Browser opening is disabled. Open review URLs manually while signed in, or rerun without LOCALIZEASO_DISABLE_OPEN and with LOCALIZEASO_TOKEN so the CLI can request a short-lived dashboard continue link.'
      : !tokenAvailable
        ? 'LOCALIZEASO_TOKEN is not set. Raw review URLs may land on sign-in unless the browser already has a dashboard session.'
        : 'LOCALIZEASO_AUTH_REVIEW_LINK=0 disables short-lived dashboard continue links; raw review URLs may require an existing dashboard session.';

  return {
    tokenAvailable,
    authLinkEnabled,
    browserOpeningDisabled,
    canCreateAuthenticatedReviewLinks,
    dashboardSessionMayBeRequired,
    guidance,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function localDoctorHandoff({ backendUrl, recommendedDashboard, auth }) {
  const recommendedEnvironment = {
    LOCALIZEASO_BACKEND: backendUrl,
    ...(recommendedDashboard ? { LOCALIZEASO_DASHBOARD: recommendedDashboard } : {}),
    LOCALIZEASO_DISABLE_OPEN: '1',
  };
  const shellExports = Object.entries(recommendedEnvironment).map(
    ([key, value]) => `export ${key}=${shellQuote(value)}`,
  );

  return {
    kind: 'localizeaso_local_doctor_handoff',
    recommendedEnvironment,
    shellExports,
    reviewUrlPolicy: {
      browserOpenDefault: 'disabled_for_agents',
      dashboardTestFallback: recommendedDashboard
        ? `dashboard.test review links should resolve locally as ${recommendedDashboard}/...`
        : 'dashboard.test review links need LOCALIZEASO_DASHBOARD pointing at a running local dashboard.',
      authenticatedReviewLinks: auth.canCreateAuthenticatedReviewLinks
        ? 'available_with_LOCALIZEASO_TOKEN'
        : 'not_available_without_LOCALIZEASO_TOKEN_and_browser_opening',
      humanOpenInstruction:
        'Keep LOCALIZEASO_DISABLE_OPEN=1 for agent runs. A signed-in human can open the returned reviewUrl manually or rerun a specific open/popup command with --open.',
    },
    agentBoundary: {
      mayRun: ['doctor', 'bundle', 'prompt', 'proposal-template', 'keyword-context', 'submit-proposal', 'refine'],
      mustNotRun: ['approve', 'reject', 'apply', 'export', 'schedule-pricing', 'publish', 'submit', 'mark-status'],
    },
  };
}

function doctorReport() {
  const timeoutMs = Number(process.env.LOCALIZEASO_DOCTOR_TIMEOUT_MS || 1200);
  const backendUrl = configuredBackendUrl();
  const dashboardEnv = configuredDashboardUrl();
  const backend = probeUrl(backendUrl, timeoutMs);
  const dashboards = localDashboardCandidates().map((url) => ({
    url,
    result: probeUrl(url, timeoutMs),
  }));
  const recommendedDashboard = dashboards.find((entry) => entry.result.ok)?.url || '';
  const auth = localAuthDiagnostics();
  const ok = Boolean(recommendedDashboard && backend.ok);
  const handoff = localDoctorHandoff({ backendUrl, recommendedDashboard, auth });

  return {
    kind: 'localizeaso_local_doctor',
    ok,
    timeoutMs,
    backend: {
      url: backendUrl,
      ok: Boolean(backend.ok),
      status: backend.status || null,
      error: backend.error || null,
    },
    dashboard: {
      configuredUrl: dashboardEnv || null,
      configuredIsDashboardTest: Boolean(dashboardEnv && isDashboardTestUrl(dashboardEnv)),
      recommendedUrl: recommendedDashboard || null,
      candidates: dashboards.map((entry) => ({
        url: entry.url,
        ok: Boolean(entry.result.ok),
        status: entry.result.status || null,
        error: entry.result.error || null,
      })),
    },
    auth,
    environment: {
      LOCALIZEASO_BACKEND: backendUrl,
      LOCALIZEASO_DASHBOARD: recommendedDashboard || null,
      LOCALIZEASO_TOKEN: auth.tokenAvailable ? 'set' : null,
      LOCALIZEASO_AUTH_REVIEW_LINK: auth.authLinkEnabled ? '1' : '0',
    },
    handoff,
    safety: {
      readOnly: true,
      createsReviewJobs: false,
      approves: false,
      rejects: false,
      applies: false,
      exports: false,
      schedulesPricing: false,
      publishes: false,
      submits: false,
      marksStatus: false,
    },
  };
}

function doctorCheck(args = []) {
  const options = parseDoctorOptions(args);
  const report = doctorReport();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  console.log('LocalizeASO local doctor');
  console.log('');
  console.log(
    `Backend: ${report.backend.url} ${
      report.backend.ok ? 'OK (port listening)' : `not reachable${report.backend.error ? ` (${report.backend.error})` : ''}`
    }`,
  );
  if (report.dashboard.configuredUrl) {
    console.log(
      `Configured dashboard: ${report.dashboard.configuredUrl}${
        report.dashboard.configuredIsDashboardTest ? ' (dashboard.test is not resolvable without local DNS)' : ''
      }`,
    );
  } else {
    console.log('Configured dashboard: not set');
  }
  console.log('');
  console.log('Dashboard candidates:');
  for (const entry of report.dashboard.candidates) {
    console.log(`  ${entry.ok ? 'OK ' : '-- '} ${entry.url}${entry.ok ? ' (port listening)' : ''}`);
  }
  console.log('');
  console.log('Review auth:');
  console.log(`  LOCALIZEASO_TOKEN: ${report.auth.tokenAvailable ? 'set' : 'not set'}`);
  console.log(`  Authenticated review links: ${report.auth.canCreateAuthenticatedReviewLinks ? 'available' : 'not available'}`);
  console.log(`  Browser opening: ${report.auth.browserOpeningDisabled ? 'disabled' : 'enabled'}`);
  console.log(`  ${report.auth.guidance}`);
  console.log('');
  if (report.dashboard.recommendedUrl) {
    console.log(`Recommended: export LOCALIZEASO_DASHBOARD=${report.dashboard.recommendedUrl}`);
    console.log(`Review links from dashboard.test should resolve locally as ${report.dashboard.recommendedUrl}/...`);
  } else {
    console.log('No local dashboard responded. Start it with pnpm --filter asc-dashboard dev -- --port 5174');
  }
  console.log('');
  console.log('Agent environment:');
  for (const line of report.handoff.shellExports) {
    console.log(`  ${line}`);
  }
  console.log(`  ${report.handoff.reviewUrlPolicy.humanOpenInstruction}`);
  console.log('');
  console.log('Safety: doctor is read-only. It does not create review jobs, approve, apply, submit, or mark status.');
  return report.ok ? 0 : 1;
}

function profileUrlsFromFlags(flags = {}) {
  if (flags.staging === true || flags.profile === 'staging') return { profile: 'staging', ...stagingUrls() };
  if (
    flags.prod === true ||
    flags.production === true ||
    flags.profile === 'prod' ||
    flags.profile === 'production'
  ) {
    return { profile: 'production', ...productionUrls() };
  }
  return { profile: 'custom', backend: configuredBackendUrl(), dashboard: configuredDashboardUrl() };
}

function passwordFromLoginFlags(flags) {
  if (typeof flags.password === 'string') return flags.password;
  if (flags['password-stdin'] === true) return readFileSync(0, 'utf8').trimEnd();
  return '';
}

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function shouldOpenBrowser(flags = {}, env = process.env) {
  if (flags.open === false || flags['no-open'] === true) return false;
  if (env.LOCALIZEASO_DISABLE_OPEN === '1' || env.LOCALIZEASO_DISABLE_BROWSER_OPEN === '1') return false;
  return true;
}

function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeLoginSessionConfig({ profile, backend, dashboard, token, user, session }) {
  const existing = readCliConfig();
  const config = {
    ...existing,
    profile,
    backend,
    ...(dashboard ? { dashboard } : {}),
    token,
    user: user ?? null,
    session: {
      token_type: session?.token_type || 'bearer',
      expires_at: session?.expires_at ?? null,
    },
    updatedAt: new Date().toISOString(),
  };
  const path = writeCliConfig(config);
  return { config, path };
}

async function browserLoginCommand({ flags, profile, backend, dashboard, json }) {
  const timeoutSeconds = Number(flags.timeout || flags['timeout-seconds'] || 600);
  const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? timeoutSeconds * 1000
    : 600_000;

  const startResponse = await fetch(`${backend}/auth/cli-device/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: profile.profile }),
  });
  const startPayload = await readJsonResponse(startResponse);
  const loginUrl = typeof startPayload?.loginUrl === 'string' ? startPayload.loginUrl : '';
  const pollIntervalMs = Number(startPayload?.pollIntervalMs || 2000);
  const pollEveryMs = Number.isFinite(pollIntervalMs) ? Math.max(250, pollIntervalMs) : 2000;
  const token = loginUrl ? new URL(loginUrl).searchParams.get('token') || '' : '';

  if (!startResponse.ok || !loginUrl || !token) {
    console.error(startPayload?.error || `Could not start CLI login with HTTP ${startResponse.status}.`);
    return 1;
  }

  const opened = shouldOpenBrowser(flags) ? openBrowser(loginUrl) : false;

  if (json) {
    console.error(`Open this link to connect the LocalizeASO CLI: ${loginUrl}`);
  } else {
    console.log('Open this link to connect the LocalizeASO CLI:');
    console.log(loginUrl);
    console.log('');
    console.log('Waiting for dashboard approval...');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(pollEveryMs);
    const pollResponse = await fetch(`${backend}/auth/cli-device/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const pollPayload = await readJsonResponse(pollResponse);

    if (pollResponse.status === 202) continue;

    const sessionToken = typeof pollPayload?.session?.access_token === 'string'
      ? pollPayload.session.access_token.trim()
      : '';
    if (pollResponse.ok && sessionToken) {
      const { config, path } = writeLoginSessionConfig({
        profile: profile.profile,
        backend,
        dashboard,
        token: sessionToken,
        user: pollPayload.user ?? null,
        session: pollPayload.session ?? null,
      });

      if (json) {
        console.log(
          JSON.stringify(
            {
              kind: 'localizeaso_cli_login',
              ok: true,
              configPath: path,
              profile: config.profile,
              backend,
              dashboard: dashboard || null,
              user: config.user,
              tokenStored: true,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`Logged in${config.user?.email ? ` as ${config.user.email}` : ''}.`);
        console.log(`Saved CLI session to ${path}.`);
      }
      return 0;
    }

    console.error(pollPayload?.error || `CLI login failed with HTTP ${pollResponse.status}.`);
    return 1;
  }

  console.error('CLI login timed out. Run localizeaso login again to create a fresh link.');
  return 1;
}

async function loginCommand(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printAuthUsage('login');
    return 0;
  }
  const { flags } = parseLocalFlagArgs(args);
  const profile = profileUrlsFromFlags(flags);
  const backend = cleanEnvUrl(flags.backend || flags.api || profile.backend);
  const dashboard = cleanEnvUrl(flags.dashboard || profile.dashboard);
  const email = typeof flags.email === 'string' ? flags.email.trim().toLowerCase() : '';
  const password = passwordFromLoginFlags(flags);
  const json = flags.json === true;

  if (!backend) {
    console.error('Missing backend URL. Use --backend URL, --staging, or --prod.');
    return 2;
  }

  if (!email) {
    return browserLoginCommand({ flags, profile, backend, dashboard, json });
  }
  if (!password) {
    console.error('Missing password. Pipe it with --password-stdin or pass --password for local-only tests.');
    return 2;
  }

  const response = await fetch(`${backend}/auth/cli-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await readJsonResponse(response);
  const token = typeof payload?.session?.access_token === 'string' ? payload.session.access_token.trim() : '';

  if (!response.ok || !token) {
    console.error(payload?.error || `Login failed with HTTP ${response.status}.`);
    return 1;
  }

  const { config, path } = writeLoginSessionConfig({
    profile: profile.profile,
    backend,
    dashboard,
    token,
    user: payload.user ?? null,
    session: payload.session ?? null,
  });

  if (json) {
    console.log(
      JSON.stringify(
        {
          kind: 'localizeaso_cli_login',
          ok: true,
          configPath: path,
          profile: config.profile,
          backend,
          dashboard: dashboard || null,
          user: config.user,
          tokenStored: true,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Logged in${config.user?.email ? ` as ${config.user.email}` : ''}.`);
    console.log(`Saved CLI session to ${path}.`);
  }
  return 0;
}

async function logoutCommand(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printAuthUsage('logout');
    return 0;
  }
  const { flags } = parseLocalFlagArgs(args);
  const json = flags.json === true;
  const config = readCliConfig();
  const token = configuredToken();
  const backend = configuredBackendUrl();

  if (token && backend) {
    await fetch(`${backend}/auth/sign-out`, {
      method: 'POST',
      headers: authHeader(token),
    }).catch(() => null);
  }

  const nextConfig = { ...config };
  delete nextConfig.token;
  delete nextConfig.session;
  nextConfig.updatedAt = new Date().toISOString();
  const path = writeCliConfig(nextConfig);

  if (json) {
    console.log(JSON.stringify({ kind: 'localizeaso_cli_logout', ok: true, configPath: path }, null, 2));
  } else {
    console.log(`Logged out. Updated ${path}.`);
  }
  return 0;
}

async function whoamiCommand(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printAuthUsage('whoami');
    return 0;
  }
  const { flags } = parseLocalFlagArgs(args);
  const json = flags.json === true;
  const token = configuredToken();
  const backend = configuredBackendUrl();
  if (!token) {
    const payload = {
      kind: 'localizeaso_cli_whoami',
      ok: false,
      backend,
      authenticated: false,
      error: 'Not logged in. Run localizeaso login --email you@example.com --password-stdin.',
    };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    return 1;
  }

  const response = await fetch(`${backend}/auth/session`, {
    headers: authHeader(token),
  });
  const payload = await readJsonResponse(response);
  const result = {
    kind: 'localizeaso_cli_whoami',
    ok: response.ok && Boolean(payload?.user),
    backend,
    dashboard: configuredDashboardUrl() || null,
    authenticated: Boolean(payload?.user),
    user: payload?.user ?? null,
    isPaid: payload?.isPaid ?? false,
    isTrial: payload?.isTrial ?? false,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.authenticated) {
    console.log(`Logged in${result.user?.email ? ` as ${result.user.email}` : ''}.`);
    console.log(`Backend: ${backend}`);
  } else {
    console.error(payload?.error || `Session check failed with HTTP ${response.status}.`);
  }
  return result.ok ? 0 : 1;
}

function workspaceRunbookCommandStep({ id, label, command, safety, note, monetization, requiresFile }) {
  return {
    id,
    label,
    command,
    safety,
    ...(note ? { note } : {}),
    ...(monetization ? { monetization } : {}),
    ...(requiresFile ? { requiresFile } : {}),
  };
}

function workspaceMonetizationBoundary() {
  const script = `
    import { buildLocalizeAsoMonetizationBoundary } from './packages/asc-shared/dist/index.js';
    process.stdout.write(JSON.stringify(buildLocalizeAsoMonetizationBoundary('workspace')));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function workspaceValueBoundary(boundary) {
  const ledger = boundary && typeof boundary === 'object' && !Array.isArray(boundary)
    ? boundary.valueLedger
    : null;
  const byo = ledger && typeof ledger.byoAgentOneTime === 'object' && !Array.isArray(ledger.byoAgentOneTime)
    ? ledger.byoAgentOneTime
    : {};
  const hosted = ledger && typeof ledger.hostedConvenience === 'object' && !Array.isArray(ledger.hostedConvenience)
    ? ledger.hostedConvenience
    : {};
  const approval = ledger && typeof ledger.approvalGate === 'object' && !Array.isArray(ledger.approvalGate)
    ? ledger.approvalGate
    : {};

  return {
    byoAgentOneTime: {
      purchaseModel: typeof byo.purchaseModel === 'string' ? byo.purchaseModel : 'cheap_one_time_or_lifetime',
      aiCostOwner: typeof byo.aiCostOwner === 'string' ? byo.aiCostOwner : 'customer',
      includes: Array.isArray(byo.includes)
        ? byo.includes
        : [
            'BYO Codex/AI proposal generation',
            'persistent backend review jobs',
            'review history and approval receipts',
            'Figma apply-plan comfort after approval',
            'paid app slot for persisted review work',
          ],
      excludes: Array.isArray(byo.excludes)
        ? byo.excludes
        : ['LocalizeASO-hosted AI spend', 'hosted App Store Connect upload/submit convenience'],
    },
    hostedConvenience: {
      purchaseModel: typeof hosted.purchaseModel === 'string'
        ? hosted.purchaseModel
        : 'paid_hosted_credit_or_subscription',
      aiCostOwner: typeof hosted.aiCostOwner === 'string'
        ? hosted.aiCostOwner
        : 'localizeaso_or_customer_for_submit_only',
      includes: Array.isArray(hosted.includes)
        ? hosted.includes
        : [
            'hosted backend review history and reviewer feedback',
            'Figma comfort handoffs and apply plans after approval',
            'paid app slots for persisted review work',
            'hosted App Store Connect upload/submit convenience after approval',
          ],
      excludes: Array.isArray(hosted.excludes)
        ? hosted.excludes
        : ['using hosted AI budget for BYO-only Agent Pass runs', 'submit, schedule, publish, or apply before human approval'],
    },
    approvalGate: {
      appliesBefore: typeof approval.appliesBefore === 'string'
        ? approval.appliesBefore
        : 'figma_apply_or_app_store_connect_submit',
      required: approval.required !== false,
      agentCanBypass: approval.agentCanBypass === true,
      notes: Array.isArray(approval.notes)
        ? approval.notes
        : [
            'agents may generate proposals and refinements only',
            'humans must approve the exact apply plan before Figma apply or App Store Connect submit',
          ],
    },
  };
}

function workspaceReviewRunbook(args = []) {
  const { flags } = parseLocalFlagArgs(args);
  const appId = typeof flags['app-id'] === 'string' && flags['app-id'].trim()
    ? flags['app-id'].trim()
    : 'APP_ID';
  const astroApp = typeof flags['astro-app'] === 'string' && flags['astro-app'].trim()
    ? flags['astro-app'].trim()
    : 'APP_STORE_ID';
  const metadataFile = typeof flags['metadata-file'] === 'string' && flags['metadata-file'].trim()
    ? flags['metadata-file'].trim()
    : 'metadata-field-job.json';
  const keywordsFile = typeof flags['keywords-file'] === 'string' && flags['keywords-file'].trim()
    ? flags['keywords-file'].trim()
    : 'keywords-field-job.json';
  const screenshotsFile = typeof flags['screenshots-file'] === 'string' && flags['screenshots-file'].trim()
    ? flags['screenshots-file'].trim()
    : 'screenshot-job.json';
  const pricingFile = typeof flags['pricing-file'] === 'string' && flags['pricing-file'].trim()
    ? flags['pricing-file'].trim()
    : 'pricing-parity-plan.json';
  const includePricing = flags.pricing !== false && flags['no-pricing'] !== true;
  const includeMetadata = flags.metadata !== false && flags['no-metadata'] !== true;
  const includeKeywords = flags.keywords !== false && flags['no-keywords'] !== true;
  const includeScreenshots = flags.screenshots !== false && flags['no-screenshots'] !== true;
  const envPrefix = 'LOCALIZEASO_DISABLE_OPEN=1';
  const quotedAppId = shellQuote(appId);
  const quotedAstroApp = shellQuote(astroApp);
  const monetizationBoundary = workspaceMonetizationBoundary();

  const setupSteps = [
    workspaceRunbookCommandStep({
      id: 'local_doctor',
      label: 'Resolve local backend/dashboard URLs',
      command: `${envPrefix} pnpm localizeaso doctor --json`,
      safety: 'read_only',
      note: 'Use the handoff.recommendedEnvironment values before running agent setup commands. Do not open review URLs from the agent session.',
    }),
    workspaceRunbookCommandStep({
      id: 'workspace_boundary',
      label: 'Inspect free/local vs paid boundary',
      command: `${envPrefix} pnpm localizeaso workspace boundary`,
      safety: 'read_only',
      monetization: 'free_local_guidance',
    }),
    workspaceRunbookCommandStep({
      id: 'astro_keyword_context',
      label: 'Export provider-neutral Astro keyword context',
      command: `${envPrefix} pnpm localizeaso astro keywords --app ${quotedAstroApp} --out keyword-context.json`,
      safety: 'read_only',
      note: 'Uses the customer-owned Astro/MCP connection. It does not need App Store Connect credentials in LocalizeASO.',
    }),
    workspaceRunbookCommandStep({
      id: 'import_astro_csv_keywords',
      label: 'Optionally persist discovered Astro CSV keywords',
      command: `${envPrefix} pnpm localizeaso keywords import-csv ${quotedAppId} --file optional-auto --astro-dir .`,
      safety: 'agent_safe_keyword_inventory_setup',
      monetization: 'agent_pass_or_hosted_pass',
      note: 'Persists ASO keyword research rows only. It does not approve, apply, publish, schedule, or submit anything.',
    }),
  ];

  const reviewStartSteps = [];
  if (includeMetadata) {
    reviewStartSteps.push(workspaceRunbookCommandStep({
      id: 'metadata_auto_start',
      label: 'Start metadata review with keyword sync and optional Astro CSV',
      command: `${envPrefix} pnpm localizeaso metadata auto --file ${shellQuote(metadataFile)} --bundle-out metadata-bundle.json --handoff metadata-handoff.json`,
      safety: 'agent_safe_review_job_setup',
      monetization: 'agent_pass_or_hosted_pass',
      requiresFile: metadataFile,
    }));
  }
  if (includeKeywords) {
    reviewStartSteps.push(workspaceRunbookCommandStep({
      id: 'keywords_auto_start',
      label: 'Start keyword review with keyword sync and optional Astro CSV',
      command: `${envPrefix} pnpm localizeaso keywords auto --file ${shellQuote(keywordsFile)} --bundle-out keywords-bundle.json --handoff keywords-handoff.json`,
      safety: 'agent_safe_review_job_setup',
      monetization: 'agent_pass_or_hosted_pass',
      requiresFile: keywordsFile,
    }));
  }
  if (includeScreenshots) {
    reviewStartSteps.push(workspaceRunbookCommandStep({
      id: 'screenshots_auto_start',
      label: 'Start screenshot review with optional Astro CSV keyword context',
      command: `${envPrefix} pnpm localizeaso screenshots auto --file ${shellQuote(screenshotsFile)} --bundle-out screenshot-bundle.json --handoff screenshot-handoff.json`,
      safety: 'agent_safe_review_job_setup',
      monetization: 'agent_pass_or_hosted_pass',
      requiresFile: screenshotsFile,
    }));
  }
  if (includePricing) {
    reviewStartSteps.push(workspaceRunbookCommandStep({
      id: 'pricing_parity_start',
      label: 'Start pricing parity review from local PPP plan',
      command: `${envPrefix} pnpm localizeaso pricing parity --app-id ${quotedAppId} --file ${shellQuote(pricingFile)} --bundle-out pricing-field-bundle.json --handoff pricing-field-handoff.json`,
      safety: 'agent_safe_review_job_setup',
      monetization: 'agent_pass_or_hosted_pass',
      requiresFile: pricingFile,
      note: 'Pricing review uses pricing evidence, not keyword/Astro inputs. Scheduling remains human-only after approval.',
    }));
  }

  const proposalSteps = [];
  if (includeMetadata) {
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'metadata_proposal_template',
      label: 'Create/edit metadata proposal template after bundle fetch',
      command: `${envPrefix} pnpm localizeaso metadata proposal-template FIELD_JOB_ID --out field-proposal.json`,
      safety: 'agent_safe_local_file_template',
    }));
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'metadata_submit_proposal',
      label: 'Submit reviewable metadata proposal',
      command: `${envPrefix} pnpm localizeaso metadata submit FIELD_JOB_ID --file field-proposal.json`,
      safety: 'agent_safe_proposal_submission',
      note: 'Returns the human review handoff without opening a browser by default.',
    }));
  }
  if (includeKeywords) {
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'keywords_proposal_template',
      label: 'Create/edit keyword proposal template after bundle fetch',
      command: `${envPrefix} pnpm localizeaso keywords proposal-template KEYWORD_FIELD_JOB_ID --out keywords-proposal.json`,
      safety: 'agent_safe_local_file_template',
    }));
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'keywords_submit_proposal',
      label: 'Submit reviewable keyword proposal',
      command: `${envPrefix} pnpm localizeaso keywords submit KEYWORD_FIELD_JOB_ID --file keywords-proposal.json`,
      safety: 'agent_safe_proposal_submission',
      note: 'Returns the human review handoff without opening a browser by default.',
    }));
  }
  if (includePricing) {
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'pricing_proposal_template',
      label: 'Create/edit pricing proposal template after pricing brief or bundle fetch',
      command: `${envPrefix} pnpm localizeaso pricing proposal-template PRICING_FIELD_JOB_ID --out pricing-proposal.json`,
      safety: 'agent_safe_local_file_template',
      note: 'Pricing proposals use pricing evidence and territory context, not keyword/Astro inputs.',
    }));
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'pricing_submit_proposal',
      label: 'Submit reviewable pricing proposal',
      command: `${envPrefix} pnpm localizeaso pricing submit PRICING_FIELD_JOB_ID --file pricing-proposal.json`,
      safety: 'agent_safe_proposal_submission',
      note: 'Returns the human review handoff without opening a browser by default; pricing export, scheduling, hosted submit, and status remain human-only after approval.',
    }));
  }
  if (includeScreenshots) {
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'screenshots_proposal_template',
      label: 'Create/edit screenshot proposal template after bundle fetch',
      command: `${envPrefix} pnpm localizeaso screenshots proposal-template SCREENSHOT_JOB_ID --out screenshot-proposal.json`,
      safety: 'agent_safe_local_file_template',
    }));
    proposalSteps.push(workspaceRunbookCommandStep({
      id: 'screenshots_submit_proposal',
      label: 'Submit reviewable screenshot proposal',
      command: `${envPrefix} pnpm localizeaso screenshots submit SCREENSHOT_JOB_ID --file screenshot-proposal.json`,
      safety: 'agent_safe_proposal_submission',
      note: 'Returns the human review handoff without opening a browser by default.',
    }));
  }

  const humanReviewSteps = [
    workspaceRunbookCommandStep({
      id: 'workspace_jobs',
      label: 'Inspect combined human review queue',
      command: `${envPrefix} pnpm localizeaso workspace jobs --app-id ${quotedAppId}`,
      safety: 'read_only_queue_inspection',
    }),
    workspaceRunbookCommandStep({
      id: 'workspace_open_next',
      label: 'Return next review handoff for a signed-in human',
      command: `${envPrefix} pnpm localizeaso workspace open-next --app-id ${quotedAppId}`,
      safety: 'human_review_navigation_only',
      note: 'Returns the next human review handoff without opening a browser. A signed-in human can open the returned reviewUrl manually or rerun with --open intentionally.',
    }),
  ];

  return {
    kind: 'localizeaso_workspace_agent_runbook',
    appId,
    astroApp,
    recommendedEnvironment: {
      LOCALIZEASO_BACKEND: configuredBackendUrl(),
      LOCALIZEASO_DISABLE_OPEN: '1',
      ...(configuredDashboardUrl() ? { LOCALIZEASO_DASHBOARD: configuredDashboardUrl() } : {}),
    },
    workflow: {
      setup: setupSteps,
      reviewStarts: reviewStartSteps,
      proposals: proposalSteps,
      humanReview: humanReviewSteps,
    },
    safety: {
      runbookOnly: true,
      browserOpenDefault: 'disabled_for_agents',
      appStoreConnectCredentialsRequiredForAgentSetup: false,
      hostedAiRequiredForByoAgentSetup: false,
      approvalAllowed: false,
      applyAllowed: false,
      pricingScheduleAllowed: false,
      appStoreSubmitAllowed: false,
      statusUpdateAllowed: false,
      humanOnlyActions: [
        'approve',
        'reject',
        'apply',
        'export-approved-files',
        'schedule-pricing',
        'publish',
        'submit-to-app-store-connect',
        'mark-status',
      ],
    },
    monetization: {
      byoAgent: 'Cheap/one-time Agent Pass can cover persistent review jobs, review history, Figma/field handoffs, and app slots while the customer pays for their own Codex/AI/Astro usage.',
      hosted: 'Hosted Submit Pass covers approved App Store Connect convenience without LocalizeASO-hosted AI; hosted AI proposal generation stays a separate hosted AI/full pass.',
      freeLocal: 'Local manifest creation, local Astro export, proposal templates, and safety runbooks can stay free/open as acquisition surface.',
    },
    valueBoundary: workspaceValueBoundary(monetizationBoundary),
    monetizationBoundary,
    reviewContract: {
      requiredSignalsPerTarget: ['current', 'proposed', 'final', 'assignedKeywords', 'unassignedKeywords', 'warnings', 'rationale', 'diff'],
      screenshotContext: 'Metadata and keyword reviews should inspect context.screenshotContext when available; pricing reviews use pricing evidence instead.',
      noBrowserAgentInstruction:
        'Keep LOCALIZEASO_DISABLE_OPEN=1. Hand review URLs/commands to a signed-in human instead of opening browser windows from the agent session.',
    },
  };
}

function printWorkspaceRunbookText(runbook) {
  console.log('LocalizeASO workspace agent runbook');
  console.log('');
  console.log(`App: ${runbook.appId}`);
  console.log(`Astro app: ${runbook.astroApp}`);
  console.log('');
  console.log('Agent environment:');
  for (const [key, value] of Object.entries(runbook.recommendedEnvironment)) {
    console.log(`  export ${key}=${shellQuote(value)}`);
  }
  for (const [section, steps] of Object.entries(runbook.workflow)) {
    console.log('');
    console.log(`${section}:`);
    for (const step of steps) {
      console.log(`  - ${step.label}`);
      console.log(`    ${step.command}`);
      console.log(`    safety: ${step.safety}`);
      if (step.note) console.log(`    note: ${step.note}`);
    }
  }
  if (runbook.valueBoundary) {
    const byoIncludes = Array.isArray(runbook.valueBoundary.byoAgentOneTime?.includes)
      ? runbook.valueBoundary.byoAgentOneTime.includes.slice(0, 4).join(', ')
      : 'BYO proposal generation, review history, Figma handoffs, app slots';
    const hostedIncludes = Array.isArray(runbook.valueBoundary.hostedConvenience?.includes)
      ? runbook.valueBoundary.hostedConvenience.includes.slice(0, 4).join(', ')
      : 'hosted review history, Figma comfort, app slots, submit convenience';
    const approvalRequired = runbook.valueBoundary.approvalGate?.required !== false ? 'required' : 'optional';
    const approvalBypass = runbook.valueBoundary.approvalGate?.agentCanBypass === true ? 'yes' : 'no';
    console.log('');
    console.log('Value boundary:');
    console.log(`  BYO one-time: ${byoIncludes}`);
    console.log(`  Hosted convenience: ${hostedIncludes}`);
    console.log(`  Approval gate: ${approvalRequired}; agent bypass: ${approvalBypass}`);
  }
  console.log('');
  console.log('Safety: runbook only. It does not approve, apply, export approved files, schedule pricing, publish, submit, or mark status.');
}

function workspaceRunbookCheck(args = []) {
  const { flags } = parseLocalFlagArgs(args);
  const runbook = workspaceReviewRunbook(args);
  const jsonOutput = flags.json === true || flags.json === 'true' || flags.j === true;
  const outPath = typeof flags.out === 'string' && flags.out.trim() ? flags.out.trim() : '';

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(runbook, null, 2), 'utf8');
    console.error(`Wrote ${outPath}`);
  }

  if (jsonOutput || outPath) {
    console.log(JSON.stringify(runbook, null, 2));
  } else {
    printWorkspaceRunbookText(runbook);
  }
  return 0;
}

export function mapLocalizeAsoCliArgs(argv) {
  return normalizedArgs(argv);
}

async function main() {
  const mapped = normalizedArgs(process.argv.slice(2));
  if (mapped.kind === 'help') {
    printUsage();
    return 0;
  }

  if (mapped.kind === 'blocked-human-only') {
    const reviewCommand = mapped.reviewCommand ?? mapped.command;
    if (wantsJsonOutput(mapped.args)) {
      console.log(JSON.stringify({
        kind: 'blocked-human-only',
        command: mapped.command,
        reviewCommand,
        blocked: true,
        agentSafe: false,
        humanOnly: true,
        error:
          `localizeaso ${mapped.command} is a lower-level human-only review-agent command.`,
        nextHumanAction:
          'Open the LocalizeASO review UI or run the lower-level review command only from a concrete human approval/post-approval action.',
        allowedFriendlyAlternatives: [
          'localizeaso workspace jobs --app-id APP_ID',
          'localizeaso workspace open-next --app-id APP_ID',
          'localizeaso metadata open JOB_ID',
          'localizeaso screenshots open JOB_ID',
          'localizeaso pricing open JOB_ID',
        ],
        mcpSafety: {
          agentSafe: false,
          humanOnly: true,
          blocked: true,
          requestedCommand: mapped.command,
          protectedActionsRemainHumanOnly: true,
          approvalApplySubmitStatusAllowed: false,
        },
      }, null, 2));
      return 2;
    }
    console.error(
      [
        `localizeaso ${mapped.command} is a lower-level human-only review-agent command.`,
        `Use localizeaso review ${reviewCommand} ${mapped.args.join(' ')}`.trim(),
        'only from a concrete human approval/post-approval action, or use a friendly safe command such as localizeaso metadata open JOB_ID, localizeaso screenshots open JOB_ID, or localizeaso pricing open JOB_ID.',
      ].join('\n'),
    );
    return 2;
  }

  if (process.env.LOCALIZEASO_CLI_DRY_RUN === '1') {
    console.log(JSON.stringify(mapped, null, 2));
    return 0;
  }

  if (mapped.kind === 'doctor') {
    return doctorCheck(mapped.args);
  }

  if (mapped.kind === 'login') {
    return loginCommand(mapped.args);
  }

  if (mapped.kind === 'logout') {
    return logoutCommand(mapped.args);
  }

  if (mapped.kind === 'whoami') {
    return whoamiCommand(mapped.args);
  }

  if (mapped.kind === 'workspace-runbook') {
    const buildExit = ensureSharedBuild();
    if (buildExit !== 0) return buildExit;
    return workspaceRunbookCheck(mapped.args);
  }

  if (mapped.kind === 'mcp') {
    return runNodeScript(reviewMcpScript, mapped.args, { injectLocalDashboard: true });
  }

  if (mapped.kind === 'astro-export') {
    return runNodeScript(astroMcpExportScript, mapped.args);
  }

  const buildExit = ensureSharedBuild();
  if (buildExit !== 0) return buildExit;
  return runNodeScript(reviewAgentScript, mapped.args, { injectLocalDashboard: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
