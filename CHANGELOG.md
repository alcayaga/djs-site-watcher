# Changelog

All notable changes to this project will be documented in this file.

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
