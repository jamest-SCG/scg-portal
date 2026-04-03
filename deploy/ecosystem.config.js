module.exports = {
  apps: [{
    name: 'scg-portal',
    script: 'server/index.js',
    cwd: '/var/www/scg-portal',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/scg-portal/error.log',
    out_file: '/var/log/scg-portal/out.log',
  }],
};
