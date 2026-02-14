# Project: Discord Site Watcher
Discord bot for monitoring website changes and Apple services.

## Project Overview

- **Purpose:** A Discord bot utilizing web scraping and cron jobs to monitor Apple services (Carrier Bundles, Apple Pay, eSIM, Features), Solotodo deal
and general website changes, alerting users via Discord. It also supports modular channel handlers for specific behaviors like Q&A and Deals moderation
- **Main Technologies:**
  - **Runtime:** Node.js (>=22.0.0)
  - **Language:** JavaScript
  - **Testing:** Jest
  - **Linting/Formatting:** ESLint
- **Architecture:** Standard Node.js project structure
  - `src/monitors` for specific monitoring logic (Site, Apple services, Deals).
  - `src/commands` for Discord Slash Command definitions and execution.
  - `src/channels` for specialized channel behavior handlers.
  - `src/handlers` for managing Discord interactions and messages.
  - `config/` for JSON-based configuration and state management.


## Building and Running

- **Install Dependencies:** `npm install`
- **Deploy Discord Commands:** `npm run deploy`
- **Run in Development:** `npm run start`
- **Run in Debug Mode:** `npm run debug` (Enables Node.js inspector)


## Testing and Quality

- **Test Commands:**
  - **Unit (All):** `npm run test`
  - **System:** `npm run start`
- **Full Validation:** `npm run preflight` (Heaviest check; runs clean, install,
  lint, and tests. Recommended before submitting PRs.)
- **Individual Checks:** `npm run lint`


## Development Conventions

- **Pull Requests:** Keep PRs small, focused, and linked to an existing issue.
  Always activate the `pr-creator` skill for PR generation, even when using the
  `gh` CLI.
- **Commit Messages:** Follow the
  [Conventional Commits](https://www.conventionalcommits.org/) standard.
- **Coding Style:** Adhere to existing patterns, comments MUST be in **English**
  (variable names, commit messages, JSDoc, inline comments).
- **UI/User-Facing Text:** MUST be in **Spanish** (e.g., Discord embed titles, 
  descriptions, error messages sent to users).
- To avoid shell escaping issues with multi-line Markdown, you **MUST** escape backticks.
- Actively identify technical debt and propose architectural improvements or
  modernizations alongside your implementation tasks.


## Documentation

- **Project Docs:** Update `README.md` whenever features are added, setup steps
  change, or configuration parameters are modified.
- **Code Docs:** All new functions and classes **must** have JSDoc comments.
- **Inline Docs:** Comments should focus on the **"Why"** (reasoning/intent), not the "What" (syntax).



## Interaction & Git Workflow
Always activate the `pr-creator` skill for PR generation, even when using the
  `gh` CLI.

- **Bug Fixes & Simple Changes (TDD Style):** Test First. Write/modify the test case to 
  reproduce the bug.
- **Atomic Commits:** Adhere to the "One Idea = One Commit" rule. Isolate features, bug fixes, and refactors.


### PR Cycle & CI/CD Loop
Once the PR is created with the `pr-creator` skill, you are going to get the results of the PR checks and a Code Review.

1.  **Code Review:**
    * **Out of Scope:** If a review request is valid but outside the current PR's scope:
        * **Create Issue:** Create a detailed issue with full context. You MUST tag relevant labels and mention the source PR.
        * `gh issue create --title "Refactor: ..." --body "Extracted from PR #123. Context: ..." --label "refactor"`
        * **Resolve:** `gh pr-review threads resolve ...` with body "Moved to issue #XYZ".
    * **Reply (Contextual):** If you need to reply to a specific thread:
        * `gh pr-review comments reply <PR-NUMBER> ... --body "Your reply."`
        * *Note:* Adding `/gemini review` here ONLY request feedback about that specific thread.
    * **Resolve:** If you fixed the code issue:
        * `gh pr-review threads resolve -R alcayaga/djs-site-watcher <PR-NUMBER> --thread-id <PRRT_ID>`

2.  **Loop:**
    If you made code changes to resolve a feedback review. After the changes are made, then you must always activate the `update-pr` skill
    in order to commit new changes to an existing pull request.

    After the skill is executed, you are going to get the results of the PR checks and a new Code Review. Iterate on the feedback
    as described on the last section.

The loop ends once there are no more unattended reviews or after 5 iterations as long as there is only medium priority reviews or lower.

## Testing Strategy Rules
When validating changes, ALWAYS follow this strict execution order:

1. **Targeted Unit Test:**
   - Run the specific test file: `npm test -- path/to/specific.test.js`
   - **Mocks:** Leverage the `__mocks__` directory when mocking external dependencies or modules.
   - Goal: Fail fast.

2. **Full Validation:**
   - Execute only if targeted test passes: `npm run preflight`


## Troubleshooting
If you need access to Production data, you can access the server using `ssh gemini-cli@home.alcayaga.net`

* Enviroment location: `/home/pi/bin/djs-site-watcher`
* Logs: `/home/pi/.pm2/logs`
