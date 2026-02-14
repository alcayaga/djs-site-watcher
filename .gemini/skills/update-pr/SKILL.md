---
name: update-pr
description: Use this skill when you need to commit new changes to an existing pull request (PR). It ensures all PRs
  follow the repository's established templates and standards.
---

# Update PR Cycle

This skill automates the mandatory feedback loop for PRs in this repository, ensuring that CI/CD passes and AI reviews are fetched correctly.

## Workflow

Follow these steps to commit new changes to an existing Pull Request:

1.  **Branch Management**: **CRITICAL:** Ensure you are NOT working on the
    `master` branch.
    - Run `git branch --show-current`.
    - If the current branch is `master`, you MUST identify the previous branch and switch to it:
      ```bash
      git checkout -b <branch-name>
      ```

2.  **Commit Changes**: Verify that all intended changes are committed.
    - Run `git status` to check for unstaged or uncommitted changes.
    - If there are uncommitted changes, stage and commit them with a descriptive
      message before proceeding. NEVER commit directly to `master`.
      ```bash
      git add .
      git commit -m "type(scope): description"
      ```

5.  **Draft Comment**: Create a comment with clear, concise summaries of your
      changes.

6.  **Preflight Check**: Before pushing the branch, run the workspace preflight
    script to ensure all build, lint, and test checks pass.
    ```bash
    npm run preflight
    ```
    If any checks fail, address the issues before proceeding to push the changes.

7.  **Push Branch**: Push the current branch to the remote repository.
    **CRITICAL SAFETY RAIL:** Double-check your branch name before pushing.
    NEVER push if the current branch is `master`.
    ```bash
    # Verify current branch is NOT master
    git branch --show-current
    # Push non-interactively
    git push -u origin HEAD
    ```

8.  **Comment to the PR**: Use the `gh` CLI to create a new comment on the PR.
    At the end of the commit you must append the command `/gemini review`.
    To avoid shell escaping issues with multi-line Markdown, you **MUST** escape backticks
    ```bash
    gh pr comment <PR_NUMBER> --body "Updated legacy global check in \`interactionHandler.js\` /gemini review"
    ```

9.  **CI/CD Check**: Use the `gh` CLI to verify that all the PR checks have passed.

    ```bash
    gh pr checks <PR_NUMBER> --watch -i 10
    ```

10. **Fetch Unresolved Reviews**: Fetch any unresolved feedback to address in the next iteration.

    ```bash
    node scripts/fetch_reviews.cjs <PR_NUMBER> <REPO>
    ```


## Principles

- **Safety First**: NEVER push to `master`. This is your highest priority.
- If `fetch_reviews.cjs` shows nNo unresolved reviews, the PR may be ready for merging or manual review.


## Resources

### scripts/
- `fetch_reviews.cjs`: Fetches and parses reviews from `gemini-code-assist`.
