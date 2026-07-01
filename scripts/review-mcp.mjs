#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ensureSharedBuild } from './ensure-shared-build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewAgentScript = join(__dirname, 'review-agent.mjs');
const localizeAsoScript = join(__dirname, 'localizeaso.mjs');
const astroMcpExportScript = join(__dirname, 'export-astro-mcp-apps.mjs');
const repoRoot = join(__dirname, '..');
const LOCAL_DASHBOARD_URL = 'http://localhost:5174';
const STAGING_DASHBOARD_URL = 'https://dash.staging.localizeaso.com';

process.stdout.on('error', (error) => {
  if (error?.code === 'EPIPE') process.exit(0);
  throw error;
});

await ensureSharedBuild();
const {
  buildLocalizeAsoMonetizationBoundary,
  formatReviewSignalGapSummaryLine,
  LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY,
  LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY,
  postApprovalPathModeGuidance,
} = await import('../packages/asc-shared/dist/index.js');

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

function defaultDashboardUrl() {
  return isPreviewNpmCliPackage() ? STAGING_DASHBOARD_URL : LOCAL_DASHBOARD_URL;
}

const protocolVersion = '2025-06-18';

const autoKeywordStartProperties = {
  jobFile: { type: 'string', description: 'Path to the review job JSON manifest.' },
  keywordsCsv: {
    type: 'string',
    description:
      'Optional Astro keyword CSV path. Defaults to "optional-auto" so setup continues when no CSV is found.',
    default: 'optional-auto',
  },
  astroDir: {
    type: 'string',
    description: 'Optional project/search directory for keyword CSV discovery. Defaults to ".".',
    default: '.',
  },
  source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
  bundleOut: { type: 'string', description: 'Optional bundle output path.' },
  handoffOut: { type: 'string', description: 'Optional handoff output path.' },
  openReview: {
    type: 'boolean',
    description:
      'Open the human review screen after setup. Defaults to false; set true only when a human is ready for browser navigation. This does not approve or apply changes.',
  },
  out: { type: 'string', description: 'Optional full start-result output path.' },
};

