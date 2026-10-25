module.exports = {
  apps: [
    {
      name: "acgn-flow",
      script: "build/server/index.js",
      interpreter: process.env.BUN_BIN || "/home/i/.bun/bin/bun",
      cwd: "/home/i/acgn-flow",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: 1270, HOST: "127.0.0.1" },
      watch: false,
      max_memory_restart: "2G",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      exp_backoff_restart_delay: 500,
      max_restarts: 15,
      min_uptime: "30s",
      kill_timeout: 5000,
      autorestart: true,
    },
  ],
};
