/**
 * PM2 Ecosystem configuration file.
 * Manages the deployment and runtime configuration for different environments.
 *
 * Usage:
 * - Production: TARGET_ENV=production pm2 start ecosystem.config.js --env production
 * - Staging:    TARGET_ENV=staging pm2 start ecosystem.config.js --env staging
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

const rawEnv = process.env.TARGET_ENV || 'production';
// Sanitize to allow only alphanumeric characters, hyphens, and underscores, preventing path traversal.
// Normalize to lowercase for consistency (e.g., 'Staging' -> 'staging').
const targetEnv = rawEnv.toLowerCase().replace(/[^a-z0-9_-]/g, '');

if (!targetEnv) {
  throw new Error(`Invalid TARGET_ENV: '${rawEnv}' results in an empty environment name.`);
}

const isProduction = targetEnv === 'production';

module.exports = {
  apps: [
    {
      name: isProduction ? 'djs-site-watcher' : `djs-site-watcher-${targetEnv}`,
      script: 'src/bot.js',
      // Automatic recovery & stability settings
      max_memory_restart: '300M',      // Prevents OOM crashes from slow leaks
      exp_backoff_restart_delay: 100,  // Prevents CPU exhaustion during rapid crash loops
      max_restarts: 10,                // Halts process if crash loop is unrecoverable
      min_uptime: 5000,                // Ensures process establishes connections before marking online
      kill_timeout: 5000,              // Gives client.destroy() enough time to cleanly close connections
      // Common environment variables
      env: {
        NODE_ENV: 'production',
        APP_ENV: targetEnv,
      },
      // Environment-specific overrides
      env_production: {
        // Add production-specific vars here
      },
      env_staging: {
        // Add staging-specific vars here
      },
    },
  ],
};