const tools = [
  {
    name: 'localizeaso_local_doctor',
    description:
      'Inspect local LocalizeASO backend/dashboard URL readiness plus authenticated review-link availability, and return the recommended local dashboard origin for human review links. This is read-only local DX diagnostics and does not create review jobs, approve, reject, apply, publish, schedule, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_monetization_boundary',
    description:
      'Explain the LocalizeASO free/local, Agent Pass, hosted pass, BYO AI, and App Store Connect credential boundary. This is read-only, local, and does not require a backend token.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['screenshots', 'field', 'metadata', 'keywords', 'pricing', 'workspace'],
          description: 'Optional review kind for the boundary context.',
        },
        out: { type: 'string', description: 'Optional boundary JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_workspace_runbook',
    description:
      'Build a read-only BYO-agent workspace runbook for local doctor, Astro keyword export/import, metadata/keyword/screenshot/pricing review setup, proposal handoff, and human review navigation. This only returns orchestration guidance; it does not create review jobs, approve, reject, apply, publish, schedule, mark status, open a browser, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'LocalizeASO app ID used in generated commands.' },
        astroApp: { type: 'string', description: 'Astro/App Store app ID used for keyword-context export.' },
        metadataFile: { type: 'string', description: 'Metadata field-review manifest path for generated auto-start command.' },
        keywordsFile: { type: 'string', description: 'Keyword field-review manifest path for generated auto-start command.' },
        screenshotsFile: { type: 'string', description: 'Screenshot review manifest path for generated auto-start command.' },
        pricingFile: { type: 'string', description: 'Pricing parity/PPP plan path for generated pricing review command.' },
        includeMetadata: { type: 'boolean', description: 'Include metadata review setup steps. Defaults to true.' },
        includeKeywords: { type: 'boolean', description: 'Include keyword review setup steps. Defaults to true.' },
        includeScreenshots: { type: 'boolean', description: 'Include screenshot review setup steps. Defaults to true.' },
        includePricing: { type: 'boolean', description: 'Include pricing review setup steps. Defaults to true.' },
        out: { type: 'string', description: 'Optional runbook JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_review_jobs',
    description:
      'Inspect the combined LocalizeASO Field + Screenshot review queue for an app. Read-only; does not approve, reject, apply, publish, schedule, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_review_open_next',
    description:
      'Open the next human review screen across Field + Screenshot review jobs. Navigation only; does not approve, reject, apply, publish, schedule, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keyword_context_from_csv',
    description:
      'Convert Astro-style keyword CSV into LocalizeASO provider-neutral keyword context JSON. This is local/read-only and does not require hosted AI or App Store Connect credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        out: { type: 'string', description: 'Optional output JSON path.' },
      },
      required: ['csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_astro_export',
    description:
      'Export read-only Astro MCP ASO data for own tracked apps and optionally write provider-neutral LocalizeASO keyword-context JSON. This does not create review jobs, approve reviews, apply Figma changes, mutate App Store Connect, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Astro MCP endpoint URL. Defaults to ASTRO_MCP_URL, Codex config, or the local Astro MCP endpoint.' },
        appId: { type: 'string', description: 'Single App Store app ID to export.' },
        appIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'App Store app IDs to export. Can be used instead of appId.',
        },
        developer: { type: 'string', description: 'Own developer filter used when appId/appIds are omitted.' },
        allTracked: { type: 'boolean', description: 'Export every Astro-tracked app. Disables developer and ASC allowlist filtering.' },
        noAscAllowlist: {
          type: 'boolean',
          description: 'Do not intersect selected Astro apps with the local read-only "asc apps list" allowlist.',
        },
        stores: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional store codes/locales to export.',
        },
        outDir: { type: 'string', description: 'Working export directory.' },
        zipPath: { type: 'string', description: 'ZIP output path.' },
        keywordContextOut: {
          type: 'string',
          description: 'Optional provider-neutral LocalizeASO keyword-context JSON output path.',
        },
        keepDir: { type: 'boolean', description: 'Keep the unpacked working directory after ZIP creation.' },
        skipRankingHistory: { type: 'boolean', description: 'Skip per-keyword search ranking history exports.' },
        historyPeriod: {
          type: 'string',
          enum: ['week', 'month', 'year', 'all'],
          description: 'Ranking history period.',
        },
        maxRankingHistory: { type: 'number', description: 'Maximum ranking-history calls.' },
        includeSuggestions: { type: 'boolean', description: 'Export keyword suggestions per app/store.' },
        includeCompetitors: { type: 'boolean', description: 'Export competitor keyword data per keyword/store.' },
        timeoutMs: { type: 'number', description: 'Per HTTP/tool/zip timeout in milliseconds.' },
        pretty: { type: 'boolean', description: 'Pretty-print JSON files.' },
        dryRun: { type: 'boolean', description: 'Discover/filter apps and print the export plan only.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_astro_keywords',
    description:
      'Friendly read-only Astro MCP keyword-context export for Codex/agent proposal generation. Writes provider-neutral LocalizeASO keyword-context JSON by default, skips ranking history by default, and does not create review jobs, approve reviews, apply Figma changes, mutate App Store Connect, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Astro MCP endpoint URL. Defaults to ASTRO_MCP_URL, Codex config, or the local Astro MCP endpoint.' },
        appId: { type: 'string', description: 'Single App Store app ID to export keyword context for.' },
        appIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'App Store app IDs to export keyword context for. Can be used instead of appId.',
        },
        developer: { type: 'string', description: 'Own developer filter used when appId/appIds are omitted.' },
        allTracked: { type: 'boolean', description: 'Export every Astro-tracked app. Disables developer and ASC allowlist filtering.' },
        noAscAllowlist: {
          type: 'boolean',
          description: 'Do not intersect selected Astro apps with the local read-only "asc apps list" allowlist.',
        },
        stores: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional store codes/locales to export.',
        },
        keywordContextOut: {
          type: 'string',
          description: 'Provider-neutral LocalizeASO keyword-context JSON output path. Defaults to keyword-context.json.',
        },
        outDir: { type: 'string', description: 'Optional working export directory.' },
        zipPath: { type: 'string', description: 'Optional ZIP output path.' },
        keepDir: { type: 'boolean', description: 'Keep the unpacked working directory after ZIP creation.' },
        includeSuggestions: { type: 'boolean', description: 'Export keyword suggestions per app/store.' },
        includeCompetitors: { type: 'boolean', description: 'Export competitor keyword data per keyword/store.' },
        timeoutMs: { type: 'number', description: 'Per HTTP/tool/zip timeout in milliseconds.' },
        pretty: { type: 'boolean', description: 'Pretty-print JSON files.' },
        dryRun: { type: 'boolean', description: 'Discover/filter apps and print the export plan only.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_import_aso_keywords_from_csv',
    description:
      'Import Astro-style keyword CSV rows into the persistent LocalizeASO ASO keyword inventory for an app. Requires an active LocalizeASO pass with BYO agent/review history access, but no hosted AI or App Store Connect credentials. This only updates keyword research data and does not approve review jobs, apply Figma changes, push metadata, schedule pricing, or submit anything to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'LocalizeASO app ID.' },
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        out: { type: 'string', description: 'Optional import response output path.' },
      },
      required: ['appId', 'csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_keyword_context',
    description:
      'Attach provider-neutral keyword context JSON to a screenshot review job before proposal generation. This updates review context only and does not require hosted AI or App Store Connect credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        contextFile: { type: 'string', description: 'Path to keyword-context.json.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'contextFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_keyword_context_from_csv',
    description:
      'Convert and attach Astro keyword CSV to a screenshot review job before proposal generation. This updates review context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_keyword_brief',
    description:
      'Build a read-only keyword research brief from a screenshot review bundle/job before proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional screenshot-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional keyword brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_keyword_prompt',
    description:
      'Build a read-only keyword research prompt for Astro/MCP/keyword agents from a screenshot review bundle/job or keyword brief. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile or briefFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional screenshot-bundle.json path for offline prompt generation.' },
        briefFile: { type: 'string', description: 'Optional keyword-brief.json path for prompt generation.' },
        out: { type: 'string', description: 'Optional keyword prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_keyword_automation',
    description:
      'Build a read-only ordered keyword automation runbook for Astro/MCP/CSV research before screenshot proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional screenshot-bundle.json path for offline runbook generation.' },
        out: { type: 'string', description: 'Optional keyword automation runbook output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_agent_prompt',
    description:
      'Build a screenshot proposal-generation prompt from a screenshot review bundle/job. The prompt is for agent proposal creation only and does not approve, reject, apply Figma changes, mark status, or submit screenshots.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional screenshot-bundle.json path for offline prompt generation.' },
        out: { type: 'string', description: 'Optional agent prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_proposal_template',
    description:
      'Write a local screenshot proposal JSON template from a screenshot review bundle/job. It preserves locale/frame/layer IDs and required review-signal fields, but does not submit, approve, apply Figma changes, mark status, or upload screenshots.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional screenshot-bundle.json path for offline template generation.' },
        out: { type: 'string', description: 'Proposal template output path.', default: 'screenshot-proposal.json' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_keyword_context',
    description:
      'Attach provider-neutral keyword context JSON to a metadata or keyword field review job before proposal generation. Pricing reviews use localizeaso_pricing_brief instead. This updates review context only and does not require hosted AI or App Store Connect credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        contextFile: { type: 'string', description: 'Path to keyword-context.json.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'contextFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_keyword_context_from_csv',
    description:
      'Convert and attach Astro keyword CSV to a metadata or keyword field review job before proposal generation. Pricing reviews use localizeaso_pricing_brief instead. This updates review context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_keyword_brief',
    description:
      'Build a read-only keyword research brief from a field review bundle/job before proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional keyword brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_keyword_prompt',
    description:
      'Build a read-only keyword research prompt for Astro/MCP/keyword agents from a field review bundle/job or keyword brief. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile or briefFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        briefFile: { type: 'string', description: 'Optional keyword-brief.json path for prompt generation.' },
        out: { type: 'string', description: 'Optional keyword prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_keyword_automation',
    description:
      'Build a read-only ordered keyword automation runbook for Astro/MCP/CSV research before metadata or keyword field review job proposal generation. Pricing reviews use localizeaso_pricing_brief instead. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline runbook generation.' },
        out: { type: 'string', description: 'Optional keyword automation runbook output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_aso_keyword_map',
    description:
      'Export a read-only ASO keyword detection map for a metadata or keyword field review job. Shows per-locale/per-field keyword matches, popularity, difficulty, unassigned keywords, warnings, and errors for any coding-agent proposal run. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline map export.' },
        out: { type: 'string', description: 'Optional ASO keyword map output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_agent_prompt',
    description:
      'Build a metadata/keyword/pricing field-review proposal-generation prompt from a field review bundle/job. The prompt is for agent proposal creation only and does not approve, reject, apply, mark status, schedule pricing, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        out: { type: 'string', description: 'Optional agent prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_proposal_template',
    description:
      'Write a local metadata/keyword/pricing field proposal JSON template from a field review bundle/job. It preserves target IDs, current values, and required review-signal fields, but does not submit, approve, apply, export, schedule, mark status, or upload anything.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline template generation.' },
        out: { type: 'string', description: 'Proposal template output path.', default: 'field-proposal.json' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_start',
    description:
      'Create a metadata field review job, optionally sync existing keywords and attach Astro CSV context, then return/write the agent bundle. For automated BYO-agent setup, prefer localizeaso_metadata_auto_start or localizeaso_metadata_auto_import_start so Astro CSV discovery and keyword sync are included by default; set openReview=true only for explicit human browser navigation. Does not submit, approve, apply metadata, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        jobFile: { type: 'string', description: 'Path to metadata field-job.json.' },
        syncKeywords: { type: 'boolean', description: 'Sync existing LocalizeASO ASO keywords first.' },
        keywordsCsv: {
          type: 'string',
          description:
            'Optional Astro keyword CSV path, "auto" to require discovery, or "optional-auto" to continue when no CSV exists.',
        },
        astroDir: {
          type: 'string',
          description: 'Optional project/search directory for keywordsCsv="auto" or "optional-auto".',
        },
        importKeywords: {
          type: 'boolean',
          description:
            'Persist the Astro CSV rows into the app-level LocalizeASO ASO keyword inventory before sync/bundle. Requires keywordsCsv, appId in the job file, and an active BYO/review-history pass; does not require hosted AI or App Store Connect credentials.',
        },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        bundleOut: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human metadata review screen after creating the job. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional full start-result output path.' },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_auto_start',
    description:
      'Recommended BYO-agent metadata review starter: sync existing keywords, optionally discover Astro CSV context, and return/write the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply metadata, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_auto_import_start',
    description:
      'Recommended BYO-agent metadata review starter with persistent Astro CSV import: imports discovered CSV rows, syncs keywords, and returns/writes the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply metadata, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_sync_keywords',
    description:
      'Sync existing LocalizeASO ASO keyword rows into a metadata field review job before proposal generation. This attaches existing keyword research context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        out: { type: 'string', description: 'Optional synced keyword-context output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_keyword_context',
    description:
      'Attach provider-neutral keyword context JSON to a metadata field review job before proposal generation. This updates review context only and does not require hosted AI or App Store Connect credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        contextFile: { type: 'string', description: 'Path to keyword-context.json.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'contextFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_keyword_context_from_csv',
    description:
      'Convert and attach Astro keyword CSV to a metadata field review job before proposal generation. This updates review context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_keyword_brief',
    description:
      'Build a read-only keyword research brief from a metadata field review bundle/job before proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional keyword brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_keyword_prompt',
    description:
      'Build a read-only keyword research prompt for Astro/MCP/keyword agents from a metadata field review bundle/job or keyword brief. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile or briefFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        briefFile: { type: 'string', description: 'Optional keyword-brief.json path for prompt generation.' },
        out: { type: 'string', description: 'Optional keyword prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_keyword_automation',
    description:
      'Build a read-only ordered keyword automation runbook for Astro/MCP/CSV research before metadata proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline runbook generation.' },
        out: { type: 'string', description: 'Optional keyword automation runbook output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_aso_keyword_map',
    description:
      'Export a read-only ASO keyword detection map for a metadata field review job. Shows which keywords are detected in which metadata attributes/locales with popularity, difficulty, warnings, and errors for any coding-agent run. Does not attach context, approve, apply metadata, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline map export.' },
        out: { type: 'string', description: 'Optional ASO keyword map output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_bundle',
    description:
      'Fetch a metadata field-review agent bundle and optional handoff commands. This is a metadata-specific alias for field review bundles and does not approve, apply metadata, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        out: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human metadata review screen after fetching the bundle. This only navigates to review; it does not approve or apply changes.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_agent_prompt',
    description:
      'Build a metadata proposal-generation prompt from a metadata field review bundle/job. The prompt is for agent proposal creation only and does not approve, apply metadata, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        out: { type: 'string', description: 'Optional agent prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_proposal_template',
    description:
      'Write a local metadata field proposal JSON template from a metadata field review bundle/job. It preserves target IDs, current values, and review-signal fields, but does not submit, approve, apply, export, publish, mark status, or upload anything.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline template generation.' },
        out: { type: 'string', description: 'Proposal template output path.', default: 'field-proposal.json' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_handoff_summary',
    description:
      'Return the metadata review command boundary as read-only JSON: agent-safe setup/proposal commands separated from human-only approval/apply/export/submit commands and human-only postApprovalPaths.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline handoff summary generation.' },
        out: { type: 'string', description: 'Optional handoff summary output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_submit_proposal',
    description:
      'Submit a structured metadata field-review proposal and return a humanReview/nextHumanAction handoff. This does not approve, apply metadata, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        proposalFile: { type: 'string', description: 'Path to metadata field proposal JSON.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human metadata review screen after proposal submission. Defaults to false; set true only when a human is ready for browser navigation. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'proposalFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_refine_request',
    description:
      'Store reviewer feedback for a metadata field review job so an agent can generate a revised proposal. This does not approve, apply metadata, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        instructions: { type: 'string', description: 'Human reviewer feedback for the next agent pass.' },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional locales this feedback should apply to.',
        },
        targets: {
          type: 'array',
          description: 'Optional concrete metadata targets this feedback should apply to.',
          items: {
            type: 'object',
            properties: {
              locale: { type: 'string' },
              field: { type: 'string' },
              entityId: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        proposalId: { type: 'string', description: 'Optional proposal ID the feedback refers to.' },
        contextSnapshot: {
          type: 'string',
          description:
            'Optional copied review context snapshot with current value, agent proposal, human final value, assigned keywords, unassigned keywords, signal coverage, warnings, rationale, decisions, diffs, metadata limits, keyword research/evidence, and screenshot evidence/context.',
        },
        contextSnapshotFile: {
          type: 'string',
          description: 'Optional local file containing the copied review context snapshot.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'instructions'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_open_review',
    description:
      'Open the dashboard human review screen for a metadata field review job. This does not approve, reject, apply metadata, export, mark status, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_popup',
    description:
      'Open the dashboard human review popup/consent screen for a metadata field review job. Navigation only; does not approve, reject, apply metadata, export, mark status, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_jobs',
    description:
      'List metadata field review jobs for queue navigation. This is read-only queue inspection; it does not approve, reject, apply metadata, export, mark status, publish, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_open_next',
    description:
      'Open the next actionable metadata field review job in the dashboard human review screen. This only navigates to review; it does not approve, reject, apply metadata, export, mark status, publish, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_metadata_readiness',
    description:
      'Inspect metadata field-review readiness: check whether every proposal target has a human decision and return signalAudit/reviewGateSummary quality gates. Read-only; does not approve, apply metadata, export, publish, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Metadata field review job ID.' },
        proposalId: { type: 'string' },
        out: { type: 'string', description: 'Optional readiness output path.' },
      },
      required: ['jobId', 'proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_start',
    description:
      'Create a keyword field review job, optionally sync existing keywords and attach Astro CSV context, then return/write the agent bundle. For automated BYO-agent setup, prefer localizeaso_keywords_auto_start or localizeaso_keywords_auto_import_start so Astro CSV discovery and keyword sync are included by default; set openReview=true only for explicit human browser navigation. Does not submit, approve, apply keywords, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        jobFile: { type: 'string', description: 'Path to keyword field-job.json.' },
        syncKeywords: { type: 'boolean', description: 'Sync existing LocalizeASO ASO keywords first.' },
        keywordsCsv: {
          type: 'string',
          description:
            'Optional Astro keyword CSV path, "auto" to require discovery, or "optional-auto" to continue when no CSV exists.',
        },
        astroDir: {
          type: 'string',
          description: 'Optional project/search directory for keywordsCsv="auto" or "optional-auto".',
        },
        importKeywords: {
          type: 'boolean',
          description:
            'Persist the Astro CSV rows into the app-level LocalizeASO ASO keyword inventory before sync/bundle. Requires keywordsCsv, appId in the job file, and an active BYO/review-history pass; does not require hosted AI or App Store Connect credentials.',
        },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        bundleOut: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human keyword review screen after creating the job. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional full start-result output path.' },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_auto_start',
    description:
      'Recommended BYO-agent keyword review starter: sync existing keywords, optionally discover Astro CSV context, and return/write the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply keywords, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_auto_import_start',
    description:
      'Recommended BYO-agent keyword review starter with persistent Astro CSV import: imports discovered CSV rows, syncs keywords, and returns/writes the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply keywords, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_sync_keywords',
    description:
      'Sync existing LocalizeASO ASO keyword rows into a keyword field review job before proposal generation. This attaches existing keyword research context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        out: { type: 'string', description: 'Optional synced keyword-context output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_keyword_context',
    description:
      'Attach provider-neutral keyword context JSON to a keyword field review job before proposal generation. This updates review context only and does not require hosted AI or App Store Connect credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        contextFile: { type: 'string', description: 'Path to keyword-context.json.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'contextFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_keyword_context_from_csv',
    description:
      'Convert and attach Astro keyword CSV to a keyword field review job before proposal generation. This updates review context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        csvPath: { type: 'string', description: 'Path to the Astro keyword CSV file, "auto" to require discovery, or "optional-auto" to skip when none exists.' },
        astroDir: { type: 'string', description: 'Optional project/search directory for csvPath="auto" or "optional-auto".' },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'csvPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_keyword_brief',
    description:
      'Build a read-only keyword research brief from a keyword field review bundle/job before proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional keyword brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_keyword_prompt',
    description:
      'Build a read-only keyword research prompt for Astro/MCP/keyword agents from a keyword field review bundle/job or keyword brief. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile or briefFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        briefFile: { type: 'string', description: 'Optional keyword-brief.json path for prompt generation.' },
        out: { type: 'string', description: 'Optional keyword prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_keyword_automation',
    description:
      'Build a read-only ordered keyword automation runbook for Astro/MCP/CSV research before keyword proposal generation. Does not attach context, approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline runbook generation.' },
        out: { type: 'string', description: 'Optional keyword automation runbook output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_aso_keyword_map',
    description:
      'Export a read-only ASO keyword detection map for a keyword field review job. Shows which keywords are detected in which metadata attributes/locales with popularity, difficulty, warnings, and errors for any coding-agent run. Does not attach context, approve, apply keywords, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline map export.' },
        out: { type: 'string', description: 'Optional ASO keyword map output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_bundle',
    description:
      'Fetch a keyword field-review agent bundle and optional handoff commands. This is a keyword-specific alias for field review bundles and does not approve, apply keywords, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        out: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human keyword review screen after fetching the bundle. This only navigates to review; it does not approve or apply changes.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_agent_prompt',
    description:
      'Build a keyword proposal-generation prompt from a keyword field review bundle/job. The prompt is for agent proposal creation only and does not approve, apply keywords, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        out: { type: 'string', description: 'Optional agent prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_proposal_template',
    description:
      'Write a local keyword field proposal JSON template from a keyword field review bundle/job. It preserves target IDs, current values, and review-signal fields, but does not submit, approve, apply, export, publish, mark status, or upload anything.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline template generation.' },
        out: { type: 'string', description: 'Proposal template output path.', default: 'field-proposal.json' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_handoff_summary',
    description:
      'Return the keyword review command boundary as read-only JSON: agent-safe setup/proposal commands separated from human-only approval/apply/submit commands and human-only postApprovalPaths.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline handoff summary generation.' },
        out: { type: 'string', description: 'Optional handoff summary output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_submit_proposal',
    description:
      'Submit a structured keyword field-review proposal and return a humanReview/nextHumanAction handoff. This does not approve, apply keywords, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        proposalFile: { type: 'string', description: 'Path to keyword field proposal JSON.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human keyword review screen after proposal submission. Defaults to false; set true only when a human is ready for browser navigation. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'proposalFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_refine_request',
    description:
      'Store reviewer feedback for a keyword field review job so an agent can generate a revised proposal. This does not approve, apply keywords, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        instructions: { type: 'string', description: 'Human reviewer feedback for the next agent pass.' },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional locales this feedback should apply to.',
        },
        targets: {
          type: 'array',
          description: 'Optional concrete keyword targets this feedback should apply to.',
          items: {
            type: 'object',
            properties: {
              locale: { type: 'string' },
              field: { type: 'string' },
              entityId: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        proposalId: { type: 'string', description: 'Optional proposal ID the feedback refers to.' },
        contextSnapshot: {
          type: 'string',
          description:
            'Optional copied review context snapshot with current value, agent proposal, human final value, assigned keywords, unassigned keywords, signal coverage, warnings, rationale, decisions, diffs, keyword research/evidence, and screenshot evidence/context.',
        },
        contextSnapshotFile: {
          type: 'string',
          description: 'Optional local file containing the copied review context snapshot.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'instructions'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_open_review',
    description:
      'Open the dashboard human review screen for a keyword field review job. This does not approve, reject, apply keywords, mark status, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_popup',
    description:
      'Open the dashboard human review popup/consent screen for a keyword field review job. Navigation only; does not approve, reject, apply keywords, mark status, publish, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_jobs',
    description:
      'List keyword field review jobs for queue navigation. This is read-only queue inspection; it does not approve, reject, apply keywords, mark status, publish, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_open_next',
    description:
      'Open the next actionable keyword field review job in the dashboard human review screen. This only navigates to review; it does not approve, reject, apply keywords, mark status, publish, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_keywords_readiness',
    description:
      'Inspect keyword field-review readiness: check whether every proposal target has a human decision and return signalAudit/reviewGateSummary quality gates. Read-only; does not approve, apply keywords, export, publish, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Keyword field review job ID.' },
        proposalId: { type: 'string' },
        out: { type: 'string', description: 'Optional readiness output path.' },
      },
      required: ['jobId', 'proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_pricing_brief',
    description:
      'Build a read-only pricing proposal brief from a pricing field review bundle/job before proposal generation. Existing schedules are review context only; the tool does not approve, export payloads, choose start dates, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional pricing brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_bundle',
    description:
      'Fetch a pricing field-review agent bundle and optional handoff commands. This is a pricing-specific alias for field review bundles and does not approve, export payloads, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        out: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human pricing review screen after fetching the bundle. This only navigates to review; it does not approve or apply changes.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_agent_prompt',
    description:
      'Build a pricing proposal-generation prompt from a pricing field review bundle/job. The prompt is for agent proposal creation only and does not approve, export payloads, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline prompt generation.' },
        out: { type: 'string', description: 'Optional agent prompt output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_proposal_template',
    description:
      'Write a local pricing field proposal JSON template from a pricing field review bundle/job. It preserves target IDs, current values, schedules, and review-signal fields, but does not submit, approve, export, schedule, mark status, or upload anything.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline template generation.' },
        out: { type: 'string', description: 'Proposal template output path.', default: 'field-proposal.json' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_brief',
    description:
      'Build a read-only pricing proposal brief from a pricing field review bundle/job before proposal generation. Existing schedules are review context only; the tool does not approve, export payloads, choose start dates, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline brief generation.' },
        out: { type: 'string', description: 'Optional pricing brief output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_handoff_summary',
    description:
      'Return the pricing review command boundary as read-only JSON: agent-safe setup/proposal commands separated from human-only approval/export/schedule/submit commands and human-only postApprovalPaths.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline handoff summary generation.' },
        out: { type: 'string', description: 'Optional handoff summary output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_submit_proposal',
    description:
      'Submit a structured pricing field-review proposal and return a humanReview/nextHumanAction handoff. This does not approve, export payloads, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        proposalFile: { type: 'string', description: 'Path to pricing field proposal JSON.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human pricing review screen after proposal submission. Defaults to false; set true only when a human is ready for browser navigation. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'proposalFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_refine_request',
    description:
      'Store reviewer feedback for a pricing field review job so an agent can generate a revised proposal. This does not approve, export payloads, schedule prices, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        instructions: { type: 'string', description: 'Human reviewer feedback for the next agent pass.' },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional locales this feedback should apply to.',
        },
        targets: {
          type: 'array',
          description: 'Optional concrete pricing targets this feedback should apply to.',
          items: {
            type: 'object',
            properties: {
              locale: { type: 'string' },
              field: { type: 'string' },
              entityId: { type: 'string' },
              territoryId: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
        proposalId: { type: 'string', description: 'Optional proposal ID the feedback refers to.' },
        contextSnapshot: {
          type: 'string',
          description:
            'Optional copied review context snapshot with current value, agent proposal, human final value, not-applicable keyword mapping markers, pricing evidence, schedule warnings, signal coverage, rationale, decisions, diffs, and pricing context.',
        },
        contextSnapshotFile: {
          type: 'string',
          description: 'Optional local file containing the copied review context snapshot.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'instructions'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_open_review',
    description:
      'Open the dashboard human review screen for a pricing field review job. This does not approve, reject, export payloads, schedule prices, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_popup',
    description:
      'Open the dashboard human review popup/consent screen for a pricing field review job. Navigation only; does not approve, reject, export payloads, schedule prices, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_jobs',
    description:
      'List pricing field review jobs for queue navigation. This is read-only queue inspection; it does not approve, reject, export/schedule pricing, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_open_next',
    description:
      'Open the next actionable pricing field review job in the dashboard human review screen. This only navigates to review; it does not approve, reject, export/schedule pricing, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_readiness',
    description:
      'Inspect pricing field-review readiness: check whether every proposal target has a human decision and return signalAudit/reviewGateSummary quality gates. Read-only; does not approve, export payloads, schedule prices, publish, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Pricing field review job ID.' },
        proposalId: { type: 'string' },
        out: { type: 'string', description: 'Optional readiness output path.' },
      },
      required: ['jobId', 'proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_parity_manifest',
    description:
      'Convert a local PPP/pricing-parity JSON plan into a pricing field-review manifest. This writes a local review-job JSON file only; it does not create jobs, approve reviews, export payloads, schedule prices, mark status, or submit anything to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'LocalizeASO app ID for the generated pricing field-review manifest.' },
        planFile: { type: 'string', description: 'Path to pricing-parity-plan.json.' },
        productKind: { type: 'string', enum: ['subscription', 'iap'], description: 'Optional override when the plan file does not include productKind.' },
        productId: { type: 'string', description: 'Optional subscription/IAP product ID override.' },
        instructions: { type: 'string', description: 'Optional review instructions for the generated field-review job.' },
        out: { type: 'string', description: 'Output pricing field-review manifest path.', default: 'pricing-field-job.json' },
      },
      required: ['appId', 'planFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_parity',
    description:
      'Friendly pricing parity entry point: convert a local PPP/pricing-parity JSON plan, create a pricing field-review job, and return/export the human review handoff. Set openReview=true only for explicit human browser navigation. Requires an active LocalizeASO pass with BYO/pricing review access. It does not submit proposals, approve reviews, export payloads, schedule prices, mark status, or submit anything to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'LocalizeASO app ID for the pricing field-review job. Optional when the plan file includes appId.' },
        planFile: { type: 'string', description: 'Path to pricing-parity-plan.json.' },
        productKind: { type: 'string', enum: ['subscription', 'iap'], description: 'Optional override when the plan file does not include productKind.' },
        productId: { type: 'string', description: 'Optional subscription/IAP product ID override.' },
        instructions: { type: 'string', description: 'Optional review instructions for the generated field-review job.' },
        manifestOut: { type: 'string', description: 'Optional output path for the normalized pricing field-review manifest.' },
        bundleOut: { type: 'string', description: 'Optional field-review agent bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff JSON output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after creating the pricing review job. Defaults to false; set true only when a human is ready for browser navigation.',
        },
        out: { type: 'string', description: 'Optional start result output path.' },
      },
      required: ['planFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_pricing_parity_start',
    description:
      'Convert a local PPP/pricing-parity JSON plan, create a pricing field-review job, and optionally open/export the human review handoff. Requires an active LocalizeASO pass with BYO/pricing review access. It does not submit proposals, approve reviews, export payloads, schedule prices, mark status, or submit anything to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'LocalizeASO app ID for the pricing field-review job. Optional when the plan file includes appId.' },
        planFile: { type: 'string', description: 'Path to pricing-parity-plan.json.' },
        productKind: { type: 'string', enum: ['subscription', 'iap'], description: 'Optional override when the plan file does not include productKind.' },
        productId: { type: 'string', description: 'Optional subscription/IAP product ID override.' },
        instructions: { type: 'string', description: 'Optional review instructions for the generated field-review job.' },
        manifestOut: { type: 'string', description: 'Optional output path for the normalized pricing field-review manifest.' },
        bundleOut: { type: 'string', description: 'Optional field-review agent bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff JSON output path.' },
        openReview: { type: 'boolean', description: 'Open the human review screen after creating the job.' },
        out: { type: 'string', description: 'Optional start result output path.' },
      },
      required: ['planFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_sync_keywords',
    description:
      'Sync existing LocalizeASO ASO keyword rows into a metadata or keyword field review job before proposal generation. Pricing reviews use localizeaso_pricing_brief instead. This attaches existing keyword research context only; it does not require hosted AI or App Store Connect credentials and does not approve, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional synced keyword-context output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_start',
    description:
      'Create a screenshot review job, optionally attach Astro CSV keyword context, and return/write the agent bundle. For automated BYO-agent setup, prefer localizeaso_screenshot_auto_start or localizeaso_screenshot_auto_import_start so Astro CSV discovery is included by default; set openReview=true only for explicit human browser navigation. Does not submit proposals or apply Figma changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobFile: { type: 'string', description: 'Path to screenshot-job.json.' },
        keywordsCsv: {
          type: 'string',
          description:
            'Optional Astro keyword CSV path, "auto" to require discovery, or "optional-auto" to continue when no CSV exists.',
        },
        astroDir: {
          type: 'string',
          description: 'Optional project/search directory for keywordsCsv="auto" or "optional-auto".',
        },
        importKeywords: {
          type: 'boolean',
          description:
            'Persist the Astro CSV rows into the app-level LocalizeASO ASO keyword inventory before fetching the bundle. Requires keywordsCsv, appId in the job file, and an active BYO/review-history pass; does not require hosted AI or App Store Connect credentials.',
        },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        bundleOut: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after creating the job. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional full start-result output path.' },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_auto_start',
    description:
      'Recommended BYO-agent screenshot review starter: optionally discover Astro CSV keyword context and return/write the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, apply Figma changes, upload screenshots, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_auto_import_start',
    description:
      'Recommended BYO-agent screenshot review starter with persistent Astro CSV import: imports discovered CSV rows and returns/writes the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, apply Figma changes, upload screenshots, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: autoKeywordStartProperties,
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_start',
    description:
      'Create a field review job for metadata, keywords, or pricing and return/write the agent bundle. Metadata and keyword jobs may sync existing keywords or attach Astro CSV context; pricing jobs intentionally reject keyword inputs and use localizeaso_pricing_brief for pricing context. For automated BYO-agent setup, prefer localizeaso_field_auto_start or localizeaso_field_auto_import_start. Does not submit or apply changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobFile: { type: 'string', description: 'Path to field-job.json.' },
        surface: {
          type: 'string',
          enum: ['metadata', 'keywords', 'pricing'],
          description:
            'Optional surface guard. If the job JSON omits surface it is added; if it conflicts, review-agent rejects the start.',
        },
        syncKeywords: { type: 'boolean', description: 'Sync existing LocalizeASO ASO keywords first.' },
        keywordsCsv: {
          type: 'string',
          description:
            'Optional Astro keyword CSV path, "auto" to require discovery, or "optional-auto" to continue when no CSV exists.',
        },
        astroDir: {
          type: 'string',
          description: 'Optional project/search directory for keywordsCsv="auto" or "optional-auto".',
        },
        importKeywords: {
          type: 'boolean',
          description:
            'Persist the Astro CSV rows into the app-level LocalizeASO ASO keyword inventory before sync/bundle. Requires keywordsCsv, appId in the job file, and an active BYO/review-history pass; does not require hosted AI or App Store Connect credentials.',
        },
        source: { type: 'string', description: 'Keyword source label.', default: 'astro' },
        bundleOut: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after creating the job. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional full start-result output path.' },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_auto_start',
    description:
      'Recommended BYO-agent field review starter: sync existing keywords, optionally discover Astro CSV context, and return/write the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply, schedule, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        ...autoKeywordStartProperties,
        surface: {
          type: 'string',
          enum: ['metadata', 'keywords', 'pricing'],
          description:
            'Optional surface guard. If the job JSON omits surface it is added; if it conflicts, review-agent rejects the start.',
        },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_auto_import_start',
    description:
      'Recommended BYO-agent field review starter with persistent Astro CSV import: imports discovered CSV rows, syncs keywords, and returns/writes the agent bundle. Set openReview=true only for explicit human browser navigation. Does not submit proposals, approve, apply, schedule, publish, or submit to App Store Connect.',
    inputSchema: {
      type: 'object',
      properties: {
        ...autoKeywordStartProperties,
        surface: {
          type: 'string',
          enum: ['metadata', 'keywords', 'pricing'],
          description:
            'Optional surface guard. If the job JSON omits surface it is added; if it conflicts, review-agent rejects the start.',
        },
      },
      required: ['jobFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_bundle',
    description:
      'Fetch a screenshot review agent bundle and optional handoff commands. For a compact command boundary, prefer localizeaso_screenshot_handoff_summary.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after fetching the bundle. This only navigates to review; it does not approve or apply changes.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_handoff_summary',
    description:
      'Return the screenshot review command boundary as read-only JSON: agent-safe setup/proposal commands separated from human-only approval/apply/submit commands and human-only postApprovalPaths.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Screenshot review job ID. Required unless bundleFile is provided.' },
        bundleFile: {
          type: 'string',
          description: 'Optional screenshot-bundle.json path for offline handoff summary generation.',
        },
        out: { type: 'string', description: 'Optional handoff summary output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_submit_proposal',
    description:
      'Submit a structured screenshot review proposal and return a humanReview/nextHumanAction handoff. This does not approve or apply Figma changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        proposalFile: { type: 'string', description: 'Path to screenshot proposal JSON.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after proposal submission. Defaults to false; set true only when a human is ready for browser navigation. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'proposalFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_refine_request',
    description:
      'Store reviewer feedback for a screenshot review job so an agent can generate a revised proposal. This does not approve or apply Figma changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        instructions: { type: 'string', description: 'Human reviewer feedback for the next agent pass.' },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional locales this feedback should apply to.',
        },
        targets: {
          type: 'array',
          description: 'Optional concrete screenshot locale/frame/layer targets this feedback should apply to.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['locale', 'frame', 'layer'] },
              locale: { type: 'string' },
              frameId: { type: 'string' },
              layerId: { type: 'string' },
            },
            required: ['kind', 'locale'],
            additionalProperties: false,
          },
        },
        proposalId: { type: 'string', description: 'Optional proposal ID the feedback refers to.' },
        contextSnapshot: {
          type: 'string',
          description:
            'Optional copied review context snapshot with current value/text, agent proposal, human final value/text, assigned keywords, unassigned keywords, signal coverage, warnings, rationale, decisions, diffs, frame/layer refs, and screenshot evidence.',
        },
        contextSnapshotFile: {
          type: 'string',
          description: 'Optional local file containing the copied review context snapshot.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'instructions'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_open_review',
    description:
      'Open the dashboard human review screen for a screenshot review job. This does not approve, reject, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_popup',
    description:
      'Open the dashboard human review popup/consent screen for a screenshot review job. Navigation only; does not approve, reject, apply Figma changes, mark status, upload screenshots, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_bundle',
    description:
      'Fetch a field review agent bundle and optional handoff commands. For a compact command boundary, prefer localizeaso_field_handoff_summary.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional bundle output path.' },
        handoffOut: { type: 'string', description: 'Optional handoff output path.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after fetching the bundle. This only navigates to review; it does not approve or apply changes.',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_handoff_summary',
    description:
      'Return the field review command boundary as read-only JSON: agent-safe setup/proposal commands separated from human-only approval/apply/submit commands and human-only postApprovalPaths.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Field review job ID. Required unless bundleFile is provided.' },
        bundleFile: { type: 'string', description: 'Optional field-bundle.json path for offline handoff summary generation.' },
        out: { type: 'string', description: 'Optional handoff summary output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_refine_request',
    description:
      'Store reviewer feedback for a field review job so an agent can generate a revised proposal. This does not approve or apply changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        instructions: { type: 'string', description: 'Human reviewer feedback for the next agent pass.' },
        targetLocales: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional locales this feedback should apply to.',
        },
        targets: {
          type: 'array',
          description: 'Optional concrete field-review targets this feedback should apply to.',
          items: {
            type: 'object',
            properties: {
              surface: { type: 'string', enum: ['metadata', 'keywords', 'pricing'] },
              locale: { type: 'string' },
              field: { type: 'string' },
              entityId: { type: 'string' },
              territoryId: { type: 'string' },
            },
            required: ['surface'],
            additionalProperties: false,
          },
        },
        proposalId: { type: 'string', description: 'Optional proposal ID the feedback refers to.' },
        contextSnapshot: {
          type: 'string',
          description:
            'Optional copied review context snapshot with current value, agent proposal, human final value, assigned keywords, unassigned keywords, not-applicable keyword mapping markers for pricing targets, signal coverage, warnings, rationale, decisions, diffs, metadata limits, keyword research/evidence, screenshot evidence/context, pricing evidence, territory context, schedule warnings, and final-value blockers.',
        },
        contextSnapshotFile: {
          type: 'string',
          description: 'Optional local file containing the copied review context snapshot.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'instructions'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_submit_proposal',
    description:
      'Submit a structured metadata/keyword/pricing field-review proposal and return a humanReview/nextHumanAction handoff. This does not approve or apply changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        proposalFile: { type: 'string', description: 'Path to field proposal JSON.' },
        openReview: {
          type: 'boolean',
          description:
            'Open the human review screen after proposal submission. Defaults to false; set true only when a human is ready for browser navigation. This only navigates to review; it does not approve or apply changes.',
        },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId', 'proposalFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_open_review',
    description:
      'Open the dashboard human review screen for a metadata/keyword/pricing field review job. This does not approve, reject, apply, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_popup',
    description:
      'Open the dashboard human review popup/consent screen for a metadata/keyword/pricing field review job. Navigation only; does not approve, reject, apply metadata or keywords, export/schedule pricing, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        out: { type: 'string', description: 'Optional response output path.' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_jobs',
    description:
      'List screenshot review jobs for queue navigation. This is read-only queue inspection; it does not approve, reject, apply Figma changes, mark status, upload screenshots, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_open_next',
    description:
      'Open the next actionable screenshot review job in the dashboard human review screen. This only navigates to review; it does not approve, reject, apply Figma changes, mark status, upload screenshots, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_jobs',
    description:
      'List metadata/keyword/pricing field review jobs for queue navigation. This is read-only queue inspection; it does not approve, reject, apply metadata or keywords, export/schedule pricing, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        surface: { type: 'string', enum: ['metadata', 'keywords', 'pricing'], description: 'Optional field-review surface filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional queue JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_open_next',
    description:
      'Open the next actionable metadata/keyword/pricing field review job in the dashboard human review screen. This only navigates to review; it does not approve, reject, apply metadata or keywords, export/schedule pricing, mark status, or submit anything.',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Optional LocalizeASO app ID filter.' },
        surface: { type: 'string', enum: ['metadata', 'keywords', 'pricing'], description: 'Optional field-review surface filter.' },
        status: { type: 'string', description: 'Optional review job status filter, for example proposal_ready.' },
        out: { type: 'string', description: 'Optional navigation JSON output path.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_screenshot_readiness',
    description:
      'Inspect screenshot review readiness: check whether every proposal layer has a human decision and return signalAudit/reviewGateSummary quality gates. Read-only; does not approve, apply Figma changes, upload screenshots, publish, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        proposalId: { type: 'string' },
        out: { type: 'string', description: 'Optional readiness output path.' },
      },
      required: ['jobId', 'proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'localizeaso_field_readiness',
    description:
      'Inspect field-review readiness: check whether every proposal target has a human decision and return signalAudit/reviewGateSummary quality gates. Read-only; does not approve, apply, export, schedule, publish, mark status, or submit changes.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        proposalId: { type: 'string' },
        out: { type: 'string', description: 'Optional readiness output path.' },
      },
      required: ['jobId', 'proposalId'],
      additionalProperties: false,
    },
  },
];

const safeMcpToolDescription =
  'MCP-safe: this tool cannot approve, reject, apply metadata/keywords/Figma changes, export metadata or pricing payloads, schedule pricing, mark status, upload/publish, or submit to App Store Connect; proposal submission only creates reviewable proposals for human approval, and postApprovalPaths are human-only runbooks.';

const protectedHumanOnlyActions = [
  'human_approval',
  'review_rejection',
  'decision_save',
  'direct_asc_mutation',
  'figma_apply',
  'metadata_apply',
  'metadata_export',
  'metadata_push',
  'metadata_publish',
  'metadata_replace',
  'keyword_apply',
  'pricing_payload_export',
  'pricing_export',
  'pricing_schedule',
  'pricing_submit',
  'pricing_publish',
  'screenshot_apply',
  'screenshot_complete',
  'screenshot_delete',
  'screenshot_reorder',
  'screenshot_upload',
  'screenshot_publish',
  'app_store_upload',
  'app_store_upload_finalize',
  'app_store_submit',
  'app_store_publish',
  'status_update',
];

function isPricingParityReviewStartTool(name) {
  return name === 'localizeaso_pricing_parity' || name === 'localizeaso_pricing_parity_start';
}

function isPricingReviewTool(name) {
  return name.startsWith('localizeaso_pricing_');
}

function isMetadataReviewTool(name) {
  return name.startsWith('localizeaso_metadata_');
}

function isKeywordsReviewTool(name) {
  return name.startsWith('localizeaso_keywords_');
}

function isAutoStartTool(name) {
  return name.endsWith('_auto_start') || name.endsWith('_auto_import_start');
}

function isAutoImportStartTool(name) {
  return name.endsWith('_auto_import_start');
}

function isAstroKeywordExportTool(name) {
  return name === 'localizeaso_astro_export' || name === 'localizeaso_astro_keywords';
}

function isOpenHumanReviewTool(name) {
  return name.endsWith('_open_review') || name.endsWith('_open_next') || name.endsWith('_popup');
}

function toolOperationKind(name) {
  if (name === 'localizeaso_local_doctor') return 'inspect_local_doctor';
  if (name === 'localizeaso_monetization_boundary') return 'inspect_monetization_boundary';
  if (name === 'localizeaso_workspace_runbook') return 'build_workspace_agent_runbook';
  if (isAstroKeywordExportTool(name)) return 'export_astro_keyword_context';
  if (name === 'localizeaso_pricing_parity_manifest') return 'write_pricing_review_manifest';
  if (isPricingParityReviewStartTool(name)) return 'create_pricing_review_job';
  if (name.endsWith('_jobs')) return 'inspect_review_queue';
  if (isOpenHumanReviewTool(name)) return 'open_human_review';
  if (name.endsWith('_submit_proposal')) return 'submit_reviewable_proposal';
  if (name.endsWith('_refine_request')) return 'store_reviewer_feedback';
  if (isAutoStartTool(name)) return 'create_review_job_with_auto_keyword_context';
  if (name.endsWith('_start')) return 'create_review_job';
  if (name.endsWith('_bundle')) return 'fetch_agent_bundle';
  if (name.endsWith('_handoff_summary')) return 'inspect_command_boundary';
  if (name.endsWith('_readiness')) return 'inspect_approval_readiness';
  if (name.endsWith('_agent_prompt')) return 'generate_proposal_prompt';
  if (name.endsWith('_proposal_template')) return 'write_local_proposal_template';
  if (name.endsWith('_keyword_prompt')) return 'generate_keyword_prompt';
  if (name.endsWith('_keyword_automation')) return 'generate_keyword_runbook';
  if (name.endsWith('_keyword_brief')) return 'inspect_keyword_brief';
  if (name.endsWith('_pricing_brief')) return 'inspect_pricing_brief';
  if (name === 'localizeaso_keyword_context_from_csv') return 'convert_keyword_context';
  if (name === 'localizeaso_import_aso_keywords_from_csv') return 'import_keyword_inventory';
  if (name.endsWith('_keyword_context_from_csv')) return 'attach_keyword_context_from_csv';
  if (name.endsWith('_keyword_context')) return 'attach_keyword_context';
  if (name.endsWith('_sync_keywords')) return 'sync_existing_keywords';
  return 'agent_safe_review_action';
}

function isReadOnlyMcpTool(name) {
  return (
    name === 'localizeaso_monetization_boundary' ||
    name === 'localizeaso_local_doctor' ||
    name === 'localizeaso_workspace_runbook' ||
    name === 'localizeaso_keyword_context_from_csv' ||
    isAstroKeywordExportTool(name) ||
    name === 'localizeaso_pricing_parity_manifest' ||
    name.endsWith('_jobs') ||
    name.endsWith('_keyword_brief') ||
    name.endsWith('_keyword_prompt') ||
    name.endsWith('_keyword_automation') ||
    name.endsWith('_agent_prompt') ||
    name.endsWith('_proposal_template') ||
    name.endsWith('_pricing_brief') ||
    name.endsWith('_handoff_summary') ||
    name.endsWith('_readiness') ||
    name.endsWith('_bundle')
  );
}

function mutatesReviewData(name) {
  return (
    name === 'localizeaso_pricing_parity' ||
    name.endsWith('_start') ||
    name.endsWith('_submit_proposal') ||
    name.endsWith('_refine_request') ||
    name.endsWith('_keyword_context') ||
    (name !== 'localizeaso_keyword_context_from_csv' && name.endsWith('_keyword_context_from_csv')) ||
    name.endsWith('_sync_keywords') ||
    name === 'localizeaso_import_aso_keywords_from_csv'
  );
}

function convertsKeywordCsvOnly(name) {
  return name === 'localizeaso_keyword_context_from_csv';
}

function attachesReviewKeywordContext(name) {
  return (
    name === 'localizeaso_screenshot_keyword_context' ||
    name === 'localizeaso_field_keyword_context' ||
    name === 'localizeaso_metadata_keyword_context' ||
    name === 'localizeaso_keywords_keyword_context' ||
    name === 'localizeaso_screenshot_keyword_context_from_csv' ||
    name === 'localizeaso_field_keyword_context_from_csv' ||
    name === 'localizeaso_metadata_keyword_context_from_csv' ||
    name === 'localizeaso_keywords_keyword_context_from_csv' ||
    name === 'localizeaso_metadata_sync_keywords' ||
    name === 'localizeaso_keywords_sync_keywords' ||
    name === 'localizeaso_field_sync_keywords'
  );
}

function mutatesPersistentKeywordInventory(name) {
  return name === 'localizeaso_import_aso_keywords_from_csv' || isAutoImportStartTool(name);
}

function isKeywordResearchMcpTool(name) {
  return (
    name === 'localizeaso_keyword_context_from_csv' ||
    isAstroKeywordExportTool(name) ||
    name === 'localizeaso_import_aso_keywords_from_csv' ||
    isAutoStartTool(name) ||
    name.endsWith('_keyword_context') ||
    name.endsWith('_keyword_context_from_csv') ||
    name.endsWith('_sync_keywords') ||
    name.endsWith('_keyword_brief') ||
    name.endsWith('_keyword_prompt') ||
    name.endsWith('_keyword_automation')
  );
}

function usesOfflineBundleInput(input = {}) {
  return (
    typeof input.bundleFile === 'string' &&
    input.bundleFile.trim() &&
    !(typeof input.jobId === 'string' && input.jobId.trim())
  );
}

function usesOfflineBriefInput(input = {}) {
  return (
    typeof input.briefFile === 'string' &&
    input.briefFile.trim() &&
    !(typeof input.jobId === 'string' && input.jobId.trim()) &&
    !(typeof input.bundleFile === 'string' && input.bundleFile.trim())
  );
}

function fetchesReviewHistoryFromBackend(name, input = {}) {
  if (usesOfflineBundleInput(input) || usesOfflineBriefInput(input)) return false;
  return (
    name.endsWith('_bundle') ||
    name.endsWith('_handoff_summary') ||
    name.endsWith('_keyword_brief') ||
    name.endsWith('_keyword_prompt') ||
    name.endsWith('_keyword_automation') ||
    name.endsWith('_agent_prompt') ||
    name.endsWith('_proposal_template') ||
    name.endsWith('_pricing_brief')
  );
}

function requiresLocalizeAsoPass(name, input = {}) {
  return (
    name === 'localizeaso_pricing_parity' ||
    name.endsWith('_start') ||
    name === 'localizeaso_import_aso_keywords_from_csv' ||
    fetchesReviewHistoryFromBackend(name, input)
  );
}

function fieldStartSurfaceFromInput(input = {}) {
  if (typeof input.surface === 'string' && input.surface.trim()) return input.surface.trim();
  const jobFile = typeof input.jobFile === 'string' ? input.jobFile.trim() : '';
  if (!jobFile) return '';
  try {
    const parsed = JSON.parse(readFileSync(jobFile, 'utf8'));
    return typeof parsed?.surface === 'string' ? parsed.surface.trim() : '';
  } catch {
    return '';
  }
}

function requiredLocalizeAsoCapabilitiesForTool(name, input = {}) {
  if (!requiresLocalizeAsoPass(name, input)) return [];
  const capabilities = ['byoAgent', 'reviewHistory'];
  if (name === 'localizeaso_screenshot_start') {
    capabilities.push('figmaPlugin');
  }
  if (name === 'localizeaso_screenshot_auto_start' || name === 'localizeaso_screenshot_auto_import_start') {
    capabilities.push('figmaPlugin');
  }
  if (
    isPricingReviewTool(name) ||
    name.includes('_field_pricing_') ||
    ((name === 'localizeaso_field_start' ||
      name === 'localizeaso_field_auto_start' ||
      name === 'localizeaso_field_auto_import_start') &&
      fieldStartSurfaceFromInput(input) === 'pricing')
  ) {
    capabilities.push('pricingReview');
  }
  return capabilities;
}

function canWriteLocalFiles(name) {
  const tool = tools.find((candidate) => candidate.name === name);
  const properties = tool?.inputSchema?.properties;
  if (!properties || typeof properties !== 'object') return false;
  return ['out', 'bundleOut', 'handoffOut', 'manifestOut', 'outDir', 'zipPath', 'keywordContextOut'].some((property) =>
    Object.prototype.hasOwnProperty.call(properties, property),
  );
}

function flagValues(args = [], flag) {
  if (!Array.isArray(args)) return [];
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === flag && typeof args[index + 1] === 'string') {
      values.push(args[index + 1].trim());
      index += 1;
      continue;
    }
    if (typeof token === 'string' && token.startsWith(`${flag}=`)) {
      values.push(token.slice(flag.length + 1).trim());
    }
  }
  return values.filter(Boolean);
}

function localFileWritePaths(input = {}, args = []) {
  const inputPaths = ['out', 'bundleOut', 'handoffOut', 'manifestOut', 'outDir', 'zipPath', 'keywordContextOut']
    .map((property) => (typeof input?.[property] === 'string' ? input[property].trim() : ''))
    .filter(Boolean);
  const argPaths = [
    ...flagValues(args, '--out'),
    ...flagValues(args, '--bundle-out'),
    ...flagValues(args, '--handoff'),
    ...flagValues(args, '--manifest-out'),
    ...flagValues(args, '--out-dir'),
    ...flagValues(args, '--zip'),
    ...flagValues(args, '--keyword-context-out'),
  ];
  return [...new Set([...inputPaths, ...argPaths])];
}

function reviewKindForMcpTool(name) {
  if (name === 'localizeaso_local_doctor') return 'local_doctor';
  if (name === 'localizeaso_workspace_runbook') return 'workspace';
  if (isAstroKeywordExportTool(name)) return 'keyword_context';
  if (name === 'localizeaso_review_jobs' || name === 'localizeaso_review_open_next') {
    return 'workspace';
  }
  if (
    name.includes('_field_') ||
    isMetadataReviewTool(name) ||
    isKeywordsReviewTool(name) ||
    name === 'localizeaso_pricing_parity_manifest' ||
    isPricingReviewTool(name)
  ) return 'field';
  if (name.includes('_screenshot_')) return 'screenshots';
  return 'keyword_context';
}

function reviewSurfaceForMcpTool(name, input = {}) {
  if (name === 'localizeaso_local_doctor') return 'local_doctor';
  if (name === 'localizeaso_workspace_runbook') return 'workspace';
  if (isAstroKeywordExportTool(name)) return 'keyword_context';
  if (isPricingReviewTool(name)) {
    return 'pricing';
  }
  if (isMetadataReviewTool(name)) {
    return 'metadata';
  }
  if (isKeywordsReviewTool(name)) {
    return 'keywords';
  }
  if (
    name === 'localizeaso_field_start' ||
    name === 'localizeaso_field_auto_start' ||
    name === 'localizeaso_field_auto_import_start'
  ) {
    return fieldStartSurfaceFromInput(input) || 'metadata';
  }
  if (name.includes('_field_pricing_')) return 'pricing';
  if (name.includes('_field_keyword_') || name === 'localizeaso_field_sync_keywords') return 'keywords';
  if (name.includes('_field_')) return 'metadata';
  if (name.includes('_screenshot_')) return 'screenshots';
  return 'keyword_context';
}

function reviewConsentChecklistItem(id, label, actor = 'human') {
  return {
    id,
    label,
    required: true,
    actor,
  };
}

function reviewConsentChecklistForMcpTool(name, input = {}) {
  const surface = reviewSurfaceForMcpTool(name, input);
  if (surface === 'local_doctor') {
    return [
      reviewConsentChecklistItem(
        'inspect_local_urls_only',
        'Inspect local backend/dashboard URL readiness only.',
        'agent',
      ),
      reviewConsentChecklistItem(
        'use_recommended_review_origin',
        'Use the recommended local dashboard origin for human review links when dashboard.test would not resolve.',
        'agent',
      ),
      reviewConsentChecklistItem(
        'no_review_mutations',
        'Do not create review jobs, approve, reject, apply, submit, schedule, publish, or mark status from the doctor result.',
        'agent',
      ),
    ];
  }
  if (surface === 'workspace') {
    return [
      reviewConsentChecklistItem(
        'inspect_workspace_runbook_only',
        'Inspect workspace orchestration, local URL readiness, Astro keyword handoff, and review queue routing only.',
        'agent',
      ),
      reviewConsentChecklistItem(
        'keep_browser_disabled_for_agents',
        'Keep LOCALIZEASO_DISABLE_OPEN=1 for agent runs; only a signed-in human should open review URLs or run --open commands.',
        'agent',
      ),
      reviewConsentChecklistItem(
        'post_runbook_actions_human_only',
        'Approval, apply, export, pricing schedule, App Store submit, and status changes remain human-only after review approval.',
      ),
    ];
  }
  if (surface === 'screenshots') {
    return [
      reviewConsentChecklistItem(
        'open_screenshot_review_screen',
        'Open the screenshot review screen for the human reviewer.',
      ),
	      reviewConsentChecklistItem(
	        'review_screenshot_signals',
	        'Review current screenshot text, agent proposals, frame/layer refs, assigned keywords, unassigned keywords, warnings, rationale, diffs, and screenshot evidence per locale, frame, and layer.',
	      ),
      reviewConsentChecklistItem(
        'post_approval_screenshot_only',
        'Only after approval may a human apply Figma text, upload screenshots, submit, or mark status.',
      ),
    ];
  }
  if (surface === 'pricing') {
    return [
      reviewConsentChecklistItem(
        'open_pricing_review_screen',
        'Open the pricing field-review screen for the human reviewer.',
      ),
      reviewConsentChecklistItem(
        'review_pricing_signals',
        'Review current price, target price, schedules, territory warnings, rationale, and final value per territory.',
      ),
      reviewConsentChecklistItem(
        'post_approval_pricing_only',
        'Only after approval may a human export an asc CSV, schedule pricing, use hosted submit, or mark status.',
      ),
    ];
  }
  if (surface === 'keywords') {
    return [
      reviewConsentChecklistItem(
        'open_keyword_review_screen',
        'Open the keyword field-review screen for the human reviewer.',
      ),
      reviewConsentChecklistItem(
        'review_keyword_signals',
        'Review current keywords, proposals, assigned keywords, unassigned keywords, warnings, rationale, and diffs per locale.',
      ),
      reviewConsentChecklistItem(
        'post_approval_keywords_only',
        'Only after approval may a human apply accepted or edited keyword changes to the LocalizeASO keyword store.',
      ),
    ];
  }
  return [
    reviewConsentChecklistItem(
      'open_metadata_review_screen',
      'Open the metadata field-review screen for the human reviewer.',
    ),
    reviewConsentChecklistItem(
      'review_metadata_signals',
      'Review current metadata, proposals, assigned keywords, unassigned keywords, warnings, rationale, and diffs per locale and field.',
    ),
    reviewConsentChecklistItem(
      'post_approval_metadata_only',
      'Only after approval may a human apply drafts, export local asc metadata files, use hosted submit, or mark status.',
    ),
  ];
}

function mcpReviewConsentForTool(name, input = {}, opensReview = false) {
  const reviewKind = reviewKindForMcpTool(name);
  const surface = reviewSurfaceForMcpTool(name, input);
  const openReviewTool =
    reviewKind === 'screenshots'
      ? 'localizeaso_screenshot_open_review'
      : reviewKind === 'field'
        ? 'localizeaso_field_open_review'
        : undefined;
  return {
    requiredBeforeProtectedActions: true,
    opensHumanReviewScreen: opensReview,
    consentScreen:
      reviewKind === 'screenshots'
        ? 'LocalizeASO screenshot review'
        : reviewKind === 'field'
          ? 'LocalizeASO field review'
          : reviewKind === 'workspace'
            ? 'LocalizeASO workspace review'
            : undefined,
    reviewKind,
    surface,
    ...(openReviewTool ? { openReviewTool } : {}),
    checklist: reviewConsentChecklistForMcpTool(name, input),
    prohibitedAgentActions: protectedHumanOnlyActions,
    agentInstruction:
      'Use this MCP tool only for setup, context, keyword research, proposal submission, reviewer feedback, or opening the human review screen. Approval, apply, submit, schedule, upload, publish, and status changes remain human-only.',
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseReviewConsentMeta(response) {
  if (!isRecord(response?.reviewConsent)) return null;
  return response.reviewConsent;
}

function mergeMcpSafetyWithResponseConsent(safety, response) {
  const responseConsent = responseReviewConsentMeta(response);
  if (!responseConsent) return safety;
  const baseConsent = isRecord(safety.reviewConsent) ? safety.reviewConsent : {};
  const baseNextHumanAction = isRecord(baseConsent.nextHumanAction) ? baseConsent.nextHumanAction : {};
  const responseNextHumanAction = isRecord(responseConsent.nextHumanAction)
    ? responseConsent.nextHumanAction
    : {};

  return {
    ...safety,
    reviewConsent: {
      ...baseConsent,
      ...responseConsent,
      checklist: Array.isArray(responseConsent.checklist)
        ? responseConsent.checklist
        : baseConsent.checklist,
      prohibitedAgentActions: Array.isArray(responseConsent.prohibitedAgentActions)
        ? responseConsent.prohibitedAgentActions
        : baseConsent.prohibitedAgentActions,
      nextHumanAction: {
        ...baseNextHumanAction,
        ...responseNextHumanAction,
      },
      agentInstruction:
        cleanString(responseConsent.agentInstruction) ||
        cleanString(baseConsent.agentInstruction),
    },
  };
}

function mcpMonetizationBoundary(name, input = {}) {
  const requestedKind = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : '';
  const requestedSurface =
    requestedKind === 'metadata' || requestedKind === 'keywords' || requestedKind === 'pricing'
      ? requestedKind
      : null;
  const reviewKind = name === 'localizeaso_monetization_boundary'
    ? input.kind === 'field' || requestedSurface
      ? 'field'
      : input.kind === 'screenshots'
        ? 'screenshots'
        : 'workspace'
    : reviewKindForMcpTool(name);
  const sharedReviewKind =
    reviewKind === 'field' || reviewKind === 'workspace' ? reviewKind : 'screenshots';
  const reviewSurface = requestedSurface ?? reviewSurfaceForMcpTool(name, input);
  const shared = buildLocalizeAsoMonetizationBoundary(
    sharedReviewKind,
    reviewSurface === 'metadata' || reviewSurface === 'keywords' || reviewSurface === 'pricing'
      ? { reviewSurface }
      : {},
  );

  return {
    ...shared,
    reviewKind,
    ...(reviewSurface === 'metadata' || reviewSurface === 'keywords' || reviewSurface === 'pricing'
      ? { reviewSurface }
      : {}),
    tool: name,
    freeLocalDistribution: {
      ...shared.freeLocalDistribution,
      includes: [
        ...shared.freeLocalDistribution.includes,
        'local Astro MCP export for own tracked app keyword context',
      ],
    },
    localAgentSafe: [
      'astro-export',
      ...shared.localAgentSafe,
    ],
    toolRequiresLocalizeAsoPass: requiresLocalizeAsoPass(name, input),
    requiredLocalizeAsoCapabilities: requiredLocalizeAsoCapabilitiesForTool(name, input),
    revenueModel: {
      ...shared.revenueModel,
      paidSurface:
        'Charge for persistent review jobs, human review/consent screens with diffs and signal evidence, approval history, reviewer feedback, Figma apply plans, app slots, hosted proposal allowance, and hosted upload/submit convenience.',
    },
    hostedAiRequiredForThisTool: false,
    hostedSubmitAvailableThroughMcp: false,
    appStoreConnectCredentialsRequiredForThisTool: false,
    appStoreConnectCredentials:
      'Not required for BYO proposal generation, keyword import, MCP keyword research, or opening the human review/approval screen; only needed for hosted submit convenience or a human-run local asc handoff after explicit approval.',
    pricingGuidance: shared.pricingGuidance,
    agentInstruction:
      'Use MCP for agent-safe setup, research, bundles, proposal submission, reviewer feedback, and opening human review only. Choose Agent Pass for BYO review/history/Figma handoffs/app slots, Submit Pass for BYO proposals plus hosted App Store Connect convenience, or hosted AI pass when LocalizeASO should spend hosted AI.',
  };
}

function mergeMcpMonetizationBoundary(name, responseBoundary, input = {}) {
  const fallback = mcpMonetizationBoundary(name, input);
  if (!responseBoundary || typeof responseBoundary !== 'object' || Array.isArray(responseBoundary)) {
    return fallback;
  }
  const responseFreeLocalDistribution = responseBoundary.freeLocalDistribution &&
    typeof responseBoundary.freeLocalDistribution === 'object' &&
    !Array.isArray(responseBoundary.freeLocalDistribution)
    ? responseBoundary.freeLocalDistribution
    : {};
  const mergeArray = (fallbackValues, responseValues) => [
    ...new Set([
      ...(Array.isArray(fallbackValues) ? fallbackValues : []),
      ...(Array.isArray(responseValues) ? responseValues : []),
    ]),
  ];
  const fallbackValueLedger = asPlainObject(fallback.valueLedger) || {};
  const responseValueLedger = asPlainObject(responseBoundary.valueLedger) || {};
  const mergeLedgerSection = (section) => {
    const fallbackSection = asPlainObject(fallbackValueLedger[section]) || {};
    const responseSection = asPlainObject(responseValueLedger[section]) || {};
    const includes = mergeArray(fallbackSection.includes, responseSection.includes);
    const excludes = mergeArray(fallbackSection.excludes, responseSection.excludes);
    const notes = mergeArray(fallbackSection.notes, responseSection.notes);
    return {
      ...fallbackSection,
      ...responseSection,
      ...(includes.length ? { includes } : {}),
      ...(excludes.length ? { excludes } : {}),
      ...(notes.length ? { notes } : {}),
    };
  };
  return {
    ...fallback,
    ...responseBoundary,
    freeLocalDistribution: {
      ...fallback.freeLocalDistribution,
      ...responseFreeLocalDistribution,
      includes: [
        ...new Set([
          ...(Array.isArray(fallback.freeLocalDistribution?.includes)
            ? fallback.freeLocalDistribution.includes
            : []),
          ...(Array.isArray(responseFreeLocalDistribution.includes)
            ? responseFreeLocalDistribution.includes
            : []),
        ]),
      ],
      excludes: [
        ...new Set([
          ...(Array.isArray(fallback.freeLocalDistribution?.excludes)
            ? fallback.freeLocalDistribution.excludes
            : []),
          ...(Array.isArray(responseFreeLocalDistribution.excludes)
            ? responseFreeLocalDistribution.excludes
            : []),
        ]),
      ],
    },
    localAgentSafe: [
      ...new Set([
        ...(Array.isArray(fallback.localAgentSafe) ? fallback.localAgentSafe : []),
        ...(Array.isArray(responseBoundary.localAgentSafe) ? responseBoundary.localAgentSafe : []),
      ]),
    ],
    agentPass: {
      ...fallback.agentPass,
      ...(responseBoundary.agentPass && typeof responseBoundary.agentPass === 'object' && !Array.isArray(responseBoundary.agentPass)
        ? responseBoundary.agentPass
        : {}),
    },
    hostedPass: {
      ...fallback.hostedPass,
      ...(responseBoundary.hostedPass && typeof responseBoundary.hostedPass === 'object' && !Array.isArray(responseBoundary.hostedPass)
        ? responseBoundary.hostedPass
        : {}),
    },
    hostedSubmitPass: {
      ...fallback.hostedSubmitPass,
      ...(responseBoundary.hostedSubmitPass && typeof responseBoundary.hostedSubmitPass === 'object' && !Array.isArray(responseBoundary.hostedSubmitPass)
        ? responseBoundary.hostedSubmitPass
        : {}),
    },
    hostedAiPass: {
      ...fallback.hostedAiPass,
      ...(responseBoundary.hostedAiPass && typeof responseBoundary.hostedAiPass === 'object' && !Array.isArray(responseBoundary.hostedAiPass)
        ? responseBoundary.hostedAiPass
        : {}),
    },
    passRequired: {
      ...fallback.passRequired,
      ...(responseBoundary.passRequired && typeof responseBoundary.passRequired === 'object' && !Array.isArray(responseBoundary.passRequired)
        ? responseBoundary.passRequired
        : {}),
    },
    packagingDecision: {
      ...fallback.packagingDecision,
      ...(responseBoundary.packagingDecision && typeof responseBoundary.packagingDecision === 'object' && !Array.isArray(responseBoundary.packagingDecision)
        ? responseBoundary.packagingDecision
        : {}),
    },
    valueLedger: {
      ...fallbackValueLedger,
      ...responseValueLedger,
      byoAgentOneTime: mergeLedgerSection('byoAgentOneTime'),
      hostedConvenience: mergeLedgerSection('hostedConvenience'),
      approvalGate: mergeLedgerSection('approvalGate'),
    },
  };
}

function mcpSafetyForTool(name, input = {}, args = undefined) {
  const opensReview =
    isOpenHumanReviewTool(name) ||
    input?.openReview === true ||
    (name.endsWith('_submit_proposal')
      ? input?.openReview === true
      : input?.openReview === true || (Array.isArray(args) && args.includes('--open')));
  const localPaths = localFileWritePaths(input, args);
  const writesLocalFiles = localPaths.length > 0;
  const proposalSubmissionOnly = name.endsWith('_submit_proposal');
  return {
    version: 1,
    agentSafe: true,
    humanOnly: false,
    operation: toolOperationKind(name),
    proposalSubmissionOnly,
    protectedActionsExecutableByAgent: false,
    protectedActionsExecutableByMcp: false,
    postApprovalRunbookExecutionAllowedInMcp: false,
    appStoreSubmitAllowed: false,
    figmaApplyAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
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
    statusUpdateAllowed: false,
    postApprovalActionAllowed: false,
    readOnly: isReadOnlyMcpTool(name),
    mutatesReviewData: mutatesReviewData(name),
    convertsKeywordCsvOnly: convertsKeywordCsvOnly(name),
    keywordResearchPreProposalOnly: isKeywordResearchMcpTool(name),
    keywordResearchRequiresHostedAi: isKeywordResearchMcpTool(name) ? false : undefined,
    keywordResearchRequiresAppStoreConnectCredentials: isKeywordResearchMcpTool(name) ? false : undefined,
    keywordResearchAllowedScope: isKeywordResearchMcpTool(name)
      ? 'Inspect, convert, import, sync, or attach ASO keyword research context before proposal generation only.'
      : undefined,
    attachesReviewKeywordContext: attachesReviewKeywordContext(name),
    mutatesPersistentKeywordInventory: mutatesPersistentKeywordInventory(name),
    mayWriteLocalFiles: canWriteLocalFiles(name),
    writesLocalFiles,
    localFileWriteOnly: writesLocalFiles && !mutatesReviewData(name),
    localFileWritePaths: localPaths,
    pricingParityManifestOnly: name === 'localizeaso_pricing_parity_manifest'
      ? true
      : isPricingParityReviewStartTool(name)
        ? false
        : undefined,
    pricingParityCreatesReviewJob: isPricingParityReviewStartTool(name) ? true : undefined,
    pricingParityRequiresHumanReview:
      name === 'localizeaso_pricing_parity_manifest' || isPricingParityReviewStartTool(name)
        ? true
        : undefined,
    requiresLocalizeAsoPass: requiresLocalizeAsoPass(name, input),
    requiredLocalizeAsoCapabilities: requiredLocalizeAsoCapabilitiesForTool(name, input),
    mutatesAppStoreConnect: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    opensHumanReview: opensReview,
    humanReviewNavigationOnly: opensReview,
    reviewConsent: mcpReviewConsentForTool(name, input, opensReview),
    humanApprovalConsentGranted: false,
    humanRejectionConsentGranted: false,
    humanPostApprovalConsentGranted: false,
    protectedActionsAllowed: false,
    applyPlanFingerprintRequiredForPostApproval: true,
    applyPlanFingerprintFlag: '--expected-apply-plan-fingerprint',
    postApprovalPathsHumanOnly: true,
    requiresHumanApprovalBeforeProtectedActions: true,
    requiresHumanRejectionConsentForReviewRejection: true,
    requiresHumanApprovalBeforePostApprovalActions: true,
    allowedScope:
      'Create or inspect review context, attach keyword research, submit reviewable proposals, request revisions, or open the human review screen.',
    blockedActions: protectedHumanOnlyActions,
    guardrails: [
      'Do not approve proposals from MCP.',
      'Do not reject or close review jobs from MCP.',
      'Do not apply Figma, metadata, keyword, or pricing changes from MCP.',
      'Do not mark review status or upload/submit to App Store Connect from MCP.',
      'Treat postApprovalPaths as human-only runbooks, not executable MCP permission.',
      'Human-only apply, status, upload, submit, pricing schedule, and hosted convenience commands must use the approved apply-plan fingerprint from the exported apply plan.',
      'Use human-only review or post-approval handoff commands only after explicit reviewer consent.',
    ],
    ...(Array.isArray(args) ? { cliArgs: args } : {}),
  };
}

function reviewSignalContractForTool(name) {
  const requiredPerTarget = ['assignedKeywords', 'unassignedKeywords', 'warnings', 'rationale'];
  const requiredPerTargetLabels = requiredPerTarget.map(reviewSignalGroupLabel);
  const pricingRequiredPerTargetLabels = ['keyword mapping n/a', 'warnings', 'rationale'];
  const requiredReviewContext = ['currentValue', 'agentProposal', 'humanFinal', 'diff'];
  const requiredReviewContextLabels = ['current content', 'agent proposal', 'human final', 'diff'];
  if (
    name === 'localizeaso_screenshot_submit_proposal' ||
    name === 'localizeaso_screenshot_proposal_template'
  ) {
    return {
      kind: 'localizeaso_review_signal_contract',
      requiredPerTarget,
      requiredPerTargetLabels,
      requiredReviewContext,
      requiredReviewContextLabels,
      targetLevels: ['locale', 'frame', 'layer'],
      emptySignalsMeanConsidered: true,
      agentInstruction:
        'Include current content, agent proposal, human final placeholders, diffs, assignedKeywords, unassignedKeywords, warnings, and rationale on every proposed screenshot locale, frame, and layer target; use empty arrays when no keyword or warning items apply.',
    };
  }
  if (
    name === 'localizeaso_pricing_submit_proposal' ||
    name === 'localizeaso_pricing_proposal_template'
  ) {
    return {
      kind: 'localizeaso_review_signal_contract',
      requiredPerTarget,
      requiredPerTargetLabels: pricingRequiredPerTargetLabels,
      requiredReviewContext,
      requiredReviewContextLabels,
      targetLevels: ['pricing-change'],
      emptySignalsMeanConsidered: true,
      agentInstruction:
        'Include current price/context, agent proposal, human final placeholders, diffs, warnings, rationale, and explicit empty keyword arrays on every proposed pricing change target when ASO keyword mapping is not applicable.',
    };
  }
  if (
    name === 'localizeaso_field_submit_proposal' ||
    name === 'localizeaso_metadata_submit_proposal' ||
    name === 'localizeaso_keywords_submit_proposal' ||
    name === 'localizeaso_field_proposal_template' ||
    name === 'localizeaso_metadata_proposal_template' ||
    name === 'localizeaso_keywords_proposal_template'
  ) {
    return {
      kind: 'localizeaso_review_signal_contract',
      requiredPerTarget,
      requiredPerTargetLabels,
      requiredReviewContext,
      requiredReviewContextLabels,
      targetLevels: ['field'],
      emptySignalsMeanConsidered: true,
      agentInstruction:
        'Include current value, agent proposal, human final placeholders, diffs, assignedKeywords, unassignedKeywords, warnings, and rationale on every proposed field-review change target; use empty arrays when no keyword or warning items apply.',
    };
  }
  return undefined;
}

function blockedHumanOnlyMcpSafety(name) {
  return {
    version: 1,
    agentSafe: false,
    humanOnly: true,
    blocked: true,
    requestedTool: name,
    operation: 'blocked_human_only_review_or_post_approval_action',
    proposalSubmissionOnly: false,
    appStoreSubmitAllowed: false,
    figmaApplyAllowed: false,
    approvalAllowed: false,
    rejectionAllowed: false,
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
    statusUpdateAllowed: false,
    postApprovalActionAllowed: false,
    readOnly: false,
    mutatesReviewData: false,
    requiresLocalizeAsoPass: false,
    requiredLocalizeAsoCapabilities: [],
    mutatesAppStoreConnect: false,
    requiresHostedAi: false,
    requiresAppStoreConnectCredentials: false,
    opensHumanReview: false,
    humanReviewNavigationOnly: false,
    reviewConsent: {
      requiredBeforeProtectedActions: true,
      opensHumanReviewScreen: false,
      reviewKind: 'blocked_human_only',
      checklist: [
        reviewConsentChecklistItem(
          'open_human_review_ui',
          'Open the LocalizeASO review UI or use a human-only CLI handoff after explicit reviewer consent.',
        ),
        reviewConsentChecklistItem(
          'mcp_blocks_protected_actions',
          'Do not approve, reject, apply, submit, schedule, upload, publish, or mark status through MCP.',
          'agent',
        ),
      ],
      prohibitedAgentActions: protectedHumanOnlyActions,
      agentInstruction:
        'This requested action is human-only. MCP exposes no approval, rejection, apply, submit, schedule, upload, publish, or status tools.',
    },
    humanApprovalConsentGranted: false,
    humanRejectionConsentGranted: false,
    humanPostApprovalConsentGranted: false,
    protectedActionsAllowed: false,
    applyPlanFingerprintRequiredForPostApproval: true,
    applyPlanFingerprintFlag: '--expected-apply-plan-fingerprint',
    applyPlanFingerprintGuidance:
      'Human-only apply, status, hosted upload/reorder, submit, and pricing schedule commands must use the approved apply-plan fingerprint from the exported apply plan.',
    protectedActionBoundary: LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY,
    rejectionProtectedActionBoundary: LOCALIZEASO_REJECTION_PROTECTED_ACTION_BOUNDARY,
    postApprovalReceiptRequired: true,
    postApprovalReceiptRecordedBy: 'human_only_dashboard_or_cli_after_fingerprint_consent',
    postApprovalReceiptHistoryVisibleInReviewQueue: true,
    postApprovalPathsHumanOnly: true,
    requiresHumanApprovalBeforeProtectedActions: true,
    requiresHumanRejectionConsentForReviewRejection: true,
    requiresHumanApprovalBeforePostApprovalActions: true,
    allowedScope:
      'Use MCP only for setup, inspection, keyword context, reviewable proposals, reviewer feedback, or opening the human review screen.',
    blockedActions: protectedHumanOnlyActions,
    guardrails: [
      'This requested action is human-only and is not exposed through MCP.',
      'Open the LocalizeASO review UI or use the human-only review/post-approval CLI handoff after explicit reviewer consent.',
      'Treat postApprovalPaths as human-only runbooks, not executable MCP permission.',
      'Use --expected-apply-plan-fingerprint from the approved apply-plan export for any human-only apply, status, upload, submit, pricing schedule, or hosted convenience command.',
      'Human-only post-approval actions record LocalizeASO receipts and receipt history outside MCP after fingerprint and consent checks pass.',
      'Autonomous agents must not approve, reject, apply, mark status, schedule pricing, or upload/submit to App Store Connect.',
    ],
  };
}

class UnsafeMcpToolError extends Error {
  constructor(name) {
    super(
      [
        `Unsafe MCP tool blocked: ${name}.`,
        'Approval and rejection are human-only review actions; rejection requires explicit human rejection consent.',
        'Apply, status, pricing export, hosted upload, and App Store submit steps are human-only post-approval commands and require the approved apply-plan fingerprint when they mutate approved output.',
      ].join(' '),
    );
    this.name = 'UnsafeMcpToolError';
    this.data = {
      localizeaso: {
        mcpSafety: blockedHumanOnlyMcpSafety(name),
      },
    };
  }
}

for (const tool of tools) {
  if (!tool.description.includes('MCP-safe:')) {
    tool.description = `${tool.description} ${safeMcpToolDescription}`;
  }
  tool.annotations = {
    readOnlyHint: isReadOnlyMcpTool(tool.name),
    destructiveHint: false,
    openWorldHint: true,
  };
  tool._meta = {
    localizeaso: {
      mcpSafety: mcpSafetyForTool(tool.name),
      monetizationBoundary: mcpMonetizationBoundary(tool.name),
      ...(reviewSignalContractForTool(tool.name)
        ? { reviewSignalContract: reviewSignalContractForTool(tool.name) }
        : {}),
    },
  };
}

function asString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing ${name}.`);
  }
  return value.trim();
}

function pushOptional(args, flag, value) {
  if (typeof value === 'string' && value.trim()) {
    args.push(flag, value.trim());
  }
}

function pushBoolean(args, flag, value) {
  if (value === true) {
    args.push(flag);
  }
}

function submitProposalOpenReview(input) {
  return input?.openReview === true;
}

function pushSubmitProposalOpenArg(args, input) {
  if (submitProposalOpenReview(input)) {
    args.push('--open');
    return;
  }
  args.push('--no-open');
}

function proposalFileInput(input) {
  return input.proposalFile ?? input.file;
}

function autoKeywordsCsv(input = {}) {
  return typeof input.keywordsCsv === 'string' && input.keywordsCsv.trim()
    ? input.keywordsCsv.trim()
    : 'optional-auto';
}

function autoAstroDir(input = {}) {
  return typeof input.astroDir === 'string' && input.astroDir.trim()
    ? input.astroDir.trim()
    : '.';
}

function pricingFieldStartBlockedKeywordInputs(input = {}, { syncKeywords = false, importKeywords = false } = {}) {
  return [
    syncKeywords || input.syncKeywords === true ? 'syncKeywords' : null,
    typeof input.keywordsCsv === 'string' && input.keywordsCsv.trim() ? 'keywordsCsv' : null,
    typeof input.astroDir === 'string' && input.astroDir.trim() ? 'astroDir' : null,
    importKeywords || input.importKeywords === true ? 'importKeywords' : null,
    typeof input.source === 'string' && input.source.trim() ? 'source' : null,
  ].filter(Boolean);
}

function rejectPricingFieldStartKeywordInputs(input = {}, options = {}) {
  if (fieldStartSurfaceFromInput(input) !== 'pricing') return;
  const blocked = pricingFieldStartBlockedKeywordInputs(input, options);
  if (!blocked.length) return;
  throw new Error(
    `Pricing field-start does not use keyword/Astro context inputs (${blocked.join(', ')}). ` +
      'Create the pricing review job without keyword inputs, then use localizeaso_pricing_brief for pricing context.',
  );
}

function pushAutoStartCommonArgs(args, input = {}, { syncKeywords = false, importKeywords = false } = {}) {
  if (syncKeywords) args.push('--sync-keywords');
  args.push('--keywords-csv', autoKeywordsCsv(input));
  args.push('--astro-dir', autoAstroDir(input));
  if (importKeywords) args.push('--import-keywords');
  pushOptional(args, '--source', input.source);
  pushOptional(args, '--bundle-out', input.bundleOut);
  pushOptional(args, '--handoff', input.handoffOut);
  pushBoolean(args, '--open', input.openReview);
  pushOptional(args, '--out', input.out);
}

function pushFieldAutoStartCommonArgs(args, input = {}, options = {}) {
  if (fieldStartSurfaceFromInput(input) !== 'pricing') {
    pushAutoStartCommonArgs(args, input, options);
    return;
  }

  rejectPricingFieldStartKeywordInputs(input);
  pushOptional(args, '--bundle-out', input.bundleOut);
  pushOptional(args, '--handoff', input.handoffOut);
  pushBoolean(args, '--open', input.openReview);
  pushOptional(args, '--out', input.out);
}

function pushStringArray(args, flag, values) {
  if (!Array.isArray(values)) return;
  const cleaned = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (cleaned.length) args.push(flag, cleaned.join(','));
}

function pushNumber(args, flag, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  args.push(flag, String(value));
}

function pushJson(args, flag, value) {
  if (value !== undefined) args.push(flag, JSON.stringify(value));
}

function pricingRefineTargets(targets) {
  if (!Array.isArray(targets)) return undefined;
  return targets
    .filter((target) => target && typeof target === 'object' && !Array.isArray(target))
    .map((target) => ({
      ...target,
      surface: 'pricing',
    }));
}

function metadataRefineTargets(targets) {
  if (!Array.isArray(targets)) return undefined;
  return targets
    .filter((target) => target && typeof target === 'object' && !Array.isArray(target))
    .map((target) => ({
      ...target,
      surface: 'metadata',
    }));
}

function keywordsRefineTargets(targets) {
  if (!Array.isArray(targets)) return undefined;
  return targets
    .filter((target) => target && typeof target === 'object' && !Array.isArray(target))
    .map((target) => ({
      ...target,
      surface: 'keywords',
    }));
}

function isUnsafePostApprovalToolName(name) {
  const normalized = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  if (normalized.endsWith('_submit_proposal') || normalized.endsWith('-submit-proposal')) {
    return false;
  }

  const tokens = normalized.split(/[-_]+/).filter(Boolean);
  const tokenSet = new Set(tokens);
  const hasAny = (values) => values.some((value) => tokenSet.has(value));
  const hasPair = (actions, targets) => hasAny(actions) && hasAny(targets);

  if (
    hasAny([
      'approve',
      'approval',
      'reject',
      'rejection',
      'apply',
      'applied',
      'status',
      'submitted',
      'uploaded',
      'published',
    ])
  ) {
    return true;
  }

  if (tokens.includes('mark') && hasAny(['applied', 'submitted', 'uploaded', 'published', 'status'])) {
    return true;
  }

  if (hasAny(['save', 'record', 'set', 'update']) && hasAny(['decision', 'decisions'])) {
    return true;
  }

  if (hasAny(['accept', 'accepted', 'edit', 'edited']) && hasAny([
    'decision',
    'decisions',
    'review',
    'field',
    'metadata',
    'keyword',
    'keywords',
    'pricing',
    'screenshot',
    'screenshots',
  ])) {
    return true;
  }

  const writeActions = [
    'complete',
    'completed',
    'confirm',
    'confirmed',
    'delete',
    'deleted',
    'export',
    'file',
    'files',
    'finalize',
    'finalized',
    'mutate',
    'mutated',
    'mutates',
    'mutation',
    'mutations',
    'payload',
    'push',
    'remove',
    'removed',
    'reorder',
    'reordered',
    'replace',
    'replaced',
    'schedule',
    'submit',
    'submitted',
    'upload',
    'uploaded',
  ];
  const publishActions = ['publish', 'published'];
  const metadataTargets = ['metadata', 'keyword', 'keywords'];
  const pricingTargets = ['pricing', 'price', 'prices'];
  const screenshotTargets = ['screenshot', 'screenshots'];
  const appStoreTargets = ['app', 'store', 'appstore', 'asc', 'hosted'];

  if (hasPair([...writeActions, ...publishActions], metadataTargets)) return true;
  if (hasPair([...writeActions, ...publishActions], pricingTargets)) return true;
  if (hasPair([...writeActions, ...publishActions], screenshotTargets)) return true;
  if (hasPair([...writeActions, ...publishActions], appStoreTargets)) return true;

  return false;
}

function argsForTool(name, input = {}) {
  if (isUnsafePostApprovalToolName(name)) {
    throw new UnsafeMcpToolError(name);
  }

  switch (name) {
    case 'localizeaso_local_doctor':
      return ['doctor', '--json'];
    case 'localizeaso_monetization_boundary': {
      const args = ['monetization-boundary'];
      pushOptional(args, '--kind', input.kind);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_workspace_runbook': {
      const args = ['workspace', 'runbook', '--json'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--astro-app', input.astroApp);
      pushOptional(args, '--metadata-file', input.metadataFile);
      pushOptional(args, '--keywords-file', input.keywordsFile);
      pushOptional(args, '--screenshots-file', input.screenshotsFile);
      pushOptional(args, '--pricing-file', input.pricingFile);
      if (input.includeMetadata === false) args.push('--no-metadata');
      if (input.includeKeywords === false) args.push('--no-keywords');
      if (input.includeScreenshots === false) args.push('--no-screenshots');
      if (input.includePricing === false) args.push('--no-pricing');
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keyword_context_from_csv': {
      const args = ['keyword-context-from-csv', '--file', asString(input.csvPath, 'csvPath')];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_astro_export': {
      const args = [];
      pushOptional(args, '--endpoint', input.endpoint);
      pushOptional(args, '--app', input.appId);
      pushStringArray(args, '--app', input.appIds);
      pushOptional(args, '--developer', input.developer);
      pushBoolean(args, '--all-tracked', input.allTracked);
      pushBoolean(args, '--no-asc-allowlist', input.noAscAllowlist);
      pushStringArray(args, '--store', input.stores);
      pushOptional(args, '--out-dir', input.outDir);
      pushOptional(args, '--zip', input.zipPath);
      pushOptional(args, '--keyword-context-out', input.keywordContextOut);
      pushBoolean(args, '--keep-dir', input.keepDir);
      pushBoolean(args, '--skip-ranking-history', input.skipRankingHistory);
      pushOptional(args, '--history-period', input.historyPeriod);
      pushNumber(args, '--max-ranking-history', input.maxRankingHistory);
      pushBoolean(args, '--include-suggestions', input.includeSuggestions);
      pushBoolean(args, '--include-competitors', input.includeCompetitors);
      pushNumber(args, '--timeout-ms', input.timeoutMs);
      pushBoolean(args, '--pretty', input.pretty);
      pushBoolean(args, '--dry-run', input.dryRun);
      return args;
    }
    case 'localizeaso_astro_keywords': {
      const args = [];
      pushOptional(args, '--endpoint', input.endpoint);
      pushOptional(args, '--app', input.appId);
      pushStringArray(args, '--app', input.appIds);
      pushOptional(args, '--developer', input.developer);
      pushBoolean(args, '--all-tracked', input.allTracked);
      pushBoolean(args, '--no-asc-allowlist', input.noAscAllowlist);
      pushStringArray(args, '--store', input.stores);
      pushOptional(args, '--out-dir', input.outDir);
      pushOptional(args, '--zip', input.zipPath);
      args.push('--keyword-context-out', typeof input.keywordContextOut === 'string' && input.keywordContextOut.trim()
        ? input.keywordContextOut.trim()
        : 'keyword-context.json');
      pushBoolean(args, '--keep-dir', input.keepDir);
      args.push('--skip-ranking-history');
      pushBoolean(args, '--include-suggestions', input.includeSuggestions);
      pushBoolean(args, '--include-competitors', input.includeCompetitors);
      pushNumber(args, '--timeout-ms', input.timeoutMs);
      pushBoolean(args, '--pretty', input.pretty);
      pushBoolean(args, '--dry-run', input.dryRun);
      return args;
    }
    case 'localizeaso_import_aso_keywords_from_csv': {
      const args = [
        'import-aso-keywords-from-csv',
        asString(input.appId, 'appId'),
        '--file',
        asString(input.csvPath, 'csvPath'),
      ];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_keyword_context': {
      const args = [
        'keyword-context',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.contextFile, 'contextFile'),
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_keyword_context_from_csv': {
      const args = [
        'keyword-context-from-csv',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.csvPath, 'csvPath'),
      ];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_keyword_brief': {
      const args = ['keyword-brief'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_keyword_prompt': {
      const args = ['keyword-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--brief', input.briefFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_keyword_automation': {
      const args = ['keyword-automation'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_agent_prompt': {
      const args = ['prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_proposal_template': {
      const args = ['proposal-template'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_keyword_context': {
      const args = [
        'field-keyword-context',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.contextFile, 'contextFile'),
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_keyword_context_from_csv': {
      const args = [
        'field-keyword-context-from-csv',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.csvPath, 'csvPath'),
      ];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_keyword_brief': {
      const args = ['field-keyword-brief'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_keyword_prompt': {
      const args = ['field-keyword-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--brief', input.briefFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_keyword_automation': {
      const args = ['field-keyword-automation'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_aso_keyword_map': {
      const args = ['field-aso-keyword-map'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_agent_prompt': {
      const args = ['field-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_proposal_template': {
      const args = ['field-proposal-template'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'metadata'];
      pushBoolean(args, '--sync-keywords', input.syncKeywords);
      pushOptional(args, '--keywords-csv', input.keywordsCsv);
      pushOptional(args, '--astro-dir', input.astroDir);
      pushBoolean(args, '--import-keywords', input.importKeywords);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_auto_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'metadata'];
      pushAutoStartCommonArgs(args, input, { syncKeywords: true });
      return args;
    }
    case 'localizeaso_metadata_auto_import_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'metadata'];
      pushAutoStartCommonArgs(args, input, { syncKeywords: true, importKeywords: true });
      return args;
    }
    case 'localizeaso_metadata_sync_keywords': {
      const args = ['field-sync-keywords', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_keyword_context': {
      const args = [
        'field-keyword-context',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.contextFile, 'contextFile'),
        '--surface',
        'metadata',
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_keyword_context_from_csv': {
      const args = [
        'field-keyword-context-from-csv',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.csvPath, 'csvPath'),
        '--surface',
        'metadata',
      ];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_keyword_brief': {
      const args = ['field-keyword-brief', '--surface', 'metadata'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_keyword_prompt': {
      const args = ['field-keyword-prompt', '--surface', 'metadata'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--brief', input.briefFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_keyword_automation': {
      const args = ['field-keyword-automation', '--surface', 'metadata'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_aso_keyword_map': {
      const args = ['field-aso-keyword-map'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      args.push('--surface', 'metadata');
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_bundle': {
      const args = ['field-bundle', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      return args;
    }
    case 'localizeaso_metadata_agent_prompt': {
      const args = ['field-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_proposal_template': {
      const args = ['field-proposal-template'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_handoff_summary': {
      const args = ['field-handoff-summary'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_submit_proposal': {
      const args = [
        'field-submit-proposal',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(proposalFileInput(input), 'proposalFile'),
      ];
      pushSubmitProposalOpenArg(args, input);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_refine_request': {
      const args = [
        'field-refine-request',
        asString(input.jobId, 'jobId'),
        '--instructions',
        asString(input.instructions, 'instructions'),
      ];
      pushStringArray(args, '--target-locales', input.targetLocales);
      const targets = metadataRefineTargets(input.targets);
      if (targets?.length) pushJson(args, '--targets', targets);
      pushOptional(args, '--proposal-id', input.proposalId);
      pushOptional(args, '--context-snapshot', input.contextSnapshot);
      pushOptional(args, '--context-snapshot-file', input.contextSnapshotFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_open_review':
    case 'localizeaso_metadata_popup': {
      const args = ['field-open', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_jobs': {
      const args = ['field-jobs', '--surface', 'metadata'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_open_next': {
      const args = ['field-open-next', '--surface', 'metadata'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_metadata_readiness': {
      const args = [
        'field-readiness',
        asString(input.jobId, 'jobId'),
        '--proposal-id',
        asString(input.proposalId, 'proposalId'),
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'keywords'];
      pushBoolean(args, '--sync-keywords', input.syncKeywords);
      pushOptional(args, '--keywords-csv', input.keywordsCsv);
      pushOptional(args, '--astro-dir', input.astroDir);
      pushBoolean(args, '--import-keywords', input.importKeywords);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_auto_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'keywords'];
      pushAutoStartCommonArgs(args, input, { syncKeywords: true });
      return args;
    }
    case 'localizeaso_keywords_auto_import_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile'), '--surface', 'keywords'];
      pushAutoStartCommonArgs(args, input, { syncKeywords: true, importKeywords: true });
      return args;
    }
    case 'localizeaso_keywords_sync_keywords': {
      const args = ['field-sync-keywords', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_keyword_context': {
      const args = [
        'field-keyword-context',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.contextFile, 'contextFile'),
        '--surface',
        'keywords',
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_keyword_context_from_csv': {
      const args = [
        'field-keyword-context-from-csv',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(input.csvPath, 'csvPath'),
        '--surface',
        'keywords',
      ];
      pushOptional(args, '--astro-dir', input.astroDir);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_keyword_brief': {
      const args = ['field-keyword-brief', '--surface', 'keywords'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_keyword_prompt': {
      const args = ['field-keyword-prompt', '--surface', 'keywords'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--brief', input.briefFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_keyword_automation': {
      const args = ['field-keyword-automation', '--surface', 'keywords'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_aso_keyword_map': {
      const args = ['field-aso-keyword-map'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      args.push('--surface', 'keywords');
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_bundle': {
      const args = ['field-bundle', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      return args;
    }
    case 'localizeaso_keywords_agent_prompt': {
      const args = ['field-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_proposal_template': {
      const args = ['field-proposal-template'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_handoff_summary': {
      const args = ['field-handoff-summary'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_submit_proposal': {
      const args = [
        'field-submit-proposal',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(proposalFileInput(input), 'proposalFile'),
      ];
      pushSubmitProposalOpenArg(args, input);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_refine_request': {
      const args = [
        'field-refine-request',
        asString(input.jobId, 'jobId'),
        '--instructions',
        asString(input.instructions, 'instructions'),
      ];
      pushStringArray(args, '--target-locales', input.targetLocales);
      const targets = keywordsRefineTargets(input.targets);
      if (targets?.length) pushJson(args, '--targets', targets);
      pushOptional(args, '--proposal-id', input.proposalId);
      pushOptional(args, '--context-snapshot', input.contextSnapshot);
      pushOptional(args, '--context-snapshot-file', input.contextSnapshotFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_open_review':
    case 'localizeaso_keywords_popup': {
      const args = ['field-open', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_jobs': {
      const args = ['field-jobs', '--surface', 'keywords'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_open_next': {
      const args = ['field-open-next', '--surface', 'keywords'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_keywords_readiness': {
      const args = [
        'field-readiness',
        asString(input.jobId, 'jobId'),
        '--proposal-id',
        asString(input.proposalId, 'proposalId'),
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_pricing_brief': {
      const args = ['field-pricing-brief'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_bundle': {
      const args = ['field-bundle', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      return args;
    }
    case 'localizeaso_pricing_agent_prompt': {
      const args = ['field-prompt'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_proposal_template': {
      const args = ['field-proposal-template'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_brief': {
      const args = ['field-pricing-brief'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_handoff_summary': {
      const args = ['field-handoff-summary'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_submit_proposal': {
      const args = [
        'field-submit-proposal',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(proposalFileInput(input), 'proposalFile'),
      ];
      pushSubmitProposalOpenArg(args, input);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_refine_request': {
      const args = [
        'field-refine-request',
        asString(input.jobId, 'jobId'),
        '--instructions',
        asString(input.instructions, 'instructions'),
      ];
      pushStringArray(args, '--target-locales', input.targetLocales);
      const targets = pricingRefineTargets(input.targets);
      if (targets?.length) pushJson(args, '--targets', targets);
      pushOptional(args, '--proposal-id', input.proposalId);
      pushOptional(args, '--context-snapshot', input.contextSnapshot);
      pushOptional(args, '--context-snapshot-file', input.contextSnapshotFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_open_review':
    case 'localizeaso_pricing_popup': {
      const args = ['field-open', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_jobs': {
      const args = ['field-jobs', '--surface', 'pricing'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_open_next': {
      const args = ['field-open-next', '--surface', 'pricing'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_readiness': {
      const args = [
        'field-readiness',
        asString(input.jobId, 'jobId'),
        '--proposal-id',
        asString(input.proposalId, 'proposalId'),
      ];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_parity_manifest': {
      const args = [
        'pricing-parity-manifest',
        '--app-id',
        asString(input.appId, 'appId'),
        '--file',
        asString(input.planFile, 'planFile'),
      ];
      pushOptional(args, '--product-kind', input.productKind);
      pushOptional(args, '--product-id', input.productId);
      pushOptional(args, '--instructions', input.instructions);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_parity': {
      const args = ['pricing-parity'];
      pushOptional(args, '--app-id', input.appId);
      args.push('--file', asString(input.planFile, 'planFile'));
      pushOptional(args, '--product-kind', input.productKind);
      pushOptional(args, '--product-id', input.productId);
      pushOptional(args, '--instructions', input.instructions);
      pushOptional(args, '--manifest-out', input.manifestOut);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_pricing_parity_start': {
      const args = ['pricing-parity-start'];
      pushOptional(args, '--app-id', input.appId);
      args.push('--file', asString(input.planFile, 'planFile'));
      pushOptional(args, '--product-kind', input.productKind);
      pushOptional(args, '--product-id', input.productId);
      pushOptional(args, '--instructions', input.instructions);
      pushOptional(args, '--manifest-out', input.manifestOut);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_sync_keywords': {
      const args = ['field-sync-keywords', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_start': {
      const args = ['start', '--file', asString(input.jobFile, 'jobFile')];
      pushOptional(args, '--keywords-csv', input.keywordsCsv);
      pushOptional(args, '--astro-dir', input.astroDir);
      pushBoolean(args, '--import-keywords', input.importKeywords);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_auto_start': {
      const args = ['start', '--file', asString(input.jobFile, 'jobFile')];
      pushAutoStartCommonArgs(args, input);
      return args;
    }
    case 'localizeaso_screenshot_auto_import_start': {
      const args = ['start', '--file', asString(input.jobFile, 'jobFile')];
      pushAutoStartCommonArgs(args, input, { importKeywords: true });
      return args;
    }
    case 'localizeaso_field_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile')];
      pushOptional(args, '--surface', input.surface);
      rejectPricingFieldStartKeywordInputs(input);
      if (input.syncKeywords === true) args.push('--sync-keywords');
      pushOptional(args, '--keywords-csv', input.keywordsCsv);
      pushOptional(args, '--astro-dir', input.astroDir);
      pushBoolean(args, '--import-keywords', input.importKeywords);
      pushOptional(args, '--source', input.source);
      pushOptional(args, '--bundle-out', input.bundleOut);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_auto_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile')];
      pushOptional(args, '--surface', input.surface);
      pushFieldAutoStartCommonArgs(args, input, { syncKeywords: true });
      return args;
    }
    case 'localizeaso_field_auto_import_start': {
      const args = ['field-start', '--file', asString(input.jobFile, 'jobFile')];
      pushOptional(args, '--surface', input.surface);
      pushFieldAutoStartCommonArgs(args, input, { syncKeywords: true, importKeywords: true });
      return args;
    }
    case 'localizeaso_screenshot_bundle': {
      const args = ['bundle', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      return args;
    }
    case 'localizeaso_screenshot_handoff_summary': {
      const args = ['handoff-summary'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_submit_proposal': {
      const args = [
        'submit-proposal',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(proposalFileInput(input), 'proposalFile'),
      ];
      pushSubmitProposalOpenArg(args, input);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_refine_request': {
      const args = [
        'refine-request',
        asString(input.jobId, 'jobId'),
        '--instructions',
        asString(input.instructions, 'instructions'),
      ];
      pushStringArray(args, '--target-locales', input.targetLocales);
      if (Array.isArray(input.targets)) pushJson(args, '--targets', input.targets);
      pushOptional(args, '--proposal-id', input.proposalId);
      pushOptional(args, '--context-snapshot', input.contextSnapshot);
      pushOptional(args, '--context-snapshot-file', input.contextSnapshotFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_open_review':
    case 'localizeaso_screenshot_popup': {
      const args = ['open', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_jobs': {
      const args = ['jobs'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_open_next': {
      const args = ['open-next'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_review_jobs': {
      const args = ['review-jobs'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_review_open_next': {
      const args = ['review-open-next'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_bundle': {
      const args = ['field-bundle', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      pushOptional(args, '--handoff', input.handoffOut);
      pushBoolean(args, '--open', input.openReview);
      return args;
    }
    case 'localizeaso_field_handoff_summary': {
      const args = ['field-handoff-summary'];
      if (typeof input.jobId === 'string' && input.jobId.trim()) args.push(input.jobId.trim());
      pushOptional(args, '--bundle', input.bundleFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_submit_proposal': {
      const args = [
        'field-submit-proposal',
        asString(input.jobId, 'jobId'),
        '--file',
        asString(proposalFileInput(input), 'proposalFile'),
      ];
      pushSubmitProposalOpenArg(args, input);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_refine_request': {
      const args = [
        'field-refine-request',
        asString(input.jobId, 'jobId'),
        '--instructions',
        asString(input.instructions, 'instructions'),
      ];
      pushStringArray(args, '--target-locales', input.targetLocales);
      if (Array.isArray(input.targets)) pushJson(args, '--targets', input.targets);
      pushOptional(args, '--proposal-id', input.proposalId);
      pushOptional(args, '--context-snapshot', input.contextSnapshot);
      pushOptional(args, '--context-snapshot-file', input.contextSnapshotFile);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_open_review':
    case 'localizeaso_field_popup': {
      const args = ['field-open', asString(input.jobId, 'jobId')];
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_jobs': {
      const args = ['field-jobs'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--surface', input.surface);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_field_open_next': {
      const args = ['field-open-next'];
      pushOptional(args, '--app-id', input.appId);
      pushOptional(args, '--surface', input.surface);
      pushOptional(args, '--status', input.status);
      pushOptional(args, '--out', input.out);
      return args;
    }
    case 'localizeaso_screenshot_readiness':
      const screenshotReadinessArgs = [
        'readiness',
        asString(input.jobId, 'jobId'),
        '--proposal-id',
        asString(input.proposalId, 'proposalId'),
      ];
      pushOptional(screenshotReadinessArgs, '--out', input.out);
      return screenshotReadinessArgs;
    case 'localizeaso_field_readiness':
      const fieldReadinessArgs = [
        'field-readiness',
        asString(input.jobId, 'jobId'),
        '--proposal-id',
        asString(input.proposalId, 'proposalId'),
      ];
      pushOptional(fieldReadinessArgs, '--out', input.out);
      return fieldReadinessArgs;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function scriptForTool(name) {
  if (name === 'localizeaso_local_doctor' || name === 'localizeaso_workspace_runbook') return localizeAsoScript;
  return isAstroKeywordExportTool(name) ? astroMcpExportScript : reviewAgentScript;
}

function runTool(name, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptForTool(name), ...args], {
      cwd: join(__dirname, '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      const text = stdout.trim();
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      resolve({
        code,
        stdout: text,
        stderr: stderr.trim(),
        parsed,
      });
    });
  });
}

function jsonFromOutputFile(input = {}) {
  const out = typeof input?.out === 'string' ? input.out.trim() : '';
  if (!out) return null;
  try {
    return JSON.parse(readFileSync(out, 'utf8'));
  } catch {
    return null;
  }
}

function responseFromRun(run, input = {}) {
  return run.parsed ?? jsonFromOutputFile(input) ?? {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.code,
  };
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function reviewSignalGroupLabel(value) {
  switch (cleanString(value)) {
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
      return cleanString(value);
  }
}

function normalizeMcpReviewSignalQualityGates(value) {
  const gates = asPlainObject(value);
  if (!gates) return undefined;
  const normalized = {};
  for (const key of ['missingKeywordMapping', 'missingRationale', 'noWarningsReported']) {
    const gate = cleanString(gates[key]);
    if (gate) normalized[key] = gate;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeMcpReviewSignalContract(value) {
  const contract = asPlainObject(value);
  if (!contract) return undefined;
  const requiredPerTarget = Array.isArray(contract.requiredPerTarget)
    ? contract.requiredPerTarget.map(cleanString).filter(Boolean)
    : [];
  const requiredPerTargetLabels = Array.isArray(contract.requiredPerTargetLabels)
    ? contract.requiredPerTargetLabels.map(cleanString).filter(Boolean)
    : requiredPerTarget.map(reviewSignalGroupLabel).filter(Boolean);
  const fallbackRequiredReviewContext = ['currentValue', 'agentProposal', 'humanFinal', 'diff'];
  const fallbackRequiredReviewContextLabels = [
    'current content',
    'agent proposal',
    'human final',
    'diff',
  ];
  const requiredReviewContext = Array.isArray(contract.requiredReviewContext)
    ? contract.requiredReviewContext.map(cleanString).filter(Boolean)
    : fallbackRequiredReviewContext;
  const requiredReviewContextLabels = Array.isArray(contract.requiredReviewContextLabels)
    ? contract.requiredReviewContextLabels.map(cleanString).filter(Boolean)
    : fallbackRequiredReviewContextLabels;
  const targetLevels = Array.isArray(contract.targetLevels)
    ? contract.targetLevels.map(cleanString).filter(Boolean)
    : [];
  const qualityGates = normalizeMcpReviewSignalQualityGates(contract.qualityGates);
  return {
    kind: cleanString(contract.kind),
    requiredPerTarget,
    requiredPerTargetLabels,
    requiredReviewContext,
    requiredReviewContextLabels,
    targetLevels,
    emptySignalsMeanConsidered: contract.emptySignalsMeanConsidered === true,
    ...(qualityGates ? { qualityGates } : {}),
    ...(cleanString(contract.agentInstruction)
      ? { agentInstruction: cleanString(contract.agentInstruction) }
      : {}),
    ...(cleanString(contract.humanReviewInstruction)
      ? { humanReviewInstruction: cleanString(contract.humanReviewInstruction) }
      : {}),
  };
}

function hasKeywordMappingNotApplicableSignal(...sources) {
  const matchesKeywordMappingNotApplicable = (value) => {
    const normalized = cleanString(value).toLowerCase();
    return (
      normalized === 'keywordmappingnotapplicable' ||
      normalized === 'keyword mapping n/a' ||
      normalized === 'keyword mapping marked not applicable' ||
      normalized === 'keyword mapping not applicable'
    );
  };

  for (const source of sources) {
    const record = asPlainObject(source);
    if (!record) continue;
    for (const key of [
      'requiredPerTarget',
      'requiredPerTargetLabels',
      'signalGroupsRequired',
      'signalGroupLabels',
      'visibleBeforeApproval',
      'missingSignalGroups',
    ]) {
      const values = Array.isArray(record[key]) ? record[key] : [];
      if (values.some(matchesKeywordMappingNotApplicable)) {
        return true;
      }
    }
    for (const key of ['signalPreviewMessage', 'message']) {
      const normalized = cleanString(record[key]).toLowerCase();
      if (
        normalized.includes('keyword mapping n/a') ||
        normalized.includes('keyword mapping marked not applicable') ||
        normalized.includes('keyword mapping not applicable')
      ) {
        return true;
      }
    }
    for (const key of ['humanReviewEvidence', 'humanReviewEvidenceSummary', 'signalPreviewAudit']) {
      if (hasKeywordMappingNotApplicableSignal(record[key])) return true;
    }
  }
  return false;
}

function hasScreenshotEvidenceRequiredSignal(...sources) {
  const matchesScreenshotEvidence = (value) => {
    const normalized = cleanString(value).toLowerCase();
    return normalized === 'screenshotevidence' || normalized === 'screenshot evidence';
  };

  for (const source of sources) {
    const record = asPlainObject(source);
    if (!record) continue;
    if (record.screenshotEvidenceRequired === true) return true;
    for (const key of [
      'requiredPerTarget',
      'requiredPerTargetLabels',
      'signalGroupsRequired',
      'signalGroupLabels',
    ]) {
      const values = Array.isArray(record[key]) ? record[key] : [];
      if (values.some(matchesScreenshotEvidence)) return true;
    }
    for (const key of ['humanReviewEvidence', 'humanReviewEvidenceSummary', 'reviewSignalContract']) {
      if (hasScreenshotEvidenceRequiredSignal(record[key])) return true;
    }
  }
  return false;
}

function hasVisibleScreenshotEvidenceSignal(...sources) {
  const matchesScreenshotEvidence = (value) => cleanString(value).toLowerCase() === 'screenshot evidence';

  for (const source of sources) {
    const record = asPlainObject(source);
    if (!record) continue;
    if (record.screenshotEvidenceVisible === true) return true;
    const visibleBeforeApproval = Array.isArray(record.visibleBeforeApproval)
      ? record.visibleBeforeApproval
      : [];
    if (visibleBeforeApproval.some(matchesScreenshotEvidence)) return true;
    for (const key of ['humanReviewEvidence', 'humanReviewEvidenceSummary']) {
      if (hasVisibleScreenshotEvidenceSignal(record[key])) return true;
    }
  }
  return false;
}

function firstFiniteCount(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function mcpSignalGapSummaryLine(
  {
    signalGapSummary,
    reviewGateSummary,
    signalAudit,
    reviewSignalContract,
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  },
  options = {},
) {
  const humanReviewEvidenceRecord = asPlainObject(humanReviewEvidence);
  const humanReviewEvidenceSummaryRecord = asPlainObject(humanReviewEvidenceSummary);
  const responseRecord = asPlainObject(response);
  const signalGapConsent =
    asPlainObject(humanReviewEvidenceRecord?.signalGapConsent) ||
    asPlainObject(humanReviewEvidenceSummaryRecord?.signalGapConsent) ||
    asPlainObject(responseRecord?.signalGapConsent);
  const signalGapConsentAudit = asPlainObject(signalGapConsent?.signalAudit);
  const signalGapConsentReviewGateSummary = asPlainObject(signalGapConsent?.reviewGateSummary);
  if (
    !signalGapSummary &&
    !reviewGateSummary &&
    !signalAudit &&
    !signalGapConsentAudit &&
    !signalGapConsentReviewGateSummary
  ) return undefined;
  return formatReviewSignalGapSummaryLine(
    {
      keywordMappingNotApplicableCount: firstFiniteCount(
        signalGapSummary?.keywordMappingNotApplicableCount,
        reviewGateSummary?.keywordMappingNotApplicableCount,
        signalAudit?.keywordMappingNotApplicableCount,
        signalGapConsentAudit?.keywordMappingNotApplicableCount,
        signalGapConsentReviewGateSummary?.keywordMappingNotApplicableCount,
      ),
      missingKeywordMappingCount: firstFiniteCount(
        signalGapSummary?.missingKeywordMappingCount,
        reviewGateSummary?.missingKeywordMappingCount,
        signalAudit?.missingKeywordMappingCount,
        signalGapConsentAudit?.missingKeywordMappingCount,
      ),
      missingRationaleCount: firstFiniteCount(
        signalGapSummary?.missingRationaleCount,
        reviewGateSummary?.missingRationaleCount,
        signalAudit?.missingRationaleCount,
        signalGapConsentAudit?.missingRationaleCount,
      ),
      noWarningsReportedCount: firstFiniteCount(
        signalGapSummary?.noWarningsReportedCount,
        reviewGateSummary?.noWarningsReportedCount,
        signalAudit?.noWarningsReportedCount,
        signalGapConsentAudit?.noWarningsReportedCount,
      ),
      screenshotEvidenceGapCount: firstFiniteCount(
        signalGapSummary?.screenshotEvidenceGapCount,
        reviewGateSummary?.screenshotEvidenceGapCount,
        signalGapConsentReviewGateSummary?.screenshotEvidenceGapCount,
      ),
    },
    {
      keywordMappingNotApplicable: hasKeywordMappingNotApplicableSignal(
        reviewSignalContract,
        humanReviewEvidence,
        humanReviewEvidenceSummary,
        response,
      ),
      includeNoGaps: options.includeNoGaps,
    },
  );
}

function mcpScreenshotEvidenceBreakdown({ signalGapSummary, reviewGateSummary, signalGapConsent }) {
  const signalGapConsentReviewGateSummary = asPlainObject(signalGapConsent?.reviewGateSummary);
  const missing = firstFiniteCount(
    signalGapSummary?.screenshotMissingTargetCount,
    reviewGateSummary?.screenshotMissingTargetCount,
    signalGapConsentReviewGateSummary?.screenshotMissingTargetCount,
  );
  const fallbackOnly = firstFiniteCount(
    signalGapSummary?.screenshotFallbackOnlyTargetCount,
    reviewGateSummary?.screenshotFallbackOnlyTargetCount,
    signalGapConsentReviewGateSummary?.screenshotFallbackOnlyTargetCount,
  );
  const contextOnly = firstFiniteCount(
    signalGapSummary?.screenshotContextOnlyTargetCount,
    reviewGateSummary?.screenshotContextOnlyTargetCount,
    signalGapConsentReviewGateSummary?.screenshotContextOnlyTargetCount,
  );
  const weak = firstFiniteCount(
    signalGapSummary?.screenshotWeakEvidenceTargetCount,
    reviewGateSummary?.screenshotWeakEvidenceTargetCount,
    signalGapConsentReviewGateSummary?.screenshotWeakEvidenceTargetCount,
  );
  const strong = firstFiniteCount(
    signalGapSummary?.screenshotStrongEvidenceTargetCount,
    reviewGateSummary?.screenshotStrongEvidenceTargetCount,
    signalGapConsentReviewGateSummary?.screenshotStrongEvidenceTargetCount,
  );
  const hasBreakdown = [missing, fallbackOnly, contextOnly, weak, strong].some(
    (value) => typeof value === 'number',
  );

  if (!hasBreakdown) return undefined;
  return {
    screenshotMissingTargetCount: Math.max(0, Math.floor(missing ?? 0)),
    screenshotFallbackOnlyTargetCount: Math.max(0, Math.floor(fallbackOnly ?? 0)),
    screenshotContextOnlyTargetCount: Math.max(0, Math.floor(contextOnly ?? 0)),
    screenshotWeakEvidenceTargetCount: Math.max(0, Math.floor(weak ?? 0)),
    screenshotStrongEvidenceTargetCount: Math.max(0, Math.floor(strong ?? 0)),
  };
}

function mcpScreenshotEvidenceBreakdownLine(breakdown) {
  if (!breakdown) return undefined;
  return `Screenshot evidence breakdown: ${breakdown.screenshotMissingTargetCount} missing, ${breakdown.screenshotFallbackOnlyTargetCount} fallback-only, ${breakdown.screenshotContextOnlyTargetCount} context-only, ${breakdown.screenshotWeakEvidenceTargetCount} weak, ${breakdown.screenshotStrongEvidenceTargetCount} strong.`;
}

function dashboardBaseUrl() {
  const configured = (cleanString(process.env.LOCALIZEASO_DASHBOARD) ||
    cleanString(process.env.LOCALIZEASO_DASHBOARD_URL) ||
    cleanString(process.env.PUBLIC_DASHBOARD_URL) ||
    cleanString(process.env.EXPO_PUBLIC_DASHBOARD_URL) ||
    defaultDashboardUrl()).replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return configured;
  try {
    const parsed = new URL(configured);
    if (parsed.hostname.toLowerCase().endsWith('.test')) return defaultDashboardUrl();
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
  const reviewUrl = cleanString(value);
  if (!reviewUrl) return '';
  let parsed;
  try {
    parsed = new URL(reviewUrl);
  } catch {
    return reviewUrl;
  }
  if (!isLocalDashboardTestHostname(parsed.hostname)) return reviewUrl;

  let base;
  try {
    base = new URL(dashboardBaseUrl());
  } catch {
    return reviewUrl;
  }
  if (!isLocalDashboardHostname(base.hostname)) return reviewUrl;
  return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, base).toString();
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
  if (Array.isArray(value)) return value.map((item) => normalizeReviewUrlsForLocalDashboard(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if ((key === 'reviewUrl' || key === 'dashboardUrl') && typeof entry === 'string') {
        return [key, normalizeReviewUrlForLocalDashboard(entry)];
      }
      return [key, normalizeReviewUrlsForLocalDashboard(entry)];
    }),
  );
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

function postProposalReviewGate(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const signalGapSummary = asPlainObject(response.signalGapSummary);
  const signalAudit = response.signalAudit &&
      typeof response.signalAudit === 'object' &&
      !Array.isArray(response.signalAudit)
    ? response.signalAudit
    : {};
  const reviewGateSummary = response.reviewGateSummary &&
      typeof response.reviewGateSummary === 'object' &&
      !Array.isArray(response.reviewGateSummary)
    ? response.reviewGateSummary
    : {};
  const humanReviewEvidence = asPlainObject(response.humanReviewEvidence);
  const humanReviewEvidenceSummary = asPlainObject(response.humanReviewEvidenceSummary);
  const signalGapConsent =
    asPlainObject(response.signalGapConsent) ||
    asPlainObject(humanReviewEvidence?.signalGapConsent) ||
    asPlainObject(humanReviewEvidenceSummary?.signalGapConsent);
  const signalGapConsentAudit = asPlainObject(signalGapConsent?.signalAudit);
  const signalGapConsentReviewGateSummary = asPlainObject(signalGapConsent?.reviewGateSummary);
  const pendingTargetCount =
    typeof reviewGateSummary.pendingTargetCount === 'number'
      ? reviewGateSummary.pendingTargetCount
      : typeof signalAudit.totalTargets === 'number'
        ? signalAudit.totalTargets
        : undefined;
  const warnings = Array.isArray(reviewGateSummary.warnings)
    ? reviewGateSummary.warnings.map(cleanString).filter(Boolean)
    : [];
  const reviewSignalContract = normalizeMcpReviewSignalContract(response.reviewSignalContract);
  const explicitScreenshotEvidenceRequired = hasScreenshotEvidenceRequiredSignal(
    reviewSignalContract,
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  );
  const screenshotEvidenceVisible = hasVisibleScreenshotEvidenceSignal(
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  );
  const signalGapSummaryLine = mcpSignalGapSummaryLine({
    signalGapSummary,
    reviewGateSummary,
    signalAudit,
    reviewSignalContract,
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  });
  const screenshotEvidenceBreakdown = mcpScreenshotEvidenceBreakdown({
    signalGapSummary,
    reviewGateSummary,
    signalGapConsent,
  });
  const screenshotEvidenceBreakdownLine = mcpScreenshotEvidenceBreakdownLine(screenshotEvidenceBreakdown);
  const targetsNeedingAttentionCount = firstFiniteCount(
    signalGapSummary?.targetsNeedingAttentionCount,
    reviewGateSummary.targetsNeedingAttentionCount,
    signalAudit.targetsNeedingAttentionCount,
    signalGapConsentAudit?.targetsNeedingAttentionCount,
    signalGapConsentReviewGateSummary?.targetsNeedingAttentionCount,
  );
  const keywordMappingNotApplicableCount = firstFiniteCount(
    signalGapSummary?.keywordMappingNotApplicableCount,
    reviewGateSummary.keywordMappingNotApplicableCount,
    signalAudit.keywordMappingNotApplicableCount,
    signalGapConsentAudit?.keywordMappingNotApplicableCount,
    signalGapConsentReviewGateSummary?.keywordMappingNotApplicableCount,
  );
  const missingKeywordMappingCount = firstFiniteCount(
    signalGapSummary?.missingKeywordMappingCount,
    reviewGateSummary.missingKeywordMappingCount,
    signalAudit.missingKeywordMappingCount,
    signalGapConsentAudit?.missingKeywordMappingCount,
  );
  const missingRationaleCount = firstFiniteCount(
    signalGapSummary?.missingRationaleCount,
    reviewGateSummary.missingRationaleCount,
    signalAudit.missingRationaleCount,
    signalGapConsentAudit?.missingRationaleCount,
  );
  const noWarningsReportedCount = firstFiniteCount(
    signalGapSummary?.noWarningsReportedCount,
    reviewGateSummary.noWarningsReportedCount,
    signalAudit.noWarningsReportedCount,
    signalGapConsentAudit?.noWarningsReportedCount,
  );
  const screenshotEvidenceGapCount = firstFiniteCount(
    signalGapSummary?.screenshotEvidenceGapCount,
    reviewGateSummary.screenshotEvidenceGapCount,
    signalGapConsentReviewGateSummary?.screenshotEvidenceGapCount,
  );
  const screenshotEvidenceRequired =
    explicitScreenshotEvidenceRequired || typeof screenshotEvidenceGapCount === 'number';
  const rawSignalGate = cleanString(reviewGateSummary.signalGate);
  const signalGate =
    typeof screenshotEvidenceGapCount === 'number' &&
    screenshotEvidenceGapCount > 0 &&
    rawSignalGate !== 'attention_required'
      ? 'attention_required'
      : rawSignalGate;
  if (
    typeof pendingTargetCount !== 'number' &&
    !signalGapSummary &&
    !Object.keys(signalAudit).length &&
    !Object.keys(reviewGateSummary).length
  ) {
    return undefined;
  }
  return {
    kind: 'localizeaso_post_proposal_review_gate',
    phase: 'post_proposal_human_review',
    humanReviewRequired: true,
    approvalState: 'requires_human_review',
    ...(cleanString(reviewGateSummary.reviewKind)
      ? { reviewKind: cleanString(reviewGateSummary.reviewKind) }
      : {}),
    ...(typeof pendingTargetCount === 'number' ? { pendingTargetCount } : {}),
    ...(cleanString(reviewGateSummary.humanDecisionGate)
      ? { humanDecisionGate: cleanString(reviewGateSummary.humanDecisionGate) }
      : {}),
    ...(signalGate ? { signalGate } : {}),
    ...(typeof targetsNeedingAttentionCount === 'number' ? { targetsNeedingAttentionCount } : {}),
    ...(typeof keywordMappingNotApplicableCount === 'number' ? { keywordMappingNotApplicableCount } : {}),
    ...(typeof missingKeywordMappingCount === 'number' ? { missingKeywordMappingCount } : {}),
    ...(typeof missingRationaleCount === 'number' ? { missingRationaleCount } : {}),
    ...(typeof noWarningsReportedCount === 'number' ? { noWarningsReportedCount } : {}),
    ...(typeof screenshotEvidenceGapCount === 'number' ? { screenshotEvidenceGapCount } : {}),
    screenshotEvidenceRequired,
    screenshotEvidenceVisible,
    ...(screenshotEvidenceBreakdown
      ? {
          screenshotMissingTargetCount: screenshotEvidenceBreakdown.screenshotMissingTargetCount,
          screenshotFallbackOnlyTargetCount: screenshotEvidenceBreakdown.screenshotFallbackOnlyTargetCount,
          screenshotContextOnlyTargetCount: screenshotEvidenceBreakdown.screenshotContextOnlyTargetCount,
          screenshotWeakEvidenceTargetCount: screenshotEvidenceBreakdown.screenshotWeakEvidenceTargetCount,
          screenshotStrongEvidenceTargetCount: screenshotEvidenceBreakdown.screenshotStrongEvidenceTargetCount,
        }
      : {}),
    ...(signalGapSummaryLine ? { signalGapSummaryLine } : {}),
    ...(screenshotEvidenceBreakdownLine ? { screenshotEvidenceBreakdownLine } : {}),
    warnings,
    agentInstruction: cleanString(reviewGateSummary.agentInstruction) ||
      'Open the human review screen before approval. This gate is informational and does not approve, apply, submit, schedule pricing, or mark status.',
  };
}

function postProposalRequiredLocalizeAsoCapabilities(toolName, response, handoffSafety) {
  if (Array.isArray(handoffSafety.requiredLocalizeAsoCapabilities)) {
    const capabilities = handoffSafety.requiredLocalizeAsoCapabilities.map(cleanString).filter(Boolean);
    if (capabilities.length) return capabilities;
  }
  const capabilities = ['byoAgent', 'reviewHistory'];
  if (toolName.includes('_screenshot_')) capabilities.push('figmaPlugin');
  const responseJob = response?.job && typeof response.job === 'object' && !Array.isArray(response.job)
    ? response.job
    : {};
  const proposalPayload = response?.proposal?.payload &&
      typeof response.proposal.payload === 'object' &&
      !Array.isArray(response.proposal.payload)
    ? response.proposal.payload
    : {};
  const surface =
    cleanString(responseJob.surface) ||
    cleanString(response.surface) ||
    cleanString(proposalPayload.surface);
  if (toolName.includes('_field_') && surface === 'pricing') capabilities.push('pricingReview');
  return capabilities;
}

function postProposalHumanReviewMeta(toolName, response) {
  if (!toolName.endsWith('_submit_proposal')) return undefined;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;

  const humanReview = response.humanReview &&
      typeof response.humanReview === 'object' &&
      !Array.isArray(response.humanReview)
    ? response.humanReview
    : {};
  const nextHumanAction = response.nextHumanAction &&
      typeof response.nextHumanAction === 'object' &&
      !Array.isArray(response.nextHumanAction)
    ? response.nextHumanAction
    : {};
  const handoffSafety = response.handoffSafety &&
      typeof response.handoffSafety === 'object' &&
      !Array.isArray(response.handoffSafety)
    ? response.handoffSafety
    : {};
  const reviewSignalContract = normalizeMcpReviewSignalContract(response.reviewSignalContract);
  const reviewUrl = normalizeReviewUrlForLocalDashboard(
    cleanString(humanReview.reviewUrl) || cleanString(nextHumanAction.reviewUrl),
  );
  if (!reviewUrl) return undefined;
  const protectedActions = Array.isArray(handoffSafety.protectedActions)
    ? handoffSafety.protectedActions.map(cleanString).filter(Boolean)
    : protectedHumanOnlyActions.filter((action) =>
        [
          'human_approval',
          'review_rejection',
          'direct_asc_mutation',
          'figma_apply',
          'metadata_apply',
          'metadata_export',
          'metadata_push',
          'metadata_publish',
          'metadata_replace',
          'pricing_payload_export',
          'pricing_export',
          'pricing_schedule',
          'pricing_submit',
          'pricing_publish',
          'screenshot_apply',
          'screenshot_complete',
          'screenshot_delete',
          'screenshot_reorder',
          'screenshot_upload',
          'screenshot_publish',
          'app_store_upload',
          'app_store_upload_finalize',
          'app_store_submit',
          'app_store_publish',
          'status_update',
        ].includes(action),
      );
  if (!protectedActions.includes('review_rejection')) {
    const humanApprovalIndex = protectedActions.indexOf('human_approval');
    protectedActions.splice(humanApprovalIndex >= 0 ? humanApprovalIndex + 1 : 0, 0, 'review_rejection');
  }
  const reviewGate = postProposalReviewGate(response);
  const responseMonetizationBoundary = mergeMcpMonetizationBoundary(toolName, response.monetizationBoundary);

  return {
    required: humanReview.required === true,
    actor: cleanString(humanReview.actor) || 'human',
    reviewUrl,
    openReviewCommand: cleanString(humanReview.openReviewCommand) || cleanString(nextHumanAction.command),
    nextHumanAction: {
      id: cleanString(nextHumanAction.id) || 'open_review_and_decide',
      label: cleanString(nextHumanAction.label) || 'Open review and decide',
      command: cleanString(nextHumanAction.command) || cleanString(humanReview.openReviewCommand),
      reviewUrl,
    },
    ...(reviewSignalContract
      ? {
          reviewSignalContract,
        }
      : {}),
    ...(reviewGate ? { postProposalReviewGate: reviewGate } : {}),
    monetizationBoundary: responseMonetizationBoundary,
    handoffSafety: {
      agentSafe: handoffSafety.agentSafe === true,
      humanOnly: true,
      requiresLocalizeAsoPass: true,
      requiredLocalizeAsoCapabilities: postProposalRequiredLocalizeAsoCapabilities(toolName, response, handoffSafety),
      requiresHostedAi: false,
      requiresAppStoreConnectCredentials: false,
      mutatesReviewData: true,
      mutatesPersistentKeywordInventory: false,
      mutatesAppStoreConnect: false,
      phase: cleanString(handoffSafety.phase) || 'post_proposal_human_review',
      proposalSubmissionOnly: handoffSafety.proposalSubmissionOnly === true,
      protectedActionsAllowed: handoffSafety.protectedActionsAllowed === true,
      protectedActionsExecutableByAgent: false,
      protectedActionsExecutableByMcp: false,
      postApprovalRunbookExecutionAllowedInMcp: false,
      approvalAllowed: handoffSafety.approvalAllowed === true,
      rejectionAllowed: handoffSafety.rejectionAllowed === true,
      figmaApplyAllowed: handoffSafety.figmaApplyAllowed === true,
      metadataApplyAllowed: handoffSafety.metadataApplyAllowed === true,
      metadataExportAllowed: handoffSafety.metadataExportAllowed === true,
      metadataPublishAllowed: handoffSafety.metadataPublishAllowed === true,
      keywordApplyAllowed: handoffSafety.keywordApplyAllowed === true,
      pricingExportAllowed: handoffSafety.pricingExportAllowed === true,
      pricingScheduleAllowed: handoffSafety.pricingScheduleAllowed === true,
      pricingPublishAllowed: handoffSafety.pricingPublishAllowed === true,
      screenshotUploadAllowed: handoffSafety.screenshotUploadAllowed === true,
      screenshotPublishAllowed: handoffSafety.screenshotPublishAllowed === true,
      appStoreUploadAllowed: handoffSafety.appStoreUploadAllowed === true,
      appStoreSubmitAllowed: handoffSafety.appStoreSubmitAllowed === true,
      localAscHandoffAllowed: handoffSafety.localAscHandoffAllowed === true,
      hostedAppStoreSubmitAllowed: typeof handoffSafety.hostedAppStoreSubmitAllowed === 'boolean'
        ? handoffSafety.hostedAppStoreSubmitAllowed
        : false,
      appStorePublishAllowed: handoffSafety.appStorePublishAllowed === true,
      statusUpdateAllowed: handoffSafety.statusUpdateAllowed === true,
      postApprovalActionAllowed: handoffSafety.postApprovalActionAllowed === true,
      humanApprovalConsentGranted: handoffSafety.humanApprovalConsentGranted === true,
      humanRejectionConsentGranted: handoffSafety.humanRejectionConsentGranted === true,
      humanPostApprovalConsentGranted: handoffSafety.humanPostApprovalConsentGranted === true,
      protectedActions,
      agentInstruction: cleanString(handoffSafety.agentInstruction),
    },
  };
}

function readinessReviewGateMeta(toolName, response) {
  if (!toolName.endsWith('_readiness')) return undefined;
  const gate = response?.readinessReviewGate &&
      typeof response.readinessReviewGate === 'object' &&
      !Array.isArray(response.readinessReviewGate)
    ? response.readinessReviewGate
    : undefined;
  return gate;
}

function readinessInspectionMeta(toolName, response) {
  if (!toolName.endsWith('_readiness')) return undefined;
  const root = asPlainObject(response);
  if (!root) return undefined;
  const readinessReviewGate = asPlainObject(root.readinessReviewGate);
  const readinessBoundary = asPlainObject(root.readinessBoundary);
  const reviewGateSummary = asPlainObject(root.reviewGateSummary);
  const finalValueGate = asPlainObject(root.finalValueGate);
  const signalGapSummary = asPlainObject(root.signalGapSummary);
  const signalAudit = asPlainObject(root.signalAudit);
  if (
    !readinessReviewGate &&
    !readinessBoundary &&
    !reviewGateSummary &&
    !finalValueGate &&
    !signalGapSummary &&
    !signalAudit
  ) {
    return undefined;
  }
  const reviewSignalContract = normalizeMcpReviewSignalContract(root.reviewSignalContract);
  const humanReviewEvidence = asPlainObject(root.humanReviewEvidence);
  const humanReviewEvidenceSummary = asPlainObject(root.humanReviewEvidenceSummary);
  const signalGapConsent =
    asPlainObject(root.signalGapConsent) ||
    asPlainObject(humanReviewEvidence?.signalGapConsent) ||
    asPlainObject(humanReviewEvidenceSummary?.signalGapConsent);
  const signalGapSummaryLine = mcpSignalGapSummaryLine({
    signalGapSummary,
    reviewGateSummary,
    signalAudit,
    reviewSignalContract,
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response: root,
  });
  const screenshotEvidenceBreakdownLine = mcpScreenshotEvidenceBreakdownLine(
    mcpScreenshotEvidenceBreakdown({ signalGapSummary, reviewGateSummary, signalGapConsent }),
  );
  const screenshotEvidenceGapCount = firstFiniteCount(
    signalGapSummary?.screenshotEvidenceGapCount,
    reviewGateSummary?.screenshotEvidenceGapCount,
    signalGapConsent?.reviewGateSummary?.screenshotEvidenceGapCount,
  );
  const screenshotEvidenceRequired =
    hasScreenshotEvidenceRequiredSignal(
      reviewSignalContract,
      humanReviewEvidence,
      humanReviewEvidenceSummary,
      root,
    ) || typeof screenshotEvidenceGapCount === 'number';
  const screenshotEvidenceVisible = hasVisibleScreenshotEvidenceSignal(
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    root,
  );
  const reviewKind =
    cleanString(readinessReviewGate?.reviewKind) ||
    cleanString(readinessBoundary?.reviewKind) ||
    cleanString(reviewGateSummary?.reviewKind);
  const ready =
    typeof readinessReviewGate?.ready === 'boolean'
      ? readinessReviewGate.ready
      : typeof reviewGateSummary?.ready === 'boolean'
        ? reviewGateSummary.ready
        : typeof root.ready === 'boolean'
          ? root.ready
          : undefined;
  const agentInstruction =
    cleanString(readinessReviewGate?.agentInstruction) ||
    cleanString(readinessBoundary?.agentInstruction) ||
    cleanString(reviewGateSummary?.agentInstruction) ||
    cleanString(finalValueGate?.agentInstruction) ||
    'Readiness is inspection only. It does not approve, apply, export, schedule, submit, or mark status.';

  return {
    kind: 'localizeaso_readiness_inspection',
    phase: 'readiness_inspection',
    readOnly: readinessBoundary?.readOnly !== false && readinessReviewGate?.readOnly !== false,
    approvalGranted: readinessBoundary?.approvalGranted === true || readinessReviewGate?.approvalGranted === true,
    postApprovalActionAllowed:
      readinessBoundary?.postApprovalActionAllowed === true ||
      readinessReviewGate?.postApprovalActionAllowed === true,
    humanReviewRequired: readinessReviewGate?.humanReviewRequired !== false,
    ...(reviewKind ? { reviewKind } : {}),
    ...(typeof ready === 'boolean' ? { ready } : {}),
    agentInstruction,
    ...(signalAudit ? { signalAudit } : {}),
    ...(signalGapSummary ? { signalGapSummary } : {}),
    ...(signalGapSummaryLine ? { signalGapSummaryLine } : {}),
    ...(screenshotEvidenceBreakdownLine ? { screenshotEvidenceBreakdownLine } : {}),
    screenshotEvidenceRequired,
    screenshotEvidenceVisible,
    ...(reviewGateSummary ? { reviewGateSummary } : {}),
    ...(finalValueGate ? { finalValueGate } : {}),
    ...(readinessBoundary ? { readinessBoundary } : {}),
    ...(readinessReviewGate ? { readinessReviewGate } : {}),
  };
}

function backendErrorMeta(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
  if (response.kind !== 'backend_error') return undefined;
  const pendingTargets = Array.isArray(response.pendingTargets) ? response.pendingTargets : [];
  const openReviewActions = response.openReviewActions &&
      typeof response.openReviewActions === 'object' &&
      !Array.isArray(response.openReviewActions)
    ? response.openReviewActions
    : undefined;
  const signalAudit = response.signalAudit &&
      typeof response.signalAudit === 'object' &&
      !Array.isArray(response.signalAudit)
    ? response.signalAudit
    : undefined;
  const reviewGateSummary = response.reviewGateSummary &&
      typeof response.reviewGateSummary === 'object' &&
      !Array.isArray(response.reviewGateSummary)
    ? response.reviewGateSummary
    : undefined;
  const signalGapSummary = response.signalGapSummary &&
      typeof response.signalGapSummary === 'object' &&
      !Array.isArray(response.signalGapSummary)
    ? response.signalGapSummary
    : undefined;
  const finalValueGate = response.finalValueGate &&
      typeof response.finalValueGate === 'object' &&
      !Array.isArray(response.finalValueGate)
    ? response.finalValueGate
    : undefined;
  const readinessBoundary = response.readinessBoundary &&
      typeof response.readinessBoundary === 'object' &&
      !Array.isArray(response.readinessBoundary)
    ? response.readinessBoundary
    : undefined;
  const readinessReviewGate = response.readinessReviewGate &&
      typeof response.readinessReviewGate === 'object' &&
      !Array.isArray(response.readinessReviewGate)
    ? response.readinessReviewGate
    : undefined;
  const keywordContextLock = response.keywordContextLock &&
      typeof response.keywordContextLock === 'object' &&
      !Array.isArray(response.keywordContextLock)
    ? response.keywordContextLock
    : undefined;
  const consentGate = response.consentGate &&
      typeof response.consentGate === 'object' &&
      !Array.isArray(response.consentGate)
    ? response.consentGate
    : undefined;
  const reviewSignalContract = normalizeMcpReviewSignalContract(response.reviewSignalContract);
  const humanReviewEvidence = asPlainObject(response.humanReviewEvidence);
  const humanReviewEvidenceSummary = asPlainObject(response.humanReviewEvidenceSummary);
  const signalGapConsent =
    asPlainObject(response.signalGapConsent) ||
    asPlainObject(humanReviewEvidence?.signalGapConsent) ||
    asPlainObject(humanReviewEvidenceSummary?.signalGapConsent);
  const target = response.target &&
      typeof response.target === 'object' &&
      !Array.isArray(response.target)
    ? response.target
    : undefined;
  const missingFields = Array.isArray(response.missingFields)
    ? response.missingFields.map(cleanString).filter(Boolean)
    : [];
  const requiredCapabilities = Array.isArray(response.requiredCapabilities)
    ? response.requiredCapabilities.map(cleanString).filter(Boolean)
    : [];
  const signalGapSummaryLine = mcpSignalGapSummaryLine({
    signalGapSummary,
    reviewGateSummary,
    signalAudit,
    reviewSignalContract,
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  }, { includeNoGaps: false });
  const screenshotEvidenceBreakdownLine = mcpScreenshotEvidenceBreakdownLine(
    mcpScreenshotEvidenceBreakdown({ signalGapSummary, reviewGateSummary, signalGapConsent }),
  );
  const screenshotEvidenceGapCount = firstFiniteCount(
    signalGapSummary?.screenshotEvidenceGapCount,
    reviewGateSummary?.screenshotEvidenceGapCount,
    signalGapConsent?.reviewGateSummary?.screenshotEvidenceGapCount,
  );
  const screenshotEvidenceRequired =
    hasScreenshotEvidenceRequiredSignal(
      reviewSignalContract,
      humanReviewEvidence,
      humanReviewEvidenceSummary,
      response,
    ) || typeof screenshotEvidenceGapCount === 'number';
  const screenshotEvidenceVisible = hasVisibleScreenshotEvidenceSignal(
    humanReviewEvidence,
    humanReviewEvidenceSummary,
    response,
  );
  return {
    status: typeof response.status === 'number' ? response.status : undefined,
    code: cleanString(response.code),
    path: cleanString(response.path),
    error: cleanString(response.error),
    hint: cleanString(response.hint),
    pendingTargetCount: pendingTargets.length,
    ...(openReviewActions ? { openReviewActions } : {}),
    ...(cleanString(response.capability) ? { capability: cleanString(response.capability) } : {}),
    ...(cleanString(response.requiredCapability) ? { requiredCapability: cleanString(response.requiredCapability) } : {}),
    ...(requiredCapabilities.length ? { requiredCapabilities } : {}),
    ...(signalAudit ? { signalAudit } : {}),
    ...(signalGapSummary ? { signalGapSummary } : {}),
    ...(signalGapSummaryLine ? { signalGapSummaryLine } : {}),
    ...(screenshotEvidenceBreakdownLine ? { screenshotEvidenceBreakdownLine } : {}),
    screenshotEvidenceRequired,
    screenshotEvidenceVisible,
    ...(reviewGateSummary ? { reviewGateSummary } : {}),
    ...(finalValueGate ? { finalValueGate } : {}),
    ...(readinessBoundary ? { readinessBoundary } : {}),
    ...(readinessReviewGate ? { readinessReviewGate } : {}),
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    ...(missingFields.length ? { missingFields } : {}),
    ...(target ? { target } : {}),
    ...(cleanString(response.agentInstruction) ? { agentInstruction: cleanString(response.agentInstruction) } : {}),
    ...(consentGate ? { consentGate } : {}),
    ...(keywordContextLock ? { keywordContextLock } : {}),
  };
}

function handoffSummaryMeta(toolName, response) {
  if (!toolName.endsWith('_handoff_summary')) return undefined;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const commandSummary = asPlainObject(response.commandSummary);
  const safety = asPlainObject(commandSummary?.safety);
  const agentSafe = Array.isArray(commandSummary?.agentSafe)
    ? commandSummary.agentSafe
    : Array.isArray(response.agentSafeCommands)
      ? response.agentSafeCommands
      : [];
  const humanOnly = Array.isArray(commandSummary?.humanOnly)
    ? commandSummary.humanOnly
    : Array.isArray(response.humanOnlyCommands)
      ? response.humanOnlyCommands
      : [];
  const postApprovalPaths = Array.isArray(commandSummary?.postApprovalPaths)
    ? commandSummary.postApprovalPaths
    : Array.isArray(response.postApprovalPaths)
      ? response.postApprovalPaths
      : [];
  const postApprovalFingerprintRequirement = sanitizePostApprovalFingerprintRequirement(
    asPlainObject(commandSummary?.postApprovalFingerprintRequirement) ||
      asPlainObject(response.postApprovalFingerprintRequirement),
  );
  const humanOnlyPathCount = postApprovalPaths.filter((path) => {
    const record = asPlainObject(path);
    return Boolean(record);
  }).length;
  const postApprovalPathGuidance = postApprovalPaths
    .map((path) => {
      const record = asPlainObject(path);
      if (!record) return null;
      const id = cleanString(record.id);
      const mode = cleanString(record.mode);
      if (!id || !mode) return null;
      const guidance = cleanString(record.guidance) || postApprovalPathModeGuidance(mode);
      if (!guidance) return null;
      return { id, mode, guidance };
    })
    .filter(Boolean);
  const postApprovalPathMonetizationBoundaries = postApprovalPaths
    .map((path) => {
      const record = asPlainObject(path);
      const boundary = asPlainObject(record?.monetizationBoundary);
      if (!record || !boundary) return null;
      const id = cleanString(record.id);
      const mode = cleanString(record.mode);
      if (!id || !mode) return null;
      const revenueBoundary = cleanString(boundary.revenueBoundary);
      const appStoreConnectCredentialMode = cleanString(boundary.appStoreConnectCredentialMode);
      const requiresHostedSubmitPass = boundary.requiresHostedSubmitPass === true;
      const packageLabel =
        cleanString(boundary.packageLabel) ||
        postApprovalPackageLabel({
          revenueBoundary,
          appStoreConnectCredentialMode,
          requiresHostedSubmitPass,
        });
      const packageGuidance =
        cleanString(boundary.packageGuidance) ||
        postApprovalPackageGuidance({
          revenueBoundary,
          appStoreConnectCredentialMode,
          requiresHostedSubmitPass,
        });
      return {
        id,
        mode,
        humanOnly: true,
        requiresLocalizeAsoPass: boundary.requiresLocalizeAsoPass === true,
        requiredLocalizeAsoCapabilities: Array.isArray(boundary.requiredLocalizeAsoCapabilities)
          ? boundary.requiredLocalizeAsoCapabilities.map(cleanString).filter(Boolean)
          : [],
        requiresHostedAi: boundary.requiresHostedAi === true,
        requiresHostedSubmitPass,
        appStoreConnectCredentialMode,
        revenueBoundary,
        ...(packageLabel ? { packageLabel } : {}),
        ...(packageGuidance ? { packageGuidance } : {}),
      };
    })
    .filter(Boolean);
  const reviewSignalContract = normalizeMcpReviewSignalContract(
    asPlainObject(commandSummary?.reviewSignalContract) || response.reviewSignalContract,
  );
  const reviewUrl = normalizeReviewUrlForLocalDashboard(response.reviewUrl);

  return {
    reviewKind: cleanString(response.reviewKind),
    surface: cleanString(response.surface),
    ...(reviewUrl ? { reviewUrl } : {}),
    agentSafeCommandCount: agentSafe.length,
    humanOnlyCommandCount: humanOnly.length,
    postApprovalPathCount: postApprovalPaths.length,
    humanOnlyPostApprovalPathCount: humanOnlyPathCount,
    postApprovalPathsHumanOnly: true,
    ...(postApprovalFingerprintRequirement
      ? {
          postApprovalFingerprintRequirement,
        }
      : {}),
    ...(postApprovalPathGuidance.length ? { postApprovalPathGuidance } : {}),
    ...(postApprovalPathMonetizationBoundaries.length
      ? { postApprovalPathMonetizationBoundaries }
      : {}),
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    safety: {
      humanOnly: safety?.humanOnly === true || humanOnly.length > 0 || humanOnlyPathCount > 0,
      readOnly: safety?.readOnly !== false,
      commandBoundaryOnly: safety?.commandBoundaryOnly !== false,
      postApprovalPathsHumanOnly: true,
      humanOnlyExecutionScope:
        cleanString(safety?.humanOnlyExecutionScope) ||
        'dashboard_or_cli_after_explicit_human_consent',
      postApprovalRunbookExecutionAllowedInMcp: false,
      protectedActionsExecutableByAgent: false,
      protectedActionsExecutableByMcp: false,
      mutatesReviewData: safety?.mutatesReviewData === true,
      mutatesAppStoreConnect: safety?.mutatesAppStoreConnect === true,
      requiresHostedAi: safety?.requiresHostedAi === true,
      requiresAppStoreConnectCredentials: safety?.requiresAppStoreConnectCredentials === true,
      ...(typeof safety?.proposalSubmissionOnly === 'boolean'
        ? { proposalSubmissionOnly: safety.proposalSubmissionOnly }
        : {}),
      ...(typeof safety?.protectedActionsAllowed === 'boolean'
        ? { protectedActionsAllowed: safety.protectedActionsAllowed }
        : {}),
      ...(typeof safety?.approvalAllowed === 'boolean' ? { approvalAllowed: safety.approvalAllowed } : {}),
      ...(typeof safety?.rejectionAllowed === 'boolean' ? { rejectionAllowed: safety.rejectionAllowed } : {}),
      ...(typeof safety?.figmaApplyAllowed === 'boolean' ? { figmaApplyAllowed: safety.figmaApplyAllowed } : {}),
      ...(typeof safety?.metadataApplyAllowed === 'boolean'
        ? { metadataApplyAllowed: safety.metadataApplyAllowed }
        : {}),
      ...(typeof safety?.metadataExportAllowed === 'boolean'
        ? { metadataExportAllowed: safety.metadataExportAllowed }
        : {}),
      ...(typeof safety?.metadataPublishAllowed === 'boolean'
        ? { metadataPublishAllowed: safety.metadataPublishAllowed }
        : {}),
      ...(typeof safety?.keywordApplyAllowed === 'boolean'
        ? { keywordApplyAllowed: safety.keywordApplyAllowed }
        : {}),
      ...(typeof safety?.pricingScheduleAllowed === 'boolean'
        ? { pricingScheduleAllowed: safety.pricingScheduleAllowed }
        : {}),
      ...(typeof safety?.pricingExportAllowed === 'boolean'
        ? { pricingExportAllowed: safety.pricingExportAllowed }
        : {}),
      ...(typeof safety?.pricingPublishAllowed === 'boolean'
        ? { pricingPublishAllowed: safety.pricingPublishAllowed }
        : {}),
      ...(typeof safety?.screenshotUploadAllowed === 'boolean'
        ? { screenshotUploadAllowed: safety.screenshotUploadAllowed }
        : {}),
      ...(typeof safety?.screenshotPublishAllowed === 'boolean'
        ? { screenshotPublishAllowed: safety.screenshotPublishAllowed }
        : {}),
      ...(typeof safety?.appStoreUploadAllowed === 'boolean'
        ? { appStoreUploadAllowed: safety.appStoreUploadAllowed }
        : {}),
      ...(typeof safety?.appStoreSubmitAllowed === 'boolean'
        ? { appStoreSubmitAllowed: safety.appStoreSubmitAllowed }
        : {}),
      ...(typeof safety?.localAscHandoffAllowed === 'boolean'
        ? { localAscHandoffAllowed: safety.localAscHandoffAllowed }
        : {}),
      ...(typeof safety?.hostedAppStoreSubmitAllowed === 'boolean'
        ? { hostedAppStoreSubmitAllowed: safety.hostedAppStoreSubmitAllowed }
        : {}),
      ...(typeof safety?.appStorePublishAllowed === 'boolean'
        ? { appStorePublishAllowed: safety.appStorePublishAllowed }
        : {}),
      ...(typeof safety?.statusUpdateAllowed === 'boolean'
        ? { statusUpdateAllowed: safety.statusUpdateAllowed }
        : {}),
      ...(typeof safety?.postApprovalActionAllowed === 'boolean'
        ? { postApprovalActionAllowed: safety.postApprovalActionAllowed }
        : {}),
      ...(typeof safety?.humanApprovalConsentGranted === 'boolean'
        ? { humanApprovalConsentGranted: safety.humanApprovalConsentGranted }
        : {}),
      ...(typeof safety?.humanRejectionConsentGranted === 'boolean'
        ? { humanRejectionConsentGranted: safety.humanRejectionConsentGranted }
        : {}),
      ...(typeof safety?.humanPostApprovalConsentGranted === 'boolean'
        ? { humanPostApprovalConsentGranted: safety.humanPostApprovalConsentGranted }
        : {}),
      ...(typeof safety?.applyPlanFingerprintRequiredForPostApproval === 'boolean'
        ? {
            applyPlanFingerprintRequiredForPostApproval:
              safety.applyPlanFingerprintRequiredForPostApproval,
          }
        : {}),
      ...(cleanString(safety?.applyPlanFingerprintFlag)
        ? { applyPlanFingerprintFlag: cleanString(safety.applyPlanFingerprintFlag) }
        : {}),
      ...(cleanString(safety?.applyPlanFingerprintGuidance)
        ? { applyPlanFingerprintGuidance: cleanString(safety.applyPlanFingerprintGuidance) }
        : {}),
      usesHumanFinalValues: safety?.usesHumanFinalValues === true,
      valueSource: cleanString(safety?.valueSource),
      approvedHumanDecisionSource: cleanString(safety?.valueSource) === 'approved_human_decisions',
      protectedActionBoundary: cleanString(safety?.protectedActionBoundary),
      protectedActions: Array.isArray(safety?.protectedActions)
        ? safety.protectedActions.map(cleanString).filter(Boolean)
        : [],
      agentInstruction: cleanString(safety?.agentInstruction),
    },
    guardrails: Array.isArray(commandSummary?.guardrails)
      ? commandSummary.guardrails.map(cleanString).filter(Boolean)
      : [],
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

function sanitizePostApprovalFingerprintRequirement(value) {
  const requirement = asPlainObject(value);
  if (!requirement) return null;
  const sourceCommand = cleanString(requirement.sourceCommand);
  const flag = cleanString(requirement.flag);
  if (!sourceCommand || flag !== '--expected-apply-plan-fingerprint') return null;
  return {
    required: requirement.required === true,
    source: cleanString(requirement.source),
    sourceCommand,
    flag,
    protectedCommandsPreferred: requirement.protectedCommandsPreferred === true,
    includedInCommands: requirement.includedInCommands === true,
    applyPlanFingerprint: cleanString(requirement.applyPlanFingerprint) || undefined,
    note: cleanString(requirement.note),
  };
}

function mcpSafetyWithHandoffSummary(safety, handoffSummary) {
  if (!handoffSummary) return safety;
  const requirement = handoffSummary?.postApprovalFingerprintRequirement;
  const hasPostApprovalPaths =
    typeof handoffSummary.postApprovalPathCount === 'number' && handoffSummary.postApprovalPathCount > 0;
  const requiresPostApprovalFingerprint = requirement?.required === true || hasPostApprovalPaths;
  return {
    ...safety,
    handoffSummaryScope: 'read_only_human_handoff_boundary',
    postApprovalRunbookExecutionAllowedInMcp: false,
    protectedActionsExecutableByAgent: false,
    protectedActionsExecutableByMcp: false,
    humanOnlyExecutionScope: 'dashboard_or_cli_after_explicit_human_consent',
    ...(requiresPostApprovalFingerprint
      ? {
          postApprovalFingerprintRequired: true,
          postApprovalCommandsRequireApplyPlanFingerprint: true,
          postApprovalFingerprintFlag:
            requirement?.flag || safety?.applyPlanFingerprintFlag || '--expected-apply-plan-fingerprint',
        }
      : {}),
    ...(requirement
      ? {
          postApprovalFingerprintRequirement: requirement,
          postApprovalFingerprintIncludedInCommands: requirement.includedInCommands === true,
          postApprovalFingerprintSource: requirement.source,
        }
      : {}),
  };
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function browserOpenMeta(response) {
  const root = asPlainObject(response);
  const browserOpen = asPlainObject(root?.browserOpen);
  if (!browserOpen) return undefined;
  const reviewUrl = normalizeReviewUrlForLocalDashboard(cleanString(browserOpen.reviewUrl));
  return {
    requested: browserOpen.requested === true,
    opened: browserOpen.opened === true,
    disabled: browserOpen.disabled === true,
    authenticatedDashboardLink: browserOpen.authenticatedDashboardLink === true,
    ...(reviewUrl ? { reviewUrl } : {}),
    ...(reviewUrl ? localDashboardReviewInfo(reviewUrl) : {}),
  };
}

function reviewAuthMeta(response) {
  const root = asPlainObject(response);
  const reviewAuth = asPlainObject(root?.reviewAuth);
  if (!reviewAuth) return undefined;
  const reviewUrl = normalizeReviewUrlForLocalDashboard(cleanString(reviewAuth.reviewUrl));
  const guidance = cleanString(reviewAuth.guidance);
  return {
    kind: cleanString(reviewAuth.kind) || 'localizeaso_review_auth_handoff',
    mode: cleanString(reviewAuth.mode) || 'review_url_only',
    authenticatedDashboardLink: reviewAuth.authenticatedDashboardLink === true,
    dashboardSessionMayBeRequired: reviewAuth.dashboardSessionMayBeRequired !== false,
    tokenAvailable: reviewAuth.tokenAvailable === true,
    authLinkEnabled: reviewAuth.authLinkEnabled !== false,
    browserOpeningDisabled: reviewAuth.browserOpeningDisabled === true,
    ...(reviewUrl ? { reviewUrl } : {}),
    ...(reviewUrl ? localDashboardReviewInfo(reviewUrl) : {}),
    ...(guidance ? { guidance } : {}),
  };
}

function csvDiscoveryFromResponse(response) {
  const root = asPlainObject(response);
  if (!root) return undefined;

  const candidates = [
    root.discovery,
    root.keywordCsvDiscovery,
    asPlainObject(root.summary)?.discovery,
    asPlainObject(root.keywordImport)?.discovery,
    asPlainObject(root.keywordContext)?.discovery,
    asPlainObject(asPlainObject(root.keywordContext)?.summary)?.discovery,
    asPlainObject(root.keywordContextUpdate)?.discovery,
    asPlainObject(asPlainObject(root.keywordContextUpdate)?.summary)?.discovery,
  ];

  const discoveries = candidates
    .map(asPlainObject)
    .filter(Boolean)
    .map((discovery) => ({
      root: cleanString(discovery.root),
      selectedPath: cleanString(discovery.selectedPath) || null,
      candidateCount: typeof discovery.candidateCount === 'number' ? discovery.candidateCount : 0,
      topCandidates: Array.isArray(discovery.topCandidates) ? discovery.topCandidates : [],
    }));

  if (!discoveries.length) return undefined;

  return {
    found: discoveries.some((discovery) => Boolean(discovery.selectedPath)),
    discoveries,
  };
}

function refineNextAgentRunMeta(toolName, response) {
  if (!toolName.endsWith('_refine_request')) return undefined;
  const root = asPlainObject(response);
  const run = asPlainObject(root?.nextAgentRun);
  if (!run) return undefined;

  const safety = asPlainObject(run.handoffSafety);
  const feedbackRequest = asPlainObject(run.feedbackRequest);
  const reviewSignalContract = normalizeMcpReviewSignalContract(run.reviewSignalContract);
  const contextSnapshot = cleanString(feedbackRequest?.contextSnapshot);
  const commandKeys = [
    'exportPrompt',
    'prompt',
    'keywordAutomation',
    'keywordBrief',
    'keywordPrompt',
    'importAstroCsvToAsoKeywords',
    'syncKeywords',
    'pricingBrief',
    'handoffSummary',
    'fetchBundle',
    'bundle',
    'proposalTemplate',
    'submitProposal',
    'submit',
    'openReview',
  ];
  const commands = Object.fromEntries(
    commandKeys
      .map((key) => [key, cleanString(run[key])])
      .filter(([, value]) => Boolean(value)),
  );
  const mcpCommands = {
    bridge: cleanString(run.mcpBridge),
    proposalTemplate: cleanString(run.mcpProposalTemplate),
    submitProposal: cleanString(run.mcpSubmitProposal),
    submit: cleanString(run.mcpSubmit),
  };
  const populatedMcpCommands = Object.fromEntries(
    Object.entries(mcpCommands).filter(([, value]) => Boolean(value)),
  );
  const contextChecklist = refineNextAgentRunContextChecklist(run.contextChecklist);

  return {
    kind: 'localizeaso_refine_next_agent_run',
    phase: cleanString(safety?.phase) || 'reviewer_feedback_agent_revision',
    reason: cleanString(run.reason) || 'reviewer_feedback',
    surface: cleanString(run.surface),
    agentSafe: safety?.agentSafe !== false,
    humanOnly: safety?.humanOnly === true,
    requiresLocalizeAsoPass: safety?.requiresLocalizeAsoPass === true,
    requiredLocalizeAsoCapabilities: sanitizeStringList(safety?.requiredLocalizeAsoCapabilities),
    requiresHostedAi: safety?.requiresHostedAi === true,
    requiresAppStoreConnectCredentials: safety?.requiresAppStoreConnectCredentials === true,
    mutatesReviewData: safety?.mutatesReviewData === true,
    mutatesAppStoreConnect: safety?.mutatesAppStoreConnect === true,
    proposalSubmissionOnly: safety?.proposalSubmissionOnly !== false,
    protectedActionsAllowed: safety?.protectedActionsAllowed === true,
    protectedActionsExecutableByAgent: false,
    protectedActionsExecutableByMcp: false,
    postApprovalRunbookExecutionAllowedInMcp: false,
    approvalAllowed: safety?.approvalAllowed === true,
    rejectionAllowed: safety?.rejectionAllowed === true,
    figmaApplyAllowed: safety?.figmaApplyAllowed === true,
    metadataApplyAllowed: safety?.metadataApplyAllowed === true,
    metadataExportAllowed: safety?.metadataExportAllowed === true,
    metadataPublishAllowed: safety?.metadataPublishAllowed === true,
    keywordApplyAllowed: safety?.keywordApplyAllowed === true,
    pricingExportAllowed: safety?.pricingExportAllowed === true,
    pricingScheduleAllowed: safety?.pricingScheduleAllowed === true,
    pricingPublishAllowed: safety?.pricingPublishAllowed === true,
    screenshotUploadAllowed: safety?.screenshotUploadAllowed === true,
    screenshotPublishAllowed: safety?.screenshotPublishAllowed === true,
    appStoreUploadAllowed: safety?.appStoreUploadAllowed === true,
    appStoreSubmitAllowed: safety?.appStoreSubmitAllowed === true,
    localAscHandoffAllowed: safety?.localAscHandoffAllowed === true,
    hostedAppStoreSubmitAllowed: safety?.hostedAppStoreSubmitAllowed === true,
    appStorePublishAllowed: safety?.appStorePublishAllowed === true,
    statusUpdateAllowed: safety?.statusUpdateAllowed === true,
    postApprovalActionAllowed: safety?.postApprovalActionAllowed === true,
    humanApprovalConsentGranted: safety?.humanApprovalConsentGranted === true,
    humanRejectionConsentGranted: safety?.humanRejectionConsentGranted === true,
    humanPostApprovalConsentGranted: safety?.humanPostApprovalConsentGranted === true,
    protectedActions: sanitizeStringList(safety?.protectedActions),
    commands,
    ...(Object.keys(populatedMcpCommands).length ? { mcpCommands: populatedMcpCommands } : {}),
    ...(reviewSignalContract ? { reviewSignalContract } : {}),
    contextChecklist,
    notes: sanitizeStringList(run.notes),
    feedbackRequest: feedbackRequest
      ? {
          index: typeof feedbackRequest.index === 'number' ? feedbackRequest.index : undefined,
          instructions: cleanString(feedbackRequest.instructions),
          proposalId: cleanString(feedbackRequest.proposalId) || null,
          scope: sanitizeStringList(feedbackRequest.scope),
          contextSnapshotIncluded: Boolean(contextSnapshot),
          contextSnapshotLength: contextSnapshot.length,
        }
      : undefined,
    handoffSafety: safety
      ? {
          agentSafe: safety.agentSafe === true,
          humanOnly: safety.humanOnly === true,
          requiresLocalizeAsoPass: safety.requiresLocalizeAsoPass === true,
          requiredLocalizeAsoCapabilities: sanitizeStringList(safety.requiredLocalizeAsoCapabilities),
          requiresHostedAi: safety.requiresHostedAi === true,
          requiresAppStoreConnectCredentials: safety.requiresAppStoreConnectCredentials === true,
          mutatesReviewData: safety.mutatesReviewData === true,
          mutatesAppStoreConnect: safety.mutatesAppStoreConnect === true,
          proposalSubmissionOnly: safety.proposalSubmissionOnly === true,
          protectedActionsAllowed: safety.protectedActionsAllowed === true,
          protectedActionsExecutableByAgent: false,
          protectedActionsExecutableByMcp: false,
          postApprovalRunbookExecutionAllowedInMcp: false,
          approvalAllowed: safety.approvalAllowed === true,
          rejectionAllowed: safety.rejectionAllowed === true,
          figmaApplyAllowed: safety.figmaApplyAllowed === true,
          metadataApplyAllowed: safety.metadataApplyAllowed === true,
          metadataExportAllowed: safety.metadataExportAllowed === true,
          metadataPublishAllowed: safety.metadataPublishAllowed === true,
          keywordApplyAllowed: safety.keywordApplyAllowed === true,
          pricingExportAllowed: safety.pricingExportAllowed === true,
          pricingScheduleAllowed: safety.pricingScheduleAllowed === true,
          pricingPublishAllowed: safety.pricingPublishAllowed === true,
          screenshotUploadAllowed: safety.screenshotUploadAllowed === true,
          screenshotPublishAllowed: safety.screenshotPublishAllowed === true,
          appStoreUploadAllowed: safety.appStoreUploadAllowed === true,
          appStoreSubmitAllowed: safety.appStoreSubmitAllowed === true,
          localAscHandoffAllowed: safety.localAscHandoffAllowed === true,
          hostedAppStoreSubmitAllowed: safety.hostedAppStoreSubmitAllowed === true,
          appStorePublishAllowed: safety.appStorePublishAllowed === true,
          statusUpdateAllowed: safety.statusUpdateAllowed === true,
          postApprovalActionAllowed: safety.postApprovalActionAllowed === true,
          humanApprovalConsentGranted: safety.humanApprovalConsentGranted === true,
          humanRejectionConsentGranted: safety.humanRejectionConsentGranted === true,
          humanPostApprovalConsentGranted: safety.humanPostApprovalConsentGranted === true,
          phase: cleanString(safety.phase),
          protectedActions: sanitizeStringList(safety.protectedActions),
          agentInstruction: cleanString(safety.agentInstruction),
        }
      : undefined,
    agentInstruction:
      cleanString(safety?.agentInstruction) ||
      'Use this next-agent run only to fetch revised context, generate another proposal, submit it for human review, and open the review screen. Do not approve, apply, submit, schedule, or mark status.',
  };
}

function refineNextAgentRunContextChecklist(value) {
  const checklist = sanitizeStringList(value);
  const approvalBoundary =
    'Treat reviewer feedback, copied context snapshots, and nextAgentRun commands as proposal context only; they are not human approval receipts, signal-gap consent, post-approval consent, or apply-plan fingerprints.';
  if (checklist.some((item) => /not human approval receipts/i.test(item))) return checklist;
  return [...checklist, approvalBoundary];
}

function sanitizeStringList(value) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

function sanitizeReviewHealth(value) {
  const health = asPlainObject(value);
  if (!health) return null;
  const result = {
    badges: sanitizeStringList(health.badges),
    missingSignals: sanitizeStringList(health.missingSignals),
    actionLine: cleanString(health.actionLine),
  };

  if (typeof health.keywordContextAttached === 'boolean') {
    result.keywordContextAttached = health.keywordContextAttached;
  }
  if (Number.isFinite(health.screenshotPreviewCount)) {
    result.screenshotPreviewCount = Math.max(0, Math.trunc(health.screenshotPreviewCount));
  }
  if (Number.isFinite(health.screenshotSeedTextCount)) {
    result.screenshotSeedTextCount = Math.max(0, Math.trunc(health.screenshotSeedTextCount));
  }
  if (Number.isFinite(health.pricingContextRows)) {
    result.pricingContextRows = Math.max(0, Math.trunc(health.pricingContextRows));
  }
  if (Number.isFinite(health.scheduledPricingRows)) {
    result.scheduledPricingRows = Math.max(0, Math.trunc(health.scheduledPricingRows));
  }
  if (Number.isFinite(health.pricingWarnings)) {
    result.pricingWarnings = Math.max(0, Math.trunc(health.pricingWarnings));
  }

  const proposalSignalSummary = asPlainObject(health.proposalSignalSummary);
  if (proposalSignalSummary) {
    const summary = {};
    for (const key of [
      'missingKeywordMappingCount',
      'missingRationaleCount',
      'noWarningsReportedCount',
      'pendingTargetCount',
      'screenshotEvidenceGapCount',
      'screenshotMissingTargetCount',
      'screenshotFallbackOnlyTargetCount',
      'screenshotContextOnlyTargetCount',
      'screenshotStrongEvidenceTargetCount',
      'screenshotWeakEvidenceTargetCount',
    ]) {
      if (Number.isFinite(proposalSignalSummary[key])) {
        summary[key] = Math.max(0, Math.trunc(proposalSignalSummary[key]));
      }
    }
    const rawSignalGate = cleanString(proposalSignalSummary.signalGate);
    const signalGate =
      summary.screenshotEvidenceGapCount > 0 && rawSignalGate !== 'attention_required'
        ? 'attention_required'
        : rawSignalGate;
    if (signalGate) summary.signalGate = signalGate;
    if (Object.keys(summary).length) result.proposalSignalSummary = summary;
  }

  return result.badges.length || result.missingSignals.length || result.actionLine ? result : null;
}

function receiptHistoryCount(record, historyKey, currentKey) {
  const countKey = historyKey === 'approvalReceipts' ? 'approvalReceiptCount' : 'postApprovalReceiptCount';
  if (Number.isFinite(record?.[countKey])) return Math.max(0, Math.trunc(record[countKey]));
  const history = Array.isArray(record?.[historyKey]) ? record[historyKey] : [];
  if (history.length) return history.length;
  const currentReceipt = asPlainObject(record?.[currentKey]);
  const approvedProposalId = cleanString(record?.approvedProposalId);
  const receiptProposalId = cleanString(currentReceipt?.proposalId);
  const receiptJobId = cleanString(currentReceipt?.jobId);
  const jobId = cleanString(record?.id);
  const latestProposalVersion = Number.isFinite(record?.latestProposalVersion)
    ? Math.trunc(record.latestProposalVersion)
    : 0;
  const receiptProposalVersion = Number.isFinite(currentReceipt?.proposalVersion)
    ? Math.trunc(currentReceipt.proposalVersion)
    : 0;
  return currentReceipt &&
    approvedProposalId &&
    latestProposalVersion > 0 &&
    receiptProposalVersion > 0 &&
    receiptProposalVersion === latestProposalVersion &&
    receiptProposalId === approvedProposalId &&
    receiptJobId === jobId
    ? 1
    : 0;
}

function receiptCountFromRecord(record, key) {
  return Number.isFinite(record?.[key]) ? Math.max(0, Math.trunc(record[key])) : 0;
}

function receiptHistoryMeta(record) {
  const approvalReceiptCount = receiptHistoryCount(record, 'approvalReceipts', 'approvalReceipt');
  const postApprovalReceiptCount = receiptHistoryCount(
    record,
    'postApprovalReceipts',
    'postApprovalReceipt',
  );
  const activeApprovalReceiptCount = receiptCountFromRecord(record, 'activeApprovalReceiptCount');
  const activePostApprovalReceiptCount = receiptCountFromRecord(record, 'activePostApprovalReceiptCount');
  const inactiveApprovalReceiptCount = receiptCountFromRecord(record, 'inactiveApprovalReceiptCount');
  const inactivePostApprovalReceiptCount = receiptCountFromRecord(record, 'inactivePostApprovalReceiptCount');
  const activePostApprovalEvidenceCount = receiptCountFromRecord(record, 'activePostApprovalEvidenceCount');
  const activePostApprovalEvidenceMissingCount = receiptCountFromRecord(
    record,
    'activePostApprovalEvidenceMissingCount',
  );
  const latestPostApprovalStatus = cleanString(record?.latestPostApprovalStatus);
  const latestPostApprovalRecordedAt = cleanString(record?.latestPostApprovalRecordedAt);
  const postApprovalFingerprintMismatchCount = Number.isFinite(record?.postApprovalFingerprintMismatchCount)
    ? Math.max(0, Math.trunc(record.postApprovalFingerprintMismatchCount))
    : 0;
  const postApprovalFingerprintMissingExpectedCount = Number.isFinite(
    record?.postApprovalFingerprintMissingExpectedCount,
  )
    ? Math.max(0, Math.trunc(record.postApprovalFingerprintMissingExpectedCount))
    : 0;
  const postApprovalFingerprintMissingRecordedCount = Number.isFinite(
    record?.postApprovalFingerprintMissingRecordedCount,
  )
    ? Math.max(0, Math.trunc(record.postApprovalFingerprintMissingRecordedCount))
    : 0;
  return {
    ...(approvalReceiptCount ? { approvalReceiptCount } : {}),
    ...(postApprovalReceiptCount ? { postApprovalReceiptCount } : {}),
    ...(activeApprovalReceiptCount ? { activeApprovalReceiptCount } : {}),
    ...(activePostApprovalReceiptCount ? { activePostApprovalReceiptCount } : {}),
    ...(inactiveApprovalReceiptCount ? { inactiveApprovalReceiptCount } : {}),
    ...(inactivePostApprovalReceiptCount ? { inactivePostApprovalReceiptCount } : {}),
    ...(activePostApprovalEvidenceCount ? { activePostApprovalEvidenceCount } : {}),
    ...(activePostApprovalEvidenceMissingCount ? { activePostApprovalEvidenceMissingCount } : {}),
    ...(latestPostApprovalStatus ? { latestPostApprovalStatus } : {}),
    ...(latestPostApprovalRecordedAt ? { latestPostApprovalRecordedAt } : {}),
    ...(postApprovalFingerprintMismatchCount ? { postApprovalFingerprintMismatchCount } : {}),
    ...(postApprovalFingerprintMissingExpectedCount
      ? { postApprovalFingerprintMissingExpectedCount }
      : {}),
    ...(postApprovalFingerprintMissingRecordedCount
      ? { postApprovalFingerprintMissingRecordedCount }
      : {}),
  };
}

function reviewQueueHealthMeta(toolName, response) {
  if (
    ![
      'localizeaso_review_jobs',
      'localizeaso_screenshot_jobs',
      'localizeaso_field_jobs',
      'localizeaso_metadata_jobs',
      'localizeaso_keywords_jobs',
      'localizeaso_pricing_jobs',
    ].includes(toolName)
  ) {
    return undefined;
  }

  const root = asPlainObject(response);
  if (!root) return undefined;
  const nextJob = asPlainObject(root.nextJob);
  const nextJobHealth = sanitizeReviewHealth(nextJob?.reviewHealth);
  const jobs = Array.isArray(root.jobs) ? root.jobs : [];
  const jobsWithHealth = jobs
    .map((job) => {
      const record = asPlainObject(job);
      const health = sanitizeReviewHealth(record?.reviewHealth);
      const id = cleanString(record?.id);
      if (!record || !id || !health) return null;
      return {
        id,
        kind: cleanString(record.kind),
        surface: cleanString(record.surface),
        status: cleanString(record.status),
        reviewHealth: health,
        ...receiptHistoryMeta(record),
      };
    })
    .filter(Boolean);

  if (!nextJobHealth && !jobsWithHealth.length) return undefined;
  return {
    ...(nextJob && nextJobHealth
      ? {
          nextJob: {
            id: cleanString(nextJob.id),
            kind: cleanString(nextJob.kind),
            surface: cleanString(nextJob.surface),
            status: cleanString(nextJob.status),
            reviewHealth: nextJobHealth,
            ...receiptHistoryMeta(nextJob),
          },
        }
      : {}),
    jobsWithHealth,
  };
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message, data = undefined) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

async function handleRequest(message) {
  const { id, method, params } = message;
  try {
    if (method === 'initialize') {
      result(id, {
        protocolVersion: params?.protocolVersion ?? protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'localizeaso-review', version: '0.1.0' },
      });
      return;
    }

    if (method === 'ping') {
      result(id, {});
      return;
    }

    if (method === 'tools/list') {
      result(id, { tools });
      return;
    }

    if (method === 'tools/call') {
      const toolName = asString(params?.name, 'params.name');
      const toolInput = params?.arguments ?? {};
      const toolArgs = argsForTool(toolName, toolInput);
      const run = await runTool(toolName, toolArgs);
      const rawResponse = responseFromRun(run, toolInput);
      const normalizedResponse = normalizeReviewUrlsForLocalDashboard(rawResponse);
      const response = toolName === 'localizeaso_monetization_boundary'
        ? mergeMcpMonetizationBoundary(toolName, normalizedResponse, toolInput)
        : normalizedResponse;
      const postProposalHumanReview = postProposalHumanReviewMeta(toolName, response);
      const readinessInspection = readinessInspectionMeta(toolName, response);
      const readinessReviewGate = readinessReviewGateMeta(toolName, response);
      const backendError = backendErrorMeta(response);
      const csvDiscovery = csvDiscoveryFromResponse(response);
      const refineNextAgentRun = refineNextAgentRunMeta(toolName, response);
      const handoffSummary = handoffSummaryMeta(toolName, response);
      const reviewQueueHealth = reviewQueueHealthMeta(toolName, response);
      const browserOpen = browserOpenMeta(response);
      const reviewAuth = reviewAuthMeta(response);
      const mcpSafety = mcpSafetyWithHandoffSummary(
        mergeMcpSafetyWithResponseConsent(
          mcpSafetyForTool(toolName, toolInput, toolArgs),
          response,
        ),
        handoffSummary,
      );
      const mcpSafetyWithBrowserOpen = browserOpen
        ? { ...mcpSafety, browserOpen }
        : mcpSafety;
      const mcpSafetyWithReviewAuth = reviewAuth
        ? { ...mcpSafetyWithBrowserOpen, reviewAuth }
        : mcpSafetyWithBrowserOpen;
      result(id, {
        isError: run.code !== 0,
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
        _meta: {
          localizeaso: {
            mcpSafety: mcpSafetyWithReviewAuth,
            monetizationBoundary: mcpMonetizationBoundary(toolName, toolInput),
            ...(reviewSignalContractForTool(toolName)
              ? { reviewSignalContract: reviewSignalContractForTool(toolName) }
              : {}),
            ...(responseReviewConsentMeta(response) ? { reviewConsent: mcpSafety.reviewConsent } : {}),
            ...(postProposalHumanReview ? { postProposalHumanReview } : {}),
            ...(readinessInspection ? { readinessInspection } : {}),
            ...(readinessReviewGate ? { readinessReviewGate } : {}),
            ...(backendError ? { backendError } : {}),
            ...(csvDiscovery ? { csvDiscovery } : {}),
            ...(refineNextAgentRun ? { refineNextAgentRun } : {}),
            ...(handoffSummary ? { handoffSummary } : {}),
            ...(reviewQueueHealth ? { reviewQueueHealth } : {}),
            ...(browserOpen ? { browserOpen } : {}),
            ...(reviewAuth ? { reviewAuth } : {}),
          },
        },
      });
      return;
    }

    error(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    error(
      id,
      -32602,
      err instanceof Error ? err.message : String(err),
      err && typeof err === 'object' && 'data' in err ? err.data : undefined,
    );
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    error(null, -32700, 'Parse error');
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return;
  void handleRequest(message);
});
