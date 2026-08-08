# Update System Plan

Repository: <https://github.com/alams-innovative/bulkimg-studio>.

## Product decision

Expose two user-facing update channels:

- **Stable** — recommended; receives completed releases only.
- **Beta** — opt-in; receives newer releases that can disrupt an existing workflow.

Use **beta**, not **canary**, in the product. “Beta” tells normal users what to expect. Reserve “canary” only for private developer/CI builds if it is still useful internally. The current `canary` build/install naming must be migrated to `beta` as one atomic release-tooling change; until then it remains the implementation name, not the product label.

Recommendation: use one installed app and save the selected update channel as a local preference. This lets a stable user opt into beta and later return to stable without maintaining two independent libraries or API-key stores.

## Current state

The existing installer can replace an already-downloaded local installation. It stops the installed app, installs it, and relaunches it. The app cannot currently check GitHub, download releases, verify them, or roll back.

## About and update experience

Create a dedicated **About & updates** area with:

- Installed version, for example `1.0.6 (Stable)`, and a link to its release notes.
- **Check for updates** button and last-checked status.
- A checked/unchecked **Receive beta updates** control. Its visible helper text says: “Beta releases are newer but can disrupt your workflow. Stable is recommended.”
- An available-update card with version, channel badge, concise notes, download progress, retry, and **Download and install** confirmation.
- A **Version history** list of compatible published releases. Each row has its full version, channel, date, notes link, and **Install this version** action.
- Recovery actions after a beta failure: **Install latest stable** and **Install previous stable**. If both resolve to the same version, show one action only.

Do not silently update. The user must confirm installation. Keep the version picker inside the About area, not scattered through the rest of Settings.

## Release contract

Every GitHub Release publishes a complete installer ZIP plus a signed manifest:

- `BulkImgStudio-Setup.zip` — the existing complete installer ZIP, including `.installer/`.
- `bulkimg-update.json` — tag, semantic version, channel (`stable` or `beta`), published time, notes URL, ZIP URL, ZIP byte size, ZIP SHA-256, minimum supported app version, and supported Windows architecture.
- `bulkimg-update.json.sig` — an Ed25519 signature over the exact manifest bytes. The app embeds the matching public key.

SHA-256 is required before any installer handoff. It detects a corrupt, incomplete, or substituted download. The signed manifest is also required: a hash downloaded from the same compromised location is not enough to prove authenticity. Code-signing the Windows installer remains recommended for SmartScreen and OS-level trust, but does not replace manifest verification.

Use immutable semantic tags such as `v1.0.6` and GitHub Release asset URLs. Do not treat a mutable `latest` ZIP URL as a trust source. Stable releases are normal published GitHub Releases; beta releases are marked as prereleases.

## Target flow

```text
App start or Check for updates
  -> read local preference: Stable or Beta
  -> fetch GitHub release metadata and candidate manifest/signature
  -> verify manifest signature with embedded public key
  -> validate schema, channel, architecture, version, URL host, and version policy
  -> compare semantic versions and show eligible update or history
  -> user confirms a version
  -> download ZIP to a unique temporary directory with progress/retry
  -> verify byte count and ZIP SHA-256 from the signed manifest
  -> launch a separate updater helper and exit the app
  -> helper revalidates the ZIP layout, runs Install-BulkImgStudio.cmd, and relaunches
```

## Version and rollback policy

- Stable users see only newer stable versions unless they opt into beta.
- Beta users see newer beta releases and newer stable releases. A newer stable is presented as the recommended path back to stable.
- The history list shows only versions compatible with the installed database/schema and Windows architecture.
- A downgrade never runs automatically. The user explicitly selects it and sees the target version.
- Before a downgrade, create a timestamped SQLite backup and retain it until the next successful launch. If a migration cannot safely move backward, disable that downgrade and state why.
- After an update, the app records the prior working version. If the new version fails its launch-health check, the helper offers the latest stable and previous stable choices.
- Never offer the current version, duplicate fallback targets, deleted GitHub assets, or prereleases to Stable users.

## Implementation order

1. Rename external canary terminology to beta and define one semantic-version/channel utility shared by release tooling and the app.
2. Add GitHub Release publishing that runs the release gate, builds the ZIP, computes its SHA-256/size, generates and signs the manifest, then uploads all three assets.
3. Add typed contracts plus a Bun-only update service for release discovery, signature verification, manifest validation, semantic-version policy, download/resume, and checksum validation.
4. Add local update state: selected channel, last check, prior working version, attempted version, downloaded artifact metadata, and rollback backup metadata.
5. Add the About & updates UI and its explicit stable/beta copy, version history, failure state, progress, and confirmation flow.
6. Add a standalone updater helper. It must run outside the app being replaced, recheck hash/layout, preserve logs/backups, start the existing installer, wait for the first successful app health signal, and clean temporary files only after success.
7. Add unit, integration, Playwright, and manual Windows upgrade/rollback coverage.

## Edge cases and required behavior

| Situation | Required behavior |
| --- | --- |
| Offline, DNS error, GitHub outage, rate limit | Keep the installed app unchanged; show last-check time and a retry action. |
| Manifest missing, malformed, unsigned, invalid signature, wrong repo/host | Reject it; never expose an install button. |
| ZIP byte-size/hash mismatch, partial download, disk full, antivirus lock | Delete/quarantine the partial artifact, preserve the app, and offer a safe retry. |
| User closes the app during download | Cancel cleanly and retain no installable partial ZIP. |
| App is generating, converting, exporting, or has a non-terminal run | Block installation; explain that the workflow must finish/cancel first. |
| Two update checks/downloads start | Single-flight them; one status source and one temp directory per attempt. |
| GitHub asset removed or version no longer available | Mark it unavailable in history; do not show a dead install action. |
| Beta update fails to launch | Show latest stable and previous stable; collapse identical choices to one. |
| Stable update fails to launch | Offer the previous compatible stable version. |
| Database/schema cannot downgrade | Block that history choice and keep the backup; never risk data loss. |
| Existing app process or helper is still running | Helper waits with a bounded timeout, then reports a manual-close instruction. |
| Power loss/reboot during install | Existing installer and manifest remain recoverable; next launch detects incomplete handoff and offers retry/rollback. |
| Architecture/OS incompatibility | Hide incompatible release and explain the requirement. |
| Clock is wrong or release dates are unusual | Compare semantic versions, not local time. |
| Release tag/manifest/package version disagree | Reject the release in publishing and in the client. |
| Current version was manually installed or unknown | Permit check/download, but require the normal confirmation path. |

## Verification gate

- Unit tests: semantic-version/channel policy, manifest schema/signature, URL/architecture validation, fallback target deduplication, and checksum mismatch.
- Integration tests: interrupted/resumed download, disk/write failure, missing asset, helper command construction, and backup metadata.
- Playwright: About area, beta opt-in warning, stable-only filtering, version history, confirmation, progress/error/retry, and beta-failure fallback actions.
- Windows smoke: stable-to-stable upgrade, stable-to-beta opt-in, beta-to-latest-stable recovery, downgrade with a compatible schema, and blocked downgrade with an incompatible schema.
