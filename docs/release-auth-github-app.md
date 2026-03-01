# Release Auth with GitHub App

This guide covers how to configure `release-auth=app` for Changesets release automation.

## Why app mode

- Better security posture than long-lived PAT tokens.
- Scales better for org/repo-level automation.
- Supports reliable retrigger behavior when Changesets updates an existing `changeset-release/*` PR branch.

## Required repository secrets

Configure these repository-level Actions secrets:

- `GH_APP_PRIVATE_KEY` (required)
- `GH_APP_CLIENT_ID` (recommended) or `GH_APP_ID` (legacy fallback)

The release workflow accepts either `GH_APP_CLIENT_ID` or `GH_APP_ID`.

## Setup steps

1. Create a GitHub App.
2. Install the app on the target repository.
3. Grant app permissions required for release automation (contents + pull requests).
4. Store app credentials as repository secrets.
5. Run package-starter setup with `--release-auth app`.

## Official GitHub docs

- GitHub Apps overview: https://docs.github.com/apps
- Create GitHub App: https://docs.github.com/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- Install GitHub App: https://docs.github.com/apps/using-github-apps/installing-your-own-github-app
- Actions secrets: https://docs.github.com/actions/security-guides/using-secrets-in-github-actions

## Notes

- GitHub App creation and installation remain manual admin steps.
- If app secrets are missing, package-starter will warn in summary output.
