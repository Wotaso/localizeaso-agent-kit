#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ensureSharedBuild } from './ensure-shared-build.mjs';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8089/mcp';
const DEFAULT_DEVELOPER = 'Wotaso GmbH';
const DEFAULT_OUT_DIR = 'exports/astro-mcp';
const DEFAULT_TIMEOUT_MS = 120_000;

let buildLocalizeAsoMonetizationBoundary = null;
let localizeAsoPostApprovalProtectedActionBoundary = '';

function printHelpAndExit(exitCode, reason = '') {
  if (reason) process.stderr.write(`${reason}\n\n`);
  process.stdout.write(`Export Astro MCP Apps ZIP

Read-only export of own tracked Astro ASO data into a ZIP. Data is fetched from
Astro MCP tools, not from App Store Connect. ASC is only used as an optional
app-id allowlist filter so competitor apps tracked in Astro are excluded.

Usage:
  node scripts/export-astro-mcp-apps.mjs [options]

Options:
  --endpoint <url>          Astro MCP endpoint (default: ASTRO_MCP_URL or ${DEFAULT_ENDPOINT})
  --app <id>                Export only this App Store app ID. Can be repeated or comma-separated.
  --developer <name>        Own developer filter (default: ${DEFAULT_DEVELOPER})
  --all-tracked             Export every Astro-tracked app. Disables developer and ASC filtering.
  --no-asc-allowlist        Do not intersect selected apps with local "asc apps list" IDs.
  --store <code>            Limit exported stores. Can be repeated or comma-separated.
  --out-dir <dir>           Working export directory (default: ${DEFAULT_OUT_DIR}/<timestamp>)
  --zip <file>              ZIP output path (default: <out-dir>.zip)
  --keyword-context-out <file>
                           Also write provider-neutral LocalizeASO keyword-context JSON.
  --keep-dir                Keep the unpacked working directory after ZIP creation.
  --skip-ranking-history    Skip per-keyword search_rankings history exports.
  --history-period <period> Ranking history period: week, month, year, all (default: all)
  --max-ranking-history <n> Limit ranking-history calls, useful for smoke tests.
  --include-suggestions     Export get_keyword_suggestions per app/store.
  --include-competitors     Export extract_competitors_keywords per keyword/store.
  --timeout-ms <n>          Per HTTP/tool/zip timeout (default: ${DEFAULT_TIMEOUT_MS})
  --pretty                  Pretty-print JSON files.
  --dry-run                 Discover/filter apps and print the export plan only.
  --help, -h                Show this help.

Examples:
  pnpm astro:mcp:export
  pnpm astro:mcp:export -- --app 6755280377 --zip ./exports/camera-roll-astro.zip
  pnpm astro:mcp:export -- --app 6755280377 --keyword-context-out ./keyword-context.json
  pnpm astro:mcp:export -- --skip-ranking-history --keep-dir
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    endpoint: process.env.ASTRO_MCP_URL || '',
    appIds: [],
    developer: process.env.ASTRO_MCP_EXPORT_DEVELOPER || DEFAULT_DEVELOPER,
    allTracked: false,
    ascAllowlist: !['0', 'false', 'no'].includes(String(process.env.ASTRO_MCP_ASC_ALLOWLIST || '').toLowerCase()),
    stores: [],
    outDir: '',
    zipPath: '',
    keywordContextOut: '',
    keepDir: false,
    includeRankingHistory: true,
    historyPeriod: 'all',
    maxRankingHistory: 0,
    includeSuggestions: false,
    includeCompetitors: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pretty: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--') {
      continue;
    } else if (token === '--endpoint') {
      args.endpoint = requiredNext(token, next);
      index += 1;
    } else if (token === '--app') {
      args.appIds.push(...splitList(requiredNext(token, next)));
      index += 1;
    } else if (token === '--developer') {
      args.developer = requiredNext(token, next);
      index += 1;
    } else if (token === '--all-tracked') {
      args.allTracked = true;
    } else if (token === '--no-asc-allowlist') {
      args.ascAllowlist = false;
    } else if (token === '--store') {
      args.stores.push(...splitList(requiredNext(token, next)).map((store) => store.toLowerCase()));
      index += 1;
    } else if (token === '--out-dir') {
      args.outDir = requiredNext(token, next);
      index += 1;
    } else if (token === '--zip') {
      args.zipPath = requiredNext(token, next);
      index += 1;
    } else if (token === '--keyword-context-out') {
      args.keywordContextOut = requiredNext(token, next);
      index += 1;
    } else if (token === '--keep-dir') {
      args.keepDir = true;
    } else if (token === '--skip-ranking-history') {
      args.includeRankingHistory = false;
    } else if (token === '--history-period') {
      args.historyPeriod = requiredNext(token, next);
      if (!['week', 'month', 'year', 'all'].includes(args.historyPeriod)) {
        printHelpAndExit(1, `Invalid --history-period: ${args.historyPeriod}`);
      }
      index += 1;
    } else if (token === '--max-ranking-history') {
      args.maxRankingHistory = positiveInteger(token, next, true);
      index += 1;
    } else if (token === '--include-suggestions') {
      args.includeSuggestions = true;
    } else if (token === '--include-competitors') {
      args.includeCompetitors = true;
    } else if (token === '--timeout-ms') {
      args.timeoutMs = positiveInteger(token, next, false);
      if (args.timeoutMs < 1000) printHelpAndExit(1, '--timeout-ms must be >= 1000.');
      index += 1;
    } else if (token === '--pretty') {
      args.pretty = true;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--help' || token === '-h') {
      printHelpAndExit(0);
    } else {
      printHelpAndExit(1, `Unknown argument: ${token}`);
    }
  }

  args.endpoint = args.endpoint || readAstroEndpointFromCodexConfig() || DEFAULT_ENDPOINT;
  args.appIds = [...new Set(args.appIds.map((value) => value.trim()).filter(Boolean))];
  args.stores = [...new Set(args.stores.map((value) => value.trim().toLowerCase()).filter(Boolean))];

  const timestamp = timestampForPath(new Date());
  if (!args.outDir) args.outDir = path.join(DEFAULT_OUT_DIR, timestamp);
  if (!args.zipPath) args.zipPath = `${args.outDir.replace(/\/+$/, '')}.zip`;
  if (args.allTracked) args.ascAllowlist = false;
  return args;
}

function requiredNext(flag, value) {
  if (!value) printHelpAndExit(1, `Missing value for ${flag}.`);
  return String(value);
}

function positiveInteger(flag, value, allowZero) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : 1)) {
    printHelpAndExit(1, `Invalid value for ${flag}: ${String(value || '')}`);
  }
  return parsed;
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readAstroEndpointFromCodexConfig() {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const text = requireTextSync(configPath);
    const match = text.match(/\[mcp_servers\.astro_aso_tool\][\s\S]*?^\s*url\s*=\s*"([^"]+)"/m);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

function requireTextSync(file) {
  return String(readFileSync(file, 'utf8'));
}

function timestampForPath(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:]/g, '').replace('T', '-');
}

function safePathPart(value, fallback = 'unknown') {
  const cleaned = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return cleaned || fallback;
}

function jsonStringify(value, pretty = false) {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(file, value, pretty = false) {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${jsonStringify(value, pretty)}\n`, 'utf8');
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstCleanString(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function optionalNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .trim()
    .replace(/[%\s]/g, '')
    .replace(/^[^\d+-.]+/, '')
    .replace(/[^\d,.-]+$/, '');
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(',') && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'preferred', 'favorite', 'favourite'].includes(cleaned)) return true;
  if (['false', '0', 'no', 'n'].includes(cleaned)) return false;
  return undefined;
}

function extractAstroKeywordRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['keywords', 'rows', 'data', 'items', 'results']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function keywordTextFromAstroRow(row) {
  if (!row || typeof row !== 'object') return '';
  return firstCleanString(row.keyword, row.keywords, row.term, row.searchTerm, row.query, row.phrase, row.name);
}

function storeTextFromAstroRow(row) {
  if (!row || typeof row !== 'object') return '';
  return firstCleanString(
    row.locale,
    row.storeLocale,
    row.store,
    row.country,
    row.market,
    row.territory,
    row.storefront,
    row.language,
  );
}

function appFallbackLocale(app, resolveStoreLocale) {
  const stores = appStores(app, []);
  if (stores.length !== 1) return '';
  return resolveStoreLocale(stores[0]) || '';
}

function normalizeAstroKeywordsForLocalizeAso(app, keywordResponse, resolveStoreLocale) {
  const rows = [];
  const warnings = [];
  const seen = new Set();
  const fallbackLocale = appFallbackLocale(app, resolveStoreLocale);

  for (const [index, row] of extractAstroKeywordRows(keywordResponse).entries()) {
    const keyword = keywordTextFromAstroRow(row);
    if (!keyword) {
      warnings.push({
        kind: 'missing_keyword',
        appId: cleanString(app?.appId),
        rowNumber: index + 1,
      });
      continue;
    }

    const storeRaw = storeTextFromAstroRow(row);
    const locale = resolveStoreLocale(storeRaw) || fallbackLocale || '*';
    const key = `${cleanString(app?.appId)}|${locale}|${keyword.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const popularity = optionalNumber(row?.popularity ?? row?.popularityScore ?? row?.searchVolume ?? row?.volume ?? row?.score);
    const difficulty = optionalNumber(row?.difficulty ?? row?.competition ?? row?.hardness ?? row?.kd);
    const isPreferred = optionalBoolean(row?.isPreferred ?? row?.preferred ?? row?.favorite ?? row?.favourite);

    rows.push({
      locale,
      keyword,
      ...(popularity !== undefined ? { popularity } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
      ...(isPreferred !== undefined ? { isPreferred } : {}),
      source: 'astro-mcp',
      appId: cleanString(app?.appId),
      ...(cleanString(app?.name) ? { appName: cleanString(app.name) } : {}),
      ...(storeRaw ? { sourceStore: storeRaw } : {}),
    });
  }

  return { rows, warnings };
}

function keywordContextReviewSafety() {
  return {
    kind: 'localizeaso_keyword_context_review_safety',
    source: 'astro-mcp',
    agentSafe: true,
    readOnlySourceExport: true,
    attachesReviewKeywordContextOnly: true,
    createsReviewJob: false,
    submitsProposal: false,
    humanReviewRequiredBeforeApproval: true,
    humanApprovalRequiredBeforeProtectedActions: true,
    humanPostApprovalConsentRequired: true,
    approvalAllowedFromAgent: false,
    applyAllowedFromAgent: false,
    statusUpdateAllowedFromAgent: false,
    appStoreConnectMutationAllowed: false,
    protectedActionsRemainHumanOnly: true,
    protectedActionBoundary: localizeAsoPostApprovalProtectedActionBoundary,
    monetizationBoundary:
      typeof buildLocalizeAsoMonetizationBoundary === 'function'
        ? buildLocalizeAsoMonetizationBoundary('workspace', { reviewSurface: 'keywords' })
        : null,
    protectedActions: [
      'approve_review',
      'reject_review',
      'figma_apply',
      'metadata_draft_apply',
      'keyword_apply',
      'pricing_schedule',
      'status_update',
      'app_store_upload',
      'app_store_submit',
      'app_store_publish',
    ],
    agentInstruction:
      'Use this Astro keyword context only as proposal input. Do not approve, reject, apply, schedule pricing, mark status, upload, publish, or submit to App Store Connect from an agent pass.',
  };
}

function buildLocalizeAsoKeywordContext(appKeywordContexts, args, startedAt, keywordContextPath) {
  const rows = [];
  const warnings = [];
  for (const context of appKeywordContexts) {
    rows.push(...context.rows);
    warnings.push(...context.warnings);
  }

  rows.sort((a, b) => {
    const localeCompare = String(a.locale || '').localeCompare(String(b.locale || ''));
    if (localeCompare !== 0) return localeCompare;
    const popularityA = typeof a.popularity === 'number' ? a.popularity : -1;
    const popularityB = typeof b.popularity === 'number' ? b.popularity : -1;
    if (popularityA !== popularityB) return popularityB - popularityA;
    const difficultyA = typeof a.difficulty === 'number' ? a.difficulty : Number.POSITIVE_INFINITY;
    const difficultyB = typeof b.difficulty === 'number' ? b.difficulty : Number.POSITIVE_INFINITY;
    if (difficultyA !== difficultyB) return difficultyA - difficultyB;
    return String(a.keyword || '').localeCompare(String(b.keyword || ''));
  });

  const keywords = {};
  for (const row of rows) {
    const locale = cleanString(row.locale) || '*';
    const keyword = cleanString(row.keyword);
    if (!keyword) continue;
    keywords[locale] ??= [];
    if (!keywords[locale].includes(keyword)) keywords[locale].push(keyword);
  }

  return {
    sources: ['astro-mcp'],
    keywords,
    rows,
    summary: {
      source: 'astro-mcp',
      generatedAt: new Date().toISOString(),
      exportStartedAt: startedAt,
      endpoint: args.endpoint,
      appCount: new Set(rows.map((row) => row.appId).filter(Boolean)).size,
      selectedAppIds: [...new Set(rows.map((row) => row.appId).filter(Boolean))],
      localeCount: Object.keys(keywords).length,
      keywordCount: rows.length,
      warningCount: warnings.length,
      readOnly: true,
      mutatesAstro: false,
      mutatesAppStoreConnect: false,
      mutatesLocalizeAso: false,
      reviewSafety: keywordContextReviewSafety(),
      attachCommands: {
        screenshot: `pnpm review:agent keyword-context SCREENSHOT_JOB_ID --file ${keywordContextPath}`,
        field: `pnpm review:agent field-keyword-context FIELD_JOB_ID --file ${keywordContextPath}`,
      },
    },
    warnings,
  };
}

function extractMcpContent(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return result;
  if (content.length === 1 && content[0]?.type === 'text') return parseMaybeJson(content[0].text);
  return content.map((item) => (item?.type === 'text' ? parseMaybeJson(item.text) : item));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class AstroMcpClient {
  constructor(endpoint, timeoutMs) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.sessionId = '';
  }

  async initialize() {
    const response = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'localizeaso-astro-mcp-export', version: '0.1.0' },
    }, false);
    this.sessionId = response.sessionId || '';
    return response.body.result;
  }

  async listTools() {
    return (await this.request('tools/list', {})).body.result?.tools || [];
  }

  async callTool(name, input = {}) {
    const response = await this.request('tools/call', { name, arguments: input });
    if (response.body.error) {
      throw new Error(`${name}: ${response.body.error.message || JSON.stringify(response.body.error)}`);
    }
    if (response.body.result?.isError) {
      throw new Error(`${name}: ${JSON.stringify(extractMcpContent(response.body.result))}`);
    }
    return extractMcpContent(response.body.result);
  }

  async request(method, params, includeSession = true) {
    const headers = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    };
    if (includeSession && this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    const body = {
      jsonrpc: '2.0',
      id: this.nextId++,
      method,
      params,
    };
    const response = await withTimeout(
      fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(body) }),
      this.timeoutMs,
      method,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} failed with HTTP ${response.status}: ${text}`);
    }
    const parsed = parseMaybeJson(text);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`${method} returned non-JSON response: ${text.slice(0, 500)}`);
    }
    return {
      body: parsed,
      sessionId: response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id') || '',
    };
  }
}

