# Agent Instructions for `djs-site-watcher` (Discord Site Watcher)

Welcome, AI Agent! This document contains essential context about the `djs-site-watcher` project. Please review this before making changes to the codebase to save time on exploration.

## 🎯 Project Overview
`djs-site-watcher` is a Discord bot utilizing web scraping and cron jobs to monitor Apple services (Carrier Bundles, Apple Pay, eSIM, Features), SoloTodo deals, and general website changes, alerting users via Discord. It also supports modular channel handlers for specialized behaviors like Q&A and Deals moderation.

- **Runtime:** Node.js (`>=22.0.0`)
- **Language:** JavaScript
- **Testing:** Jest
- **Linting & Formatting:** ESLint

## 🏗️ Architecture & Key Directories
The project follows a modular Node.js structure:
- **`src/monitors/`**: Specific monitoring and scraping logic (general websites, Apple services, SoloTodo deals).
- **`src/commands/`**: Discord Slash Command definitions and execution logic.
- **`src/channels/`**: Specialized channel behavior handlers (e.g., Q&A, Deals moderation).
- **`src/handlers/`**: Core handlers for managing Discord interactions, events, and messages.
- **`config/`**: JSON-based configuration and persistent state management.

## 🚀 Building & Running
- **Install Dependencies:** `npm install`
- **Deploy Discord Commands:** `npm run deploy`
- **Run in Development / System Check:** `npm run start`
- **Run in Debug Mode:** `npm run debug` (Enables the Node.js inspector)

## 🧪 Testing & Quality Assurance
When validating changes, **always** follow the strict execution order defined in **`docs/CONTRIBUTING.md`**:
1. **Targeted Unit Testing (TDD Style):** For bug fixes and simple changes, write or modify the Jest test case *first* to reproduce the bug before touching implementation code.
2. **All Unit Tests:**
   ```bash
   npm run test
   ```
3. **Linting:**
   ```bash
   npm run lint
   ```
4. **Full Preflight Validation (Mandatory before PRs):** Runs a clean install, linting, and the full test suite.
   ```bash
   npm run preflight
   ```
5. **Visual Simulation Framework (Optional):** Refer to `docs/CONTRIBUTING.md` to run E2E Discord embed simulations when making significant UI/embed changes.

