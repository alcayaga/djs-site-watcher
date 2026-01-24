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
**CRITICAL:** You must adhere to the following strict approval loop for all changes.

### Phase 1: Implementation & Review
1.  **Branching:** Always start a new task on a fresh branch (`feature/xyz`, `fix/xyz`). Never work directly on `master`.
2.  **Development:** Implement the core logic/feature first.
3.  **Feedback:** Present the implementation for review. **Do not generate commit messages yet.**

### Phase 2: Committing
* **Atomic Commits:** adhere to the "One Idea = One Commit" rule. Isolate features, bug fixes, and refactors.
* **Message Formatting:**
    * **NO** backticks (`) or quotes ("") around filenames or code symbols in the commit message (this breaks the local console).
    * Use standard conventional commits format where possible (e.g., `feat:`, `fix:`, `refactor:`).
* **Strict Approval Protocol:**
    * After staging files, you **MUST** output the full, final git commit message text.
    * **WAIT** for my explicit "ok" or "approved" before executing the actual git command.

### Phase 3: Testing & PR
1.  **Post-Implementation Testing:** Once the feature code is committed, write the tests in a **separate** subsequent commit.
2.  **Pull Request:**
    * Draft the PR description/title.
    * **WAIT** for my explicit "ok" or "approved" before submitting the draft via `gh`.

## 3. Environment & Testing Strategy
* **Unit Testing (`npm test`):**
    * Run these to verify isolated logic and new functionality without external dependencies.
    * Ensure tests are robust and cover edge cases, not just happy paths.
* **System Testing (`npm start`):**
    * **Context:** The environment is already configured with `SINGLE_RUN=true`.
    * **Behavior:** Executing `npm start` in this environment will **not** start the cron scheduler. It will execute each monitor module immediately once and then exit.
    * **Requirement:** You **must** use this method to verify the code works in the real environment (e.g., actual network requests, file parsing) before finishing a task.
