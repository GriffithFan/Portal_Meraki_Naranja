module.exports = {
  apps: [
    {
      name: "carrot",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      kill_timeout: 10000,
      max_restarts: 10,
      restart_delay: 5000,
      // 1024M: con 512M los picos de subidas concurrentes forzaban reinicios
      // que cortaban requests en vuelo (connection refused en nginx).
      max_memory_restart: "1024M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
