module.exports = {
  apps: [
    {
      name: "carrot-demo",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3002,
        NEXT_PUBLIC_BASE_PATH: "/demo-app",
        AUTH_COOKIE_NAME: "pmn-demo-token",
        AUTH_COOKIE_PATH: "/demo-app",
        DEMO_MODE: "true",
      },
      kill_timeout: 10000,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
