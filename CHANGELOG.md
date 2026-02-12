# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-02-12

### Features

- **list:** Implement interactive pagination (31f30a7)
- **commands:** Make /list and /help commands public (issue #118) (cc233ac)
- **auth:** Implement per-command authorization (issue #37) (371a417)

### Bug Fixes

- **deal:** Exclude refurbished products and entities from monitoring (2665cb2)
- **qa:** Handle missing text or image response keys in QAChannel (63ca211)

### Security

- **solotodo:** Apply getSafeGotOptions for SSRF protection (2bbff15)

### Refactoring

- **solotodo:** Use URL API in getProductHistory (60236cd)
- **solotodo:** Address review feedback on URL handling and constants (1b87d27)
- **config:** Modularize configuration and use idiomatic setting names (9b7f334)

### Documentation

- **solotodo:** Update getAvailableEntities JSDoc default value (e0376b1)

### Chores

- **monitor:** Add verbose logging for price changes (7c9bf45)
- **gemini:** Update Gemini instructions (d3c95be)
