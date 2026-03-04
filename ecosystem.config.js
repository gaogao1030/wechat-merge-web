module.exports = {
  apps: [{
    name: 'wechat-merge-web',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 9001,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_memory_restart: '500M',
  }],

  deploy: {
    production: {
      user: 'gaogao',                                          // 服务器登录用户
      host: 'qq.shanghai',                               // 服务器 IP 或域名
      ref: 'origin/main',                                   // 拉取的分支
      repo: 'git@github.com:gaogao1030/wechat-merge-web.git', // SSH 格式仓库地址
      path: '/data/www/wechat-merge-web',                    // 服务器上的部署目录
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && mkdir -p logs && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    }
  }
};
