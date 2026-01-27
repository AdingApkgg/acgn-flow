module.exports = {
  apps: [
    {
      name: "acgn-flow",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/home/i/acgn-flow",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 1270,
      },
      // 自动重启配置
      watch: false,
      max_memory_restart: "1G",
      // 日志配置
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // 重启策略
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
