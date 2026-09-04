# Contributing to Discord Site Watcher

Welcome! Thank you for considering contributing to the Discord Site Watcher project. This document outlines the standard development workflow, testing requirements, and guidelines for both human contributors and AI agents working on the codebase.

## 1. Development Conventions
When modifying code or creating PRs, please adhere to the following rules:
- **Language**: All code comments, variable names, and commit messages MUST be in English.
- **User-Facing Text**: Any text visible to the user (e.g., Discord embed titles, descriptions, error messages) MUST be in Spanish.
- **Commit Messages**: Follow the [Conventional Commits](https://www.conventionalcommits.org/) standard.
- **JSDoc**: All new classes and functions must include JSDoc comments explaining their intent and parameters.

## 2. Testing Strategy
We enforce a strict testing order to ensure the bot remains stable across deployments. **You must follow this sequence when validating your changes:**

### Step 1: Targeted Unit Tests
When building a feature or fixing a bug, run the specific test file associated with your code. Leverage the `__mocks__` directory when mocking external dependencies.

```bash
npm test -- tests/monitors/DealMonitor.test.js
```
*Goal: Fail fast and iterate quickly.*

### Step 2: Full Validation (Preflight)
Before opening a Pull Request, you **MUST** run the preflight check. This command cleans the environment, lints the codebase, and runs the entire test suite.

```bash
npm run preflight
```
*Goal: Ensure your changes do not break unrelated components or violate linting rules.*

---

## 3. Visual Simulation Framework (Optional E2E)
Because this step requires human visual validation in the live Discord client, it should **only be used when making major changes to the Discord notification UI** (e.g., edge cases like price ties, missing images, new embed fields, etc.). You do not need to run this for standard logic or backend changes.

For these cases, we provide a **Simulation Runner**.

### Running a Simulation
The runner safely mocks external API responses (like Solotodo) and forces the Discord bot to post a mock alert to your configured channel.

```bash
# You must have your .env file configured with a valid DISCORDJS_BOT_TOKEN
node --env-file=.env scripts/simulate.js <scenario-name>
```

**Example:**
```bash
node --env-file=.env scripts/simulate.js deal-tie
```

### Adding New Scenarios
To add a new scenario, create a new file in `scripts/scenarios/` (e.g., `deal-massive-drop.js`).
The file should export a Javascript object containing the mocked API payloads required for the test:

```javascript
// scripts/scenarios/example-scenario.js
module.exports = {
    mockStores: new Map([...]),
    mockEntities: [...],
    product: { ... },
    stored: { ... },
    triggers: ['NEW_LOW_OFFER'],
    // ...
};
```
By isolating the data into scenario files, you can quickly build an arsenal of edge-case visual tests without modifying the execution logic.