## 🌐 Localization & Coding Conventions
- **Code & Internal Text (English ONLY):** Variable names, function names, commit messages, JSDoc blocks, and inline comments **MUST** be written in **English**.
- **User-Facing UI Text (Spanish ONLY):** All Discord embed titles, descriptions, field labels, and error messages sent to end-users **MUST** be written in **Spanish**.
- **Conventional Commits & Branches:** It is mandatory to use the [Conventional Commits](https://www.conventionalcommits.org/) standard (e.g., `feat:`, `fix:`, `refactor:`) for all commit messages. This standard must also be applied to branch naming (e.g., `feat/...`, `fix/...`).
- **Atomic Commits:** Adhere to the *"One Idea = One Commit"* rule. Isolate features, bug fixes, and refactors into logical commits.
- **Shell Escaping:** To avoid shell escaping issues when passing multi-line Markdown to CLI tools (like `gh`), you **MUST** properly escape backticks or pass content via `--body-file` / quoted EOF heredocs.
- **Technical Debt:** Actively identify technical debt and propose architectural improvements or modernizations alongside your implementation tasks.

## 📝 Documentation & JSDoc Rules
- **JSDoc Coverage & CodeRabbit:** All new functions, methods, and classes **MUST** include standard JSDoc comments (including helper or mock functions in tests if required by coverage checks, which enforce an 80% threshold).
- **Inline Comments:** Focus strictly on the **"Why"** (business logic, edge-case reasoning, or intent), never the **"What"** (obvious syntax).
- **Project Documentation:** Update `README.md` whenever features are added, setup steps change, or configuration parameters are modified.

## 🔧 Troubleshooting & Environment Docs
If a task requires inspecting or interacting with Staging or Production data/environments, read the local instructions located at:
- **`docs/production.md`**
- **`docs/staging.md`**
*(Note: These files are untracked/ignored by Git as they contain sensitive environment information.)*

## 🔄 GitHub PR & Review Loop
When committing new features or fixes, you are expected to handle the entire PR lifecycle natively without legacy wrapper skills:
1. **Testing & Preflight are Mandatory:** Existing tests must pass without regression. Furthermore, you **must write new tests** whenever adding new features, fixing bugs, or addressing user feedback. Ensure `npm run preflight` passes completely before opening a PR.
2. **Commit & Push Carefully:** Keep PRs small, focused, and linked to an existing issue. Commit your changes and push the branch to origin. **Do NOT push multiple commits rapidly** once a PR is open, as this breaks or auto-pauses the CodeRabbit AI review process. Wait for an active review to finish before pushing iterative fixes.
3. **Ask for Manual User Feedback:** Ask the user to review or test the changes locally before you create the Pull Request.
4. **Create the Pull Request:** Once the user approves the local test, create the Pull Request using the GitHub CLI (`gh pr create`). You **MUST** format the PR body using `.github/pull_request_template.md` (if present) and link the relevant issue. When filling out any pre-merge checklist, actually validate each checkbox rather than checking it blindly.
5. **Monitor Pre-Merge CI Checks:** Monitor the GitHub Actions workflows by running:
   ```bash
   gh pr checks <pr_number> --watch --interval 60
   ```
6. **Local CodeRabbit Review:** Before spending your 1-per-hour remote GitHub token, you **MUST** validate your commits locally. Read and use the `code-review` skill (via `coderabbit review --agent`) to compare your feature branch against the base branch and catch edge cases. You get 3 local reviews per hour—use them to guarantee a clean build first.
7. **Trigger & Monitor CodeRabbit Manually:** Only after the local review is completely clean (0 findings) and standard GitHub Actions checks pass, trigger the remote review. After calling `@coderabbitai review`, you **MUST wait for 5 seconds** so the check run registers on GitHub, and then monitor the review using `gh pr checks <pr_number> --watch --interval 60`:
   ```bash
   gh pr comment <pr_number> --body "@coderabbitai review" && sleep 5 && gh pr checks <pr_number> --watch --interval 60
   ```
8. **Inspect the First CodeRabbit Comment & Handle Rate Limits:** A green `CodeRabbit` status check in `gh pr checks` **ONLY** means the analysis finished running; it does **NOT** mean the code was approved. **The very first CodeRabbit comment on the PR is constantly updated** in place and serves as the source of truth for:
   - Whether there is any **pre-merge check issue** or actionable review finding.
   - Whether CodeRabbit is currently **rate-limited**, along with the exact **cooldown time** remaining (if any).
   - **If CodeRabbit is rate-limited:** You **MUST wait until the cooldown limit is completely cleared** before trying again. Do not spam review triggers or attempt to bypass the review while rate-limited.
   - Fetch and inspect the first CodeRabbit comment directly using:
     ```bash
     gh pr view <pr_number> --json comments --jq '[.comments[] | select(.author.login | test("coderabbit"; "i"))] | first'
     ```
   - Also confirm the PR merge status by running:
     ```bash
     gh pr view <pr_number> --json mergeable,mergeStateStatus
     ```
9. **Address Review Comments (NEVER Resolve Manually):**
   - **Do NOT manually resolve review threads or conversations** (via `gh pr-review`, GraphQL API, or UI) in an attempt to make the PR mergeable.
   - **Actionable In-Scope Feedback:** Commit and push fixes for all actionable review comments, then trigger a new review (respecting local review checks, rate limits, and the 5-second wait). **CodeRabbit will automatically mark its own review threads as resolved on the next review pass** once it verifies the fixes.
   - **Valid Out-of-Scope Feedback:** If a review suggestion is valid but outside the current PR's scope, create a tracking issue (`gh issue create --title "Refactor: ..." --body "Extracted from PR #<pr_number>. Context: ..." --label "refactor"`) and reply to the CodeRabbit review comment with the new issue number so CodeRabbit can evaluate and resolve the thread itself.
10. **Merge:** Once CodeRabbit resolves all threads, pre-merge checks pass, and the PR is cleanly mergeable, merge it via:
    ```bash
    gh pr merge <pr_number> --squash --delete-branch
    ```
