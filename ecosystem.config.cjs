module.exports = {
  apps: [
    {
      name: "acgn-flow",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/home/i/acgn-flow",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 1270,
      },
      // 自动重启配置
      watch: false,
      max_memory_restart: "2G",
      // 日志配置
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // 重启策略
      exp_backoff_restart_delay: 500,
      max_restarts: 15,
      min_uptime: "30s",
      // 优雅关闭
      kill_timeout: 5000,
      // 自动重启
      autorestart: true,
    },
  ],
};
