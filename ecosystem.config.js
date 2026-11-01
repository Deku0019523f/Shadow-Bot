// PM2 : pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'shadow-bot',
      script: 'index.js',
      autorestart: true,
      max_memory_restart: '600M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' },
    },
  ],
}
