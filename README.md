# 微信聊天记录合并工具

上传两个 JSON 文件，在线合并导出为 TXT，服务器不保留任何数据。

## 功能

- 上传 `users.json`（用户信息）和聊天记录 JSON，自动合并输出
- 支持按日期范围筛选
- 支持引用回复、内联表情格式化
- 文件在内存中处理，处理完毕即释放，不落盘

## 本地运行

```bash
npm install
npm start
# 访问 http://localhost:3000
```

## 服务器部署

**环境要求：** Node.js 18+、PM2、Nginx

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/wechat-merge-web.git
cd wechat-merge-web

# 2. 安装依赖
npm install --production

# 3. 启动服务
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

**Nginx 配置（反向代理）：**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 210m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout    300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout    300s;
    }
}
```

**后续更新：**

```bash
git pull
pm2 restart wechat-merge-web
```

## 技术栈

- Node.js + Express
- Multer（内存模式文件上传）
- 纯原生前端，无框架依赖