function appStores(app, storeFilter) {
  const stores = Array.isArray(app?.stores) ? app.stores.map((store) => String(store).toLowerCase()) : [];
  if (!storeFilter.length) return stores;
  return stores.filter((store) => storeFilter.includes(store));
}

function uniqueKeywordStorePairs(keywords, storeFilter) {
  const pairs = [];
  const seen = new Set();
  for (const row of Array.isArray(keywords) ? keywords : []) {
    const keyword = typeof row?.keyword === 'string' ? row.keyword.trim() : '';
    const store = typeof row?.store === 'string' ? row.store.trim().toLowerCase() : '';
    if (!keyword || !store) continue;
    if (storeFilter.length && !storeFilter.includes(store)) continue;
    const key = `${store}\u0000${keyword}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ keyword, store });
  }
  return pairs;
}

async function loadAscAppIdAllowlist(timeoutMs) {
  const run = await runCommand('asc', ['apps', 'list', '--paginate', '--output', 'json'], { timeoutMs });
  if (run.code !== 0) {
    return { ids: null, warning: run.stderr.trim() || run.stdout.trim() || 'asc apps list failed' };
  }
  const parsed = parseMaybeJson(run.stdout);
  const data = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
  return { ids: new Set(data.map((app) => String(app?.id || '')).filter(Boolean)), warning: '' };
}

function selectApps(apps, args, ascIds) {
  let selected = Array.isArray(apps) ? apps : [];
  if (args.appIds.length) {
    const wanted = new Set(args.appIds);
    selected = selected.filter((app) => wanted.has(String(app?.appId || '')));
  } else if (!args.allTracked && args.developer) {
    const developer = args.developer.toLowerCase();
    selected = selected.filter((app) => String(app?.developer || '').toLowerCase() === developer);
  }
  if (!args.allTracked && ascIds) {
    selected = selected.filter((app) => ascIds.has(String(app?.appId || '')));
  }
  if (args.stores.length) {
    selected = selected.filter((app) => appStores(app, args.stores).length > 0);
  }
  return selected;
}

async function exportApp(client, app, appDir, context) {
  await ensureDir(appDir);
  await writeJson(path.join(appDir, 'app.json'), app, context.args.pretty);

  const appId = String(app.appId || '');
  const keywords = await callAndWrite(client, 'get_app_keywords', { appId }, path.join(appDir, 'keywords.json'), context);
  const keywordContext = normalizeAstroKeywordsForLocalizeAso(app, keywords, context.resolveStoreLocale);
  await callAndWrite(client, 'get_app_ratings', { appId, includeHistory: true }, path.join(appDir, 'ratings-history.json'), context);

  const stores = appStores(app, context.args.stores);
  for (const store of stores) {
    await callAndWrite(client, 'get_app_ratings', { appId, store, includeHistory: true }, path.join(appDir, 'stores', store, 'ratings-history.json'), context, true);
    if (context.args.includeSuggestions) {
      await callAndWrite(client, 'get_keyword_suggestions', { appId, store }, path.join(appDir, 'stores', store, 'keyword-suggestions.json'), context, true);
    }
  }

  if (!context.args.includeRankingHistory && !context.args.includeCompetitors) return keywordContext;

  const pairs = uniqueKeywordStorePairs(keywords, context.args.stores);
  let exportedHistory = 0;
  for (const pair of pairs) {
    const baseDir = path.join(appDir, 'stores', safePathPart(pair.store), 'keywords', safePathPart(pair.keyword));
    if (context.args.includeRankingHistory) {
      if (!context.args.maxRankingHistory || exportedHistory < context.args.maxRankingHistory) {
        await callAndWrite(
          client,
          'search_rankings',
          {
            appId,
            keyword: pair.keyword,
            store: pair.store,
            includeHistory: true,
            includeStatistics: true,
            period: context.args.historyPeriod,
          },
          path.join(baseDir, 'ranking-history.json'),
          context,
          true,
        );
        exportedHistory += 1;
      }
    }
    if (context.args.includeCompetitors) {
      await callAndWrite(
        client,
        'extract_competitors_keywords',
        { keyword: pair.keyword, store: pair.store },
        path.join(baseDir, 'competitor-keywords.json'),
        context,
        true,
      );
    }
  }

  return keywordContext;
}

async function callAndWrite(client, tool, input, file, context, optional = false) {
  const startedAt = new Date().toISOString();
  try {
    const data = await client.callTool(tool, input);
    context.calls.push({ tool, input, file, ok: true, startedAt, finishedAt: new Date().toISOString() });
    await writeJson(file, data, context.args.pretty);
    return data;
  } catch (error) {
    const issue = {
      tool,
      input,
      file,
      optional,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    context.calls.push({ ...issue, ok: false });
    if (optional) context.warnings.push(issue);
    else context.errors.push(issue);
    await writeJson(file, { error: issue.error, tool, input, optional }, context.args.pretty);
    return null;
  }
}

function runCommand(command, commandArgs, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let forceKill = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 2_000);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (forceKill) clearTimeout(forceKill);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (forceKill) clearTimeout(forceKill);
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr, timedOut });
    });
  });
}

async function createZip(sourceDir, zipPath, timeoutMs) {
  await rm(zipPath, { force: true });
  await ensureDir(path.dirname(zipPath));
  const run = await runCommand('zip', ['-r', path.resolve(zipPath), path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir),
    timeoutMs: Math.max(timeoutMs, 300_000),
  });
  if (run.code !== 0) throw new Error(`zip failed: ${run.stderr.trim() || run.stdout.trim()}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureSharedBuild();
  const {
    resolveStoreLocale,
    buildLocalizeAsoMonetizationBoundary: sharedBuildLocalizeAsoMonetizationBoundary,
    LOCALIZEASO_POST_APPROVAL_PROTECTED_ACTION_BOUNDARY:
      sharedLocalizeAsoPostApprovalProtectedActionBoundary,
  } = await import('../packages/asc-shared/dist/index.js');
  buildLocalizeAsoMonetizationBoundary = sharedBuildLocalizeAsoMonetizationBoundary;
  localizeAsoPostApprovalProtectedActionBoundary =
    sharedLocalizeAsoPostApprovalProtectedActionBoundary;
  const outDir = path.resolve(args.outDir);
  const zipPath = path.resolve(args.zipPath);
  const keywordContextPath = args.keywordContextOut ? path.resolve(args.keywordContextOut) : '';
  const startedAt = new Date().toISOString();
  const context = { args, calls: [], warnings: [], errors: [], resolveStoreLocale };

  const client = new AstroMcpClient(args.endpoint, args.timeoutMs);
  const serverInfo = await client.initialize();
  const tools = await client.listTools();
  const allApps = await client.callTool('list_apps', {});

  let ascAllowlist = null;
  if (args.ascAllowlist && !args.allTracked) {
    const loaded = await loadAscAppIdAllowlist(args.timeoutMs);
    ascAllowlist = loaded.ids;
    if (loaded.warning) context.warnings.push({ kind: 'asc_allowlist', warning: loaded.warning });
  }
  const selectedApps = selectApps(allApps, args, ascAllowlist);

  if (args.dryRun) {
    process.stdout.write(
      `${jsonStringify(
        {
          dryRun: true,
          endpoint: args.endpoint,
          serverInfo,
          totalTrackedApps: Array.isArray(allApps) ? allApps.length : 0,
          selectedAppCount: selectedApps.length,
          selectedApps,
          ascAllowlistEnabled: Boolean(ascAllowlist),
          developerFilter: args.allTracked ? null : args.developer,
          stores: args.stores,
          includeRankingHistory: args.includeRankingHistory,
          includeSuggestions: args.includeSuggestions,
          includeCompetitors: args.includeCompetitors,
          keywordContextOut: keywordContextPath || null,
          keywordContextAttachCommands: keywordContextPath
            ? {
                screenshot: `pnpm review:agent keyword-context SCREENSHOT_JOB_ID --file ${keywordContextPath}`,
                field: `pnpm review:agent field-keyword-context FIELD_JOB_ID --file ${keywordContextPath}`,
              }
            : null,
          keywordContextReviewSafety: keywordContextPath ? keywordContextReviewSafety() : null,
          outDir,
          zipPath,
          warnings: context.warnings,
          toolNames: tools.map((tool) => tool.name),
        },
        true,
      )}\n`,
    );
    return;
  }

  await ensureDir(outDir);
  await writeJson(path.join(outDir, 'astro-server.json'), serverInfo, args.pretty);
  await writeJson(path.join(outDir, 'astro-tools.json'), tools, args.pretty);
  await writeJson(path.join(outDir, 'tracked-apps-all.json'), allApps, args.pretty);
  await writeJson(path.join(outDir, 'selected-apps.json'), selectedApps, args.pretty);

  const appKeywordContexts = [];
  for (const app of selectedApps) {
    const appDir = path.join(outDir, 'apps', safePathPart(`${app.name || 'app'}-${app.appId}`));
    const keywordContext = await exportApp(client, app, appDir, context);
    if (keywordContext) appKeywordContexts.push(keywordContext);
  }

  if (keywordContextPath) {
    const keywordContext = buildLocalizeAsoKeywordContext(
      appKeywordContexts,
      args,
      startedAt,
      keywordContextPath,
    );
    await writeJson(keywordContextPath, keywordContext, true);
  }

  const manifest = {
    kind: 'astro_mcp_apps_export',
    version: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    endpoint: args.endpoint,
    serverInfo,
    host: os.hostname(),
    totalTrackedApps: Array.isArray(allApps) ? allApps.length : 0,
    selectedAppCount: selectedApps.length,
    selectedAppIds: selectedApps.map((app) => app.appId).filter(Boolean),
    developerFilter: args.allTracked ? null : args.developer,
    ascAllowlistEnabled: Boolean(ascAllowlist),
    stores: args.stores,
    includeRankingHistory: args.includeRankingHistory,
    historyPeriod: args.historyPeriod,
    includeSuggestions: args.includeSuggestions,
    includeCompetitors: args.includeCompetitors,
    zipPath,
    outDir,
    callCount: context.calls.length,
    warningCount: context.warnings.length,
    errorCount: context.errors.length,
    keywordContextPath: keywordContextPath || null,
    warnings: context.warnings,
    errors: context.errors,
    calls: context.calls,
  };
  await writeJson(path.join(outDir, 'manifest.json'), manifest, true);
  await createZip(outDir, zipPath, args.timeoutMs);

  if (!args.keepDir) {
    await rm(outDir, { recursive: true, force: true });
  }

  process.stdout.write(
    `${jsonStringify(
      {
        ok: true,
        zipPath,
        outDir: args.keepDir ? outDir : null,
        selectedAppCount: selectedApps.length,
        warningCount: context.warnings.length,
        errorCount: context.errors.length,
        keywordContextPath: keywordContextPath || null,
      },
      true,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
