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

### Phase 1: Context & Branching (CRITICAL)
1.  **Context (Existing PRs):**
    * If working on an existing PR, YOU MUST gather context first:
    * **Status & Comments:** Run `gh pr view <PR-NUMBER>`.
    * **Code Reviews:** Run `gh pr-review review view <PR-NUMBER> -R alcayaga/djs-site-watcher`.
2.  **Mandatory Branch Check:**
    * Before writing ANY code, run `git branch --show-current`.
    * **IF** the result is `master`: **STOP.** Create a new branch immediately (`git checkout -b feature/name` or `fix/name`).
    * **NEVER** commit directly to `master`.

### Phase 2: Testing & Committing Logic
**GLOBAL PRE-COMMIT GAUNTLET:** You must pass **Linting** and **System Testing** before creating any commit.

* **Scenario A: Bug Fixes & Simple Changes (TDD Style)**
    1.  **Test First:** Write/modify the test case to reproduce the bug.
    2.  **Verify:** Ensure the unit test passes.
    3.  **Lint:** Run `npm run lint`.
    4.  **System Check:** Run `npm start`. (This runs the bot once to verify real-world connectivity/parsing). **If this fails, DO NOT COMMIT.**
    5.  **Commit:** Commit the code and the test **together**.

* **Scenario B: Large Features & Complex Refactors**
    1.  **Implement:** Focus on the implementation logic.
    2.  **Regression Check:** Run `npm test` (existing tests) to ensure no breakages.
    3.  **Lint:** Run `npm run lint`.
    4.  **System Check:** Run `npm start`. (Verifies the code works in the real environment with `SINGLE_RUN=true`). **If this fails, DO NOT COMMIT.**
    5.  **Commit Implementation:** Commit the working feature code.
    6.  **New Tests:** Add comprehensive tests for the new feature in a **separate subsequent commit**.

### Phase 3: Committing Standards
* **Atomic Commits:** Adhere to the "One Idea = One Commit" rule. Isolate features, bug fixes, and refactors.
* **Message Formatting:**
    * **NO** backticks (`) or quotes ("") around filenames or code symbols in the commit message.
    * Use standard conventional commits format (e.g., `feat:`, `fix:`, `refactor:`).

### Phase 4: PR & Code Review Process
Once the work is committed, follow this EXACT sequence:

1.  **Push:** `git push origin <branch_name>`
2.  **Create PR:** `gh pr create` (Draft the description).
3.  **Wait:** Wait approximately 5 minutes for CI/CD or initial checks to populate.
4.  **Check Reviews:**
    * Run: `gh pr-review review view <PR-NUMBER> -R alcayaga/djs-site-watcher`
    * **PROHIBITED:** Do NOT use `gh api` to check reviews. Use the specific tool command above.
5.  **Trigger AI Review:**
    * After creating the PR or pushing updates to an existing one, run this command to trigger the automated review agent:
    * `gh pr comment <PR-NUMBER> --body "/gemini review"`

## Testing Strategy Rules
When validating changes, ALWAYS follow this strict execution order:

1. **Targeted Unit Test:**
   - Run the specific test file: `npm test -- path/to/specific.test.js`
   - Goal: Fail fast.

2. **Full Regression:**
   - Execute only if targeted test passes: `npm test`

3. **System Environment Test (`npm start`):**
   - **Context:** The environment is configured with `SINGLE_RUN=true`.
   - **Behavior:** This executes the monitors once and exits (no cron).
   - **Requirement:** This is MANDATORY before any commit (as defined in Phase 2) to verify file parsing and network requests.
