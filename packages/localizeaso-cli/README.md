# @localizeaso/cli

Agent-safe LocalizeASO CLI for App Store metadata, keyword, screenshot, and pricing review workflows.

## Usage

```sh
npx @localizeaso/cli@preview --help
```

For local desktop or BYO-agent use, sign in once and store a local CLI session:

```sh
npx skills add Wotaso/localizeaso-agent-kit
npx @localizeaso/cli@preview login --staging
npx @localizeaso/cli@preview whoami --json
```

The LocalizeASO agent skill is installed through the Vercel Skills CLI from the
public LocalizeASO agent kit mirror. This package exposes the safe LocalizeASO
CLI and MCP bridge for Codex, OpenClaw, Cursor, and other coding-agent runtimes.

For VPS, CI, and hosted automation, prefer an explicit bearer token:

```sh
LOCALIZEASO_TOKEN=... LOCALIZEASO_BACKEND=https://api.localizeaso.com localizeaso whoami --json
```

`LOCALIZEASO_TOKEN`, `LOCALIZEASO_BACKEND`, and `LOCALIZEASO_DASHBOARD` override the local CLI config.
