/**
 * PM2 Ecosystem configuration file.
 * Manages the deployment and runtime configuration for different environments.
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'djs-site-watcher',
      script: 'src/bot.js',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'djs-site-watcher-staging',
      script: 'src/bot.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
