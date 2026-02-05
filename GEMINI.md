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
    * **NO** backticks (`) or quotes ("") around filenames or code symbols in the commit message.
    * Use standard conventional commits format (e.g., `feat:`, `fix:`, `refactor:`).

### Phase 4: PR Cycle & CI/CD Loop
Once the work is committed, follow this EXACT cycle. Repeat this loop for every new commit pushed to the PR.

1.  **Push & Create:**
    * `git push origin <branch_name>`
    * **If New:** `gh pr create` (Draft description. **DO NOT** include `/gemini review` in the initial description. The first review is automatic).
    * **If Existing:** Just push.

2.  **MANDATORY WAIT (CI/CD):**
    * **STOP.** Do not proceed immediately.
    * You **MUST** run `sleep 250` in the terminal to allow CI/CD checks to complete.
    * **Check Status:** AFTER sleeping, run `gh pr checks <PR-NUMBER>` to verify all tests passed.
    * **If checks fail:** Fix them (Go back to Phase 2) before asking for a review.

3.  **Fetch Unresolved Reviews:**
    * Run exactly:
        ```bash
        gh pr-review review view <PR-NUMBER> -R alcayaga/djs-site-watcher --unresolved --reviewer gemini-code-assist
        ```
    * **Logic Check:** If the JSON output shows reviews but the `comments` array inside them is empty (or missing), this implies **NO unresolved threads**. You may skip to Step 5.

4.  **Handle Feedback (Iterate):**
    * **Out of Scope:** If a review request is valid but outside the current PR's scope:
        * Create a new issue: `gh issue create --title "..." --body "..." --label "..."`
        * Resolve the comment: `gh pr-review threads resolve ...` with body "Moved to issue #XYZ".
    * **Reply (Contextual):** If you need to reply to a specific thread:
        * `gh pr-review comments reply <PR-NUMBER> ... --body "Your reply. /gemini review"`
        * *Note:* Adding `/gemini review` here ONLY provides info on that specific thread. It does **NOT** trigger a full PR re-review.
    * **Resolve:** If you fixed the code issue:
        * `gh pr-review threads resolve -R alcayaga/djs-site-watcher <PR-NUMBER> --thread-id <PRRT_ID>`

5.  **Trigger Full Re-Review (Final Step):**
    * After addressing comments and pushing fixes, if you need a **fresh, full review** of the latest changes:
    * Run: `gh pr comment <PR-NUMBER> --body "/gemini review"`
    * **GO BACK TO PHASE 2** (Lint -> Test -> System Check -> Commit) if further changes are needed.

## Testing Strategy Rules
When validating changes, ALWAYS follow this strict execution order:

1. **Targeted Unit Test:**
   - Run the specific test file: `npm test -- path/to/specific.test.js`
   - Goal: Fail fast.

2. **Full Regression:**
   - Execute only if targeted test passes: `npm test`

3. **System Environment Test (`npm start`):**
   - **Context:** The environment is configured with `SINGLE_RUN=true`.
   - **Command:** `npm start` (Do NOT add env flags manually).
   - **Requirement:** This is MANDATORY before any commit (as defined in Phase 2) to verify file parsing and network requests.
