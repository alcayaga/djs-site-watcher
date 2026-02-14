#!/usr/bin/env node

/**
 * Script to wait for the AI review to finish.
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
 * @returns {Promise<Object|null>} The parsed JSON output, or null if empty or failed.
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
  // Fetch both comments and reviews to be thorough
  const data = await execCmd(`gh pr view ${prNumber} -R ${repo} --json comments,reviews`);
  if (!data) return false;

  /**
   * Helper to check if a body text contains any skip phrases.
   * @param {string} body - The text content to check.
   * @returns {boolean} True if the body contains a skip phrase.
   */
  const checkBody = (body) => body && SKIP_PHRASES.some(phrase => body.includes(phrase));

  // 1. Check Comments
  if (data.comments && data.comments.some(c => c.author.login === BOT_NAME && checkBody(c.body))) {
    return true;
  }

  // 2. Check Reviews
  if (data.reviews && data.reviews.some(r => r.author.login === BOT_NAME && checkBody(r.body))) {
    return true;
  }

  return false;
}

/**
 * Fetches reviews that are either 'CHANGES_REQUESTED' or contain unresolved comments.
 * @returns {Promise<Array>} An array of unresolved review objects.
 */
async function getReviews() {
  const cmd = `gh pr-review review view ${prNumber} -R ${repo} --reviewer ${BOT_NAME} --unresolved`;
  const data = await execCmd(cmd);
  
  const allReviews = (data && data.reviews) ? data.reviews : [];

  return allReviews.filter(review => {
    const isBlocking = review.state === 'CHANGES_REQUESTED';
    const hasUnresolvedComments = review.comments && 
                                  Array.isArray(review.comments) && 
                                  review.comments.some(c => c.is_resolved === false);
    
    return isBlocking || hasUnresolvedComments;
  });
}

/**
 * Counts the total number of unresolved threads across all reviews.
 * @param {Array} reviews - The list of review objects to check.
 * @returns {number} The total count of unresolved threads or blocking reviews.
 */
function countUnresolvedThreads(reviews) {
  let count = 0;
  reviews.forEach(r => {
    if (r.state === 'CHANGES_REQUESTED' && (!r.comments || r.comments.length === 0)) {
      count++;
    } 
    else if (r.comments) {
      count += r.comments.filter(c => c.is_resolved === false).length;
    }
  });
  return count;
}

// --- Main Logic ---

/**
 * Main execution function to monitor the PR.
 * @returns {Promise<void>}
 */
async function main() {
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

  // 2. Check for "Unable to Review" condition immediately
  console.error("   Checking for AI skip conditions (unsupported files)...");
  if (await checkForSkip()) {
    console.log("ℹ️  AI is unable to review this PR (unsupported files). Exiting immediately.");
    process.exit(0);
  }

  // 3. Initial State Check
  console.error("   Fetching baseline reviews...");
  const reviews = await getReviews();
  const threadCount = countUnresolvedThreads(reviews);

  console.error(`   ℹ️  Found ${threadCount} unresolved items (across ${reviews.length} reviews).`);
  
  const completedReview = reviews.find(r => {
    const reviewTime = new Date(r.submitted_at).getTime();
    return reviewTime > triggerTimestamp;
  });

  if (completedReview) {
    console.error("\n✅ Unresolved review found!");
    console.log(JSON.stringify(reviews)); 
    process.exit(0);
  }

  // 4. Baseline IDs
  const seenIds = new Set(reviews.map(r => r.id));
  console.error(`   Baseline established. Waiting for NEW reviews...`);
  console.error(`   ⏳ Polling every ${INTERVAL_MS/1000}s for ${TIMEOUT_MS/60000}m...`);

  // 5. Polling Loop
  while (true) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.error("\n❌ Timeout reached.");
      process.exit(1);
    }

    await sleep(INTERVAL_MS);
    
    // Check for skip condition inside the loop as well
    if (await checkForSkip()) {
      console.log("\nℹ️  AI reported it is unable to review. Exiting.");
      process.exit(0);
    }

    const currentReviews = await getReviews();
    const newReviews = currentReviews.filter(r => !seenIds.has(r.id));
    
    if (newReviews.length > 0) {
      const newCount = countUnresolvedThreads(newReviews);
      console.error(`\n🎉 New review detected! (${newCount} new unresolved items)`);
      console.log(JSON.stringify(currentReviews)); 
      process.exit(0);
    }
    
    process.stderr.write(".");
  }
}

main().catch(err => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});