module.exports = {
  apps: [
    {
      name: "acgn-flow",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "/home/i/acgn-flow",
      interpreter: "bun",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 1270,
      },
      // 自动重启配置
      watch: false,
      max_memory_restart: "2G", // 提高内存限制，减少因内存触发的频繁重启
      // 日志配置
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
      // 重启策略 - 更宽松的重启策略
      exp_backoff_restart_delay: 500, // 重启延迟从 100ms 增加到 500ms
      max_restarts: 15, // 增加最大重启次数
      min_uptime: "30s", // 增加最小运行时间判定
      // 优雅关闭
      kill_timeout: 5000, // 给 5 秒时间优雅关闭
      // 自动重启
      autorestart: true,
    },
  ],
};
