# Project: Discord Site Watcher

**Description:** A Discord bot utilizing web scraping and cron jobs to monitor Apple services and websites.

## 1. Code Quality & Standards
* **Documentation:**
    * **Project Docs:** Update `README.md` whenever features are added, setup steps change, or configuration parameters are modified.
    * **Code Docs:** All new functions and classes **must** have JSDoc comments.
    * **Inline Docs:** Comments should focus on the **"Why"** (reasoning/intent), not the "What" (syntax).
* **Legacy Refactoring:**
    * Treat this as legacy code. Actively identify technical debt and propose architectural improvements or modernizations alongside your implementation tasks.

## 2. Interaction & Git Workflow

### Phase 1: Implementation & Review
1.  **Branching:** Always start a new task on a fresh branch (`feature/xyz`, `fix/xyz`). Never work directly on `master`.
2.  **Development:** Implement the core logic/feature first.

### Phase 2: Testing & Committing Logic
**GLOBAL PRE-COMMIT RULE:** Before creating ANY commit, you **must** run `npm run lint` and fix any style/linting errors.

* **Scenario A: Bug Fixes & Simple Changes (TDD Style)**
    1.  **Test First:** Write or modify the test case to reproduce the bug or verify the simple change.
    2.  **Verify:** Ensure the test passes.
    3.  **Lint:** Run `npm run lint`.
    4.  **Commit:** Commit the code and the test **together** in a single commit.

* **Scenario B: Large Features & Complex Refactors**
    1.  **Implement:** Focus on the implementation logic first.
    2.  **Regression Check:** Run **existing** tests (`npm test`) to ensure the new code hasn't broken current functionality.
    3.  **Lint:** Run `npm run lint`.
    4.  **Commit Implementation:** Commit the working feature code.
    5.  **New Tests:** Add comprehensive tests for the new feature in a **separate subsequent commit** to keep the history clean.

### Phase 3: Committing Standards
* **Approvals:** You have autonomy to execute commits
* **Atomic Commits:** Adhere to the "One Idea = One Commit" rule. Isolate features, bug fixes, and refactors.
* **Message Formatting:**
    * **NO** backticks (`) or quotes ("") around filenames or code symbols in the commit message (this breaks the local console).
    * Use standard conventional commits format where possible (e.g., `feat:`, `fix:`, `refactor:`).

### Phase 4: PR & Finalization
1.  **Pull Request:**
    * Draft the PR description/title.
    * **WAIT** for my explicit "ok" or "approved" before submitting the draft via `gh`.

## Testing Strategy
When validating changes, ALWAYS follow this strict execution order:

1. **Targeted Test (First):**
   - Run the specific test file associated with the modified component.
   - Example: `npm test -- path/to/specific.test.js`
   - Goal: Fail fast on immediate errors.

2. **Full Regression (Second):**
   - **Condition:** Execute this ONLY if the targeted test passes.
   - Command: `npm test` (or your full suite command)
   - Goal: Ensure no side effects broke other parts of the system.

## 3. Environment & Testing Strategy
* **Unit Testing (`npm test`):**
    * Run these to verify isolated logic and new functionality without external dependencies.
    * Ensure tests are robust and cover edge cases, not just happy paths.
* **System Testing (`npm start`):**
    * **Context:** The environment is already configured with `SINGLE_RUN=true`.
    * **Behavior:** Executing `npm start` in this environment will **not** start the cron scheduler. It will execute each monitor module immediately once and then exit.
    * **Requirement:** You **must** use this method to verify the code works in the real environment (e.g., actual network requests, file parsing) before finishing a task.