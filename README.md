# LocalizeASO Agent Kit

Public mirror for the LocalizeASO coding-agent setup.

## Install the agent skill

```sh
npx skills add Wotaso/localizeaso-agent-kit
```

The skill is in `skills/localizeaso-review-agent/SKILL.md`, which matches the
standard Vercel Skills CLI repository layout.

## Use the CLI

```sh
npx @localizeaso/cli@preview login --staging
npx @localizeaso/cli@preview mcp
```

The CLI package is still published as `@localizeaso/cli`. This repository only
mirrors the agent-facing CLI source, shared runtime dist, and skill instructions.

## Safety

The LocalizeASO review-agent skill may fetch bundles, create proposals, attach
keyword context, and open human review links. It must not approve, apply,
publish, schedule pricing, upload screenshots, or submit to App Store Connect.
