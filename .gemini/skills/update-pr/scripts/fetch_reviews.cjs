#!/usr/bin/env node

/**
 * Script to wait for the AI review to finish.
 * Returns:
 * 1. Any past reviews that still have unresolved comments.
 * 2. The absolute latest review (regardless of status).
 * Usage: node fetch_reviews.cjs <PR_NUMBER> <REPO> [--new]
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// --- Configuration ---
const INTERVAL_MS = 60 * 1000;       // 1 minute
const TIMEOUT_MS = 15 * 60 * 1000;   // 15 minutes
const TRIGGER_PHRASE = '/gemini review';
const BOT_NAME = 'gemini-code-assist';
const SKIP_PHRASES = [
  "unable to generate a summary",
  "file types involved not being currently supported"
];

// --- Argument Parsing ---
console.error("--- Gemini Review Poller Starting ---");

const args = process.argv.slice(2);
const newFlagIndex = args.indexOf('--new');
const isNewPrMode = newFlagIndex !== -1;

if (isNewPrMode) args.splice(newFlagIndex, 1);

const prNumber = args[0];
const repo = args[1];

if (!prNumber || !repo) {
  console.error("❌ Error: Missing arguments.");
  console.error("Usage: node fetch_reviews.cjs <PR_NUMBER> <REPO> [--new]");
  process.exit(1);
}

// --- Helper Functions ---

/**
 * Pauses execution for a specified duration.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>} A promise that resolves after the specified duration.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a shell command and returns the parsed JSON output.
 * @param {string} command - The shell command to execute.
 * @returns {Promise<Object|Array|null>} The parsed JSON output, or null if empty or failed.
 */
async function execCmd(command) {
  try {
    const { stdout } = await execPromise(command);
    if (!stdout || !stdout.trim()) return null;
    return JSON.parse(stdout);
  } catch (error) {
    const msg = error.message ? error.message.split('\n')[0] : 'Unknown error';
    console.warn(`[Warn] Command failed: ${msg}`);
    return null;
  }
}

/**
 * Checks the status of PR checks and warns if any have failed.
 * Uses JSON output for reliable parsing.
 * @returns {Promise<void>}
 */
async function checkPrChecks() {
  const checks = await execCmd(`gh pr checks ${prNumber} -R ${repo} --json name,state`);
  if (!checks || !Array.isArray(checks)) return;

  // Filter for checks that have explicitly failed
  const failedChecks = checks.filter(c => c.state === 'FAILURE' || c.state === 'STARTUP_FAILURE');

  if (failedChecks.length > 0) {
    console.error("⚠️  Warning: The following PR checks have failed:");
    failedChecks.forEach(c => console.error(`   - ${c.name} (${c.state})`));
  }
}

/**
 * Retrieves the most recent comment from the PR.
 * @returns {Promise<Object|null>} The latest comment object, or null if none exist.
 */
async function getLatestComment() {
  const data = await execCmd(`gh pr view ${prNumber} -R ${repo} --json comments`);
  if (!data || !data.comments || data.comments.length === 0) return null;
  return data.comments[data.comments.length - 1];
}

/**
 * Checks if the bot has explicitly stated it cannot review the PR.
 * Looks in both Comments and Reviews bodies.
 * @returns {Promise<boolean>} True if a skip phrase is found, otherwise false.
 */
async function checkForSkip() {
  const data = await execCmd(`gh pr view ${prNumber} -R ${repo} --json comments,reviews`);
  if (!data) return false;

  /**
   * Helper to check if a body text contains any skip phrases.
   * @param {string} body - The text content to check.
   * @returns {boolean} True if the body contains a skip phrase.
   */
  const checkBody = (body) => body && SKIP_PHRASES.some(phrase => body.includes(phrase));

  if (data.comments && data.comments.some(c => c.author.login === BOT_NAME && checkBody(c.body))) return true;
  if (data.reviews && data.reviews.some(r => r.author.login === BOT_NAME && checkBody(r.body))) return true;

  return false;
}

/**
 * Fetches reviews using --unresolved, but applies custom filtering:
 * - Keep ANY review with actual unresolved comments.
 * - ALWAYS keep the Latest review (even if resolved).
 * @returns {Promise<Array>} An array of filtered review objects.
 */
