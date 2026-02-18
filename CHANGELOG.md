# Changelog

All notable changes to this project will be documented in this file.

## [3.4.0] - 2026-02-18

### Features

- **monitor:** Implement grace period for historic low exits (10f787c)

### Bug Fixes

- **deploy:** Use pm2 reload for reliable code updates (47a409a)

## [3.3.0] - 2026-02-18

### Features

- **core:** Bump to version 3.3.0

### Bug Fixes

- **config:** Remove optional environment variable warning for ALLOW_PRIVATE_IPS (0fbf0ce)
- **deploy:** Default branch to master in deploy script (4384a36)
- **monitor:** Implement price tolerance to avoid phantom spikes (5fa9c8c)
- **security:** Sanitize path traversal in solotodo.js (3cef7e6)

### Refactoring

- **security:** Extract Solotodo constants and verify SSRF protection (93ebaa1)

### CI/CD

- **ci:** Add staging deployment workflow (ffc3a6a)
- **chore:** Trigger staging deployment on master branch (4e0f928)

## [3.2.0] - 2026-02-16

### Features

- **monitor:** Enhance DealMonitor logging for price increases (0fbf0ce)
- **core:** Add global timestamp to console logs (7e9504a)

### Bug Fixes

- **network:** Add default timeout and retries for stability (6ac6473)
- **network:** Fix SSRF protection by restoring 'dnsLookup' for 'got' v11 compatibility and add an explicit 'ALLOW_PRIVATE_IPS' opt-in bypass for local system testing.
- **lint:** Add missing JSDoc comments to fetch_reviews scripts (ef6bbb4)
- **core:** Explicitly mark global timestamps as UTC (Z suffix)

### Refactoring

- **solotodo:** Extract hardcoded URLs and values into constants (5ac0a40)

## [3.1.1] - 2026-02-13

### Refactoring

- **image:** Extract image processing to utility (a74e728)
- **solotodo:** Extract entity selection logic to utility (813b688)
- **monitor:** Simplify notify method into orchestrator (8b3517f)

### Chores

- **monitor:** Refine verbose logging for price changes (e0d5927)

## [3.1.0] - 2026-02-12

### Features

- **list:** Implement interactive pagination (31f30a7)
- **commands:** Make /list and /help commands accessible to all users (ephemeral) (issue #118) (cc233ac)
- **auth:** Implement per-command authorization (issue #37) (371a417)

### Bug Fixes

- **deal:** Exclude refurbished products and entities (6bb65e8)
- **qa:** Handle missing text or image response keys in QAChannel (63ca211)

### Refactoring

- **config:** Modularize configuration and use idiomatic setting names (9b7f334)

### Chores

- **monitor:** Add verbose logging for price changes (7c9bf45)
- **gemini:** Update Gemini instructions (d3c95be)
