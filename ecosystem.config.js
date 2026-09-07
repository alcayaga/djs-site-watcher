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
      max_memory_restart: '300M',      // Restart if memory exceeds 300MB
      exp_backoff_restart_delay: 100,  // Exponential backoff for restarts starting at 100ms
      max_restarts: 10,                // Max restarts before marking as errored
      min_uptime: 5000,                // App must stay up for 5s to be considered online
      kill_timeout: 5000,              // Wait 5s before sending SIGKILL after SIGINT
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