async function getFilteredReviews() {
  // 1. Fetch from CLI with --unresolved (this gives us the threads)
  const cmd = `gh pr-review review view ${prNumber} -R ${repo} --reviewer ${BOT_NAME} --unresolved`;
  const data = await execCmd(cmd);
  
  const allReviews = (data && data.reviews) ? data.reviews : [];
  if (allReviews.length === 0) return [];

  // 2. Identify the Latest Review ID
  const latestReviewId = allReviews[allReviews.length - 1].id;

  // 3. Filter
  const filtered = allReviews.filter(review => {
    // Condition A: It is the latest review (Keep it regardless of comments)
    if (review.id === latestReviewId) return true;

    // Condition B: It has actual unresolved comments
    // (The CLI --unresolved returns the review object, but we check if the comments array inside is populated)
    const hasComments = review.comments && Array.isArray(review.comments) && review.comments.length > 0;
    
    return hasComments;
  });

  return filtered;
}

// --- Main Logic ---

/**
 * Main execution function to monitor the PR.
 * @returns {Promise<void>}
 */
async function main() {
  // 0. Verify PR Checks status first
  await checkPrChecks();

  const startTime = Date.now();
  let triggerTimestamp = 0; 

  console.error(`🔍 Monitoring PR #${prNumber} in ${repo}`);
  console.error(`   Target Reviewer: ${BOT_NAME}`);
  console.error(`   Mode: ${isNewPrMode ? 'New PR (Immediate Check)' : 'Manual Trigger (/gemini review)'}`);

  // 1. Check Triggers
  if (!isNewPrMode) {
    console.error("   Checking for trigger comment...");
    const latestComment = await getLatestComment();

    if (!latestComment) {
      console.error("   ✖ No comments found in this PR. Exiting.");
      process.exit(0);
    }

    const body = latestComment.body ? latestComment.body.trim().toLowerCase() : "";
    
    if (!body.includes(TRIGGER_PHRASE)) {
      console.error(`   ✖ Latest comment does not contain '${TRIGGER_PHRASE}'. Exiting.`);
      process.exit(0);
    }

    triggerTimestamp = new Date(latestComment.createdAt).getTime();
    console.error(`   ✔ Trigger found! (Timestamp: ${latestComment.createdAt})`);
  } else {
    console.error("   Skipping comment check (assuming new PR).");
  }

  // 2. Check Skip Conditions
  console.error("   Checking for AI skip conditions...");
  if (await checkForSkip()) {
    console.log("ℹ️  AI is unable to review this PR. Exiting.");
    process.exit(0);
  }

  // 3. Establish Baseline
  console.error("   Fetching baseline reviews...");
  const reviews = await getFilteredReviews();
  
  // We extract the IDs to track what we have seen
  const seenIds = new Set(reviews.map(r => r.id));
  
  console.error(`   ℹ️  Baseline established: ${reviews.length} relevant reviews found.`);
  
  // Check if the Latest review in our filtered list is newer than the trigger
  if (reviews.length > 0) {
    const latest = reviews[reviews.length - 1];
    const reviewTime = new Date(latest.submitted_at).getTime();

    if (reviewTime > triggerTimestamp) {
      console.error("\n✅ Review already completed (Found new review after trigger)!");
      // MINIFIED JSON OUTPUT
      console.log(JSON.stringify({ reviews: reviews }, null, 0)); 
      process.exit(0);
    }
  }

  console.error(`   ⏳ Polling every ${INTERVAL_MS/1000}s for ${TIMEOUT_MS/60000}m...`);

  // 4. Polling Loop
  while (true) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.error("\n❌ Timeout reached.");
      process.exit(1);
    }

    await sleep(INTERVAL_MS);
    
    if (await checkForSkip()) {
      console.log("\nℹ️  AI reported it is unable to review. Exiting.");
      process.exit(0);
    }

    const currentReviews = await getFilteredReviews();
    
    // Detect if there is a NEW review ID in the list
    // (We only care if a *new* review appeared, not if an old one was resolved/disappeared)
    const newReviews = currentReviews.filter(r => !seenIds.has(r.id));
    
    if (newReviews.length > 0) {
      console.error(`\n🎉 New review detected!`);
      // MINIFIED JSON OUTPUT
      console.log(JSON.stringify({ reviews: currentReviews }, null, 0)); 
      process.exit(0);
    }
    
    process.stderr.write(".");
  }
}

main().catch(err => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});