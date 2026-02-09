# Project: Discord Site Watcher

**Description:** A Discord bot utilizing web scraping and cron jobs to monitor Apple services and websites.

## 1. Code Quality & Standards
* **Language & Localization:**
    * **UI/User-Facing Text:** MUST be in **Spanish** (e.g., Discord embed titles, descriptions, error messages sent to users).
    * **Code & Internal Comments:** MUST be in **English** (variable names, commit messages, JSDoc, inline comments).
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
**GLOBAL PRE-COMMIT GAUNTLET:** You must pass **Linting** and **System Testing** before creating **ANY** commit.
* **WARNING:** This rule applies to **EVERY SINGLE ITERATION**. If you make a small fix after a failed test or a code review, you **MUST** run the full gauntlet again before committing. Do not skip this step.

* **Special Case: Slash Commands**
    * If your changes modify Discord Slash Commands (interaction definitions), you **MUST** run `npm run deploy` (or `npm deploy`) to propagate the updates to Discord before committing.

* **Scenario A: Bug Fixes & Simple Changes (TDD Style)**
    1.  **Test First:** Write/modify the test case to reproduce the bug.
    2.  **Verify:** Ensure the unit test passes.
    3.  **Lint:** Run `npm run lint`.
    4.  **System Check:** Run `npm start`. (Do NOT prepend `SINGLE_RUN=true`). **If this fails, DO NOT COMMIT.**
    5.  **Commit:** Commit the code and the test **together**.

* **Scenario B: Large Features & Complex Refactors**
    1.  **Implement:** Focus on the implementation logic.
    2.  **Regression Check:** Run `npm test` (existing tests) to ensure no breakages.
    3.  **Lint:** Run `npm run lint`.
    4.  **System Check:** Run `npm start`. (Do NOT prepend `SINGLE_RUN=true`). **If this fails, DO NOT COMMIT.**
    5.  **Commit Implementation:** Commit the working feature code.
    6.  **New Tests:** Add comprehensive tests for the new feature in a **separate subsequent commit**.

### Phase 3: Committing Standards
* **Atomic Commits:** Adhere to the "One Idea = One Commit" rule. Isolate features, bug fixes, and refactors.
* **Message Formatting:**
    * **Escape Backticks:** You **MUST** escape backticks (e.g., `\`filename\``) when using `run_shell_command`. Failing to do so will break the shell command execution.
    * Use standard conventional commits format (e.g., `feat:`, `fix:`, `refactor:`).

### Phase 4: PR Cycle & CI/CD Loop
Once the work is committed, follow this EXACT cycle.

1.  **Push & Trigger:**
    * `git push origin <branch_name>`
    * **IF NEW PR:**
        * `gh pr create` (Draft description).
        * **STOP:** Do NOT comment `/gemini review`. The first review is automatic.
    * **IF EXISTING PR:**
        * **Trigger Review:** You MUST explicitly request a re-review immediately after pushing.
        * Run: `gh pr comment <PR-NUMBER> --body "/gemini review"`

2.  **MANDATORY WAIT (CI/CD & Review):**
    * **STOP.** Do not proceed immediately.
    * You **MUST** run `sleep 250` in the terminal.
    * *Why?* This gives time for CI/CD checks to pass AND for the AI reviewer to post its comments from Step 1.
    * **Check Status:** AFTER sleeping, run `gh pr checks <PR-NUMBER>` to verify all tests passed.
    * **If checks fail:** Fix them (Go back to Phase 2) before reading reviews.

3.  **Fetch Unresolved Reviews (Including Outdated):**
    * Run exactly:
        ```bash
        gh pr-review review view <PR-NUMBER> -R alcayaga/djs-site-watcher --unresolved --reviewer gemini-code-assist
        ```
    * **Logic Check:** If the JSON output shows reviews but the `comments` array inside them is empty (or missing), this implies **NO unresolved threads**. You may skip Step 4.

4.  **Handle Feedback (Iterate):**
    * **Out of Scope:** If a review request is valid but outside the current PR's scope:
        * **Create Issue:** Create a detailed issue with full context. You MUST tag relevant labels and mention the source PR.
        * `gh issue create --title "Refactor: ..." --body "Extracted from PR #123. Context: ..." --label "refactor"`
        * **Resolve:** `gh pr-review threads resolve ...` with body "Moved to issue #XYZ".
    * **Reply (Contextual):** If you need to reply to a specific thread:
        * `gh pr-review comments reply <PR-NUMBER> ... --body "Your reply. /gemini review"`
        * *Note:* Adding `/gemini review` here ONLY provides info on that specific thread.
    * **Resolve:** If you fixed the code issue:
        * `gh pr-review threads resolve -R alcayaga/djs-site-watcher <PR-NUMBER> --thread-id <PRRT_ID>`

5.  **Loop:**
    * If you made code changes to fix the feedback, **GO BACK TO PHASE 2** (Lint -> Test -> System Check -> Commit -> Push -> Trigger).

## Testing Strategy Rules
When validating changes, ALWAYS follow this strict execution order:

1. **Targeted Unit Test:**
   - Run the specific test file: `npm test -- path/to/specific.test.js`
   - **Mocks:** Leverage the `__mocks__` directory when mocking external dependencies or modules.
   - Goal: Fail fast.

2. **Full Regression:**
   - Execute only if targeted test passes: `npm test`

3. **System Environment Test (`npm start`):**
   - **Context:** The environment is configured with `SINGLE_RUN=true`.
   - **Command:** `npm start` (Do NOT add env flags manually).
   - **Requirement:** This is MANDATORY before any commit (as defined in Phase 2) to verify file parsing and network requests.
