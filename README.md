# System Monitor

通用系统监控控制程序 - 基于 Memory Cockpit 改造

## 功能特性

### 监控功能
- 📊 系统资源监控 (CPU、内存、磁盘、负载)
- 🔧 进程和服务管理
- 🌐 网络连接和端口监控
- 📦 项目管理

### OpenClaw 集成
- 💬 对话管理 (创建、查看、发送消息)
- ✅ 权限审批
- 📤 分享处理 (链接、文本、文件)

### 控制功能
- ⚡ 快捷命令执行 (基于白名单)
- 🔄 服务启停控制
- 📋 操作历史记录

## 快速开始

### 服务器端

1. 安装依赖:
```bash
npm install
```

2. 启动服务器:
```bash
npm start
```

服务器将在 `http://0.0.0.0:18489` 启动

3. 访问 Web 界面:
```
http://localhost:18489
```

### Android 应用

#### 从 GitHub Actions 下载

1. 访问 [Actions](../../actions) 页面
2. 选择最新的成功构建
3. 下载 `system-monitor-debug-apk` 或 `system-monitor-release-apk`
4. 解压并安装 APK

#### 从 Release 下载

如果有 Release 版本,可以直接从 [Releases](../../releases) 页面下载

#### 手动构建

```bash
# 安装 Capacitor 依赖
npm install

# 初始化 Android 项目
npx cap init “System Monitor” “com.deck.systemmonitor” --web-dir=public
npx cap add android

# 同步代码
npx cap sync android

# 构建 APK
cd android
./gradlew assembleDebug
```

APK 位置: `android/app/build/outputs/apk/debug/app-debug.apk`

## 配置

### 服务器配置

编辑 `config/default.json`:

```json
{
  “server”: {
    “port”: 18489,
    “host”: “0.0.0.0”
  },
  “security”: {
    “apiTokenRequired”: false,
    “apiToken”: “”
  }
}
```

### 服务列表

编辑 `config/services.json` 添加要监控的服务

### 命令白名单

编辑 `config/commands.json` 添加允许执行的命令

## API 端点

### 系统监控
- `GET /api/health` - 健康检查
- `GET /api/dashboard` - 仪表盘数据
- `GET /api/system/metrics` - 系统指标

### OpenClaw 对话
- `GET /api/chat/conversations` - 获取对话列表
- `POST /api/chat/conversations` - 创建新对话
- `GET /api/chat/conversations/:id` - 获取对话详情
- `POST /api/chat/conversations/:id/message` - 发送消息
- `DELETE /api/chat/conversations/:id` - 删除对话

### 权限管理
- `GET /api/chat/pending-permissions` - 获取待审批权限
- `POST /api/chat/permissions/:id/approve` - 批准权限
- `POST /api/chat/permissions/:id/reject` - 拒绝权限

### 分享处理
- `POST /api/share/link` - 接收分享的链接
- `POST /api/share/text` - 接收分享的文本
- `POST /api/share/file` - 接收分享的文件
- `GET /api/share/history` - 获取分享历史

### 命令执行
- `GET /api/control/commands` - 获取命令列表
- `POST /api/control/command/execute` - 执行命令

## 开发

### 运行测试

```bash
npm test
```

使用 Playwright 进行自动化测试

### 项目结构

```
.
├── server.js              # 主服务器
├── modules/               # 后端模块
│   ├── config-manager.js
│   ├── system-monitor.js
│   ├── openclaw-chat.js
│   ├── permission-manager.js
│   ├── share-handler.js
│   └── command-executor.js
├── config/                # 配置文件
│   ├── default.json
│   ├── services.json
│   └── commands.json
├── public/                # 前端文件
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── android/               # Android 项目 (Capacitor 生成)
```

## 部署

### systemd 服务

创建 `~/.config/systemd/user/system-monitor.service`:

```ini
[Unit]
Description=System Monitor Web Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/memory-cockpit
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=”NODE_ENV=production”

[Install]
WantedBy=default.target
```

启用服务:
```bash
systemctl --user daemon-reload
systemctl --user enable system-monitor.service
systemctl --user start system-monitor.service
```

## 技术栈

- **后端**: Node.js (原生 HTTP 服务器)
- **前端**: 原生 HTML/CSS/JS
- **移动端**: Capacitor
- **测试**: Playwright
- **CI/CD**: GitHub Actions

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request!

## 更新日志

### v1.0.0 (2026-03-09)
- ✅ 完成后端模块化重构
- ✅ 实现 OpenClaw 对话管理
- ✅ 添加权限审批功能
- ✅ 实现分享处理
- ✅ 添加命令执行功能
- ✅ 完成前端 UI 重构
- ✅ 通过 Playwright 自动化测试
- ✅ 配置 GitHub Actions 自动构建

---

## 原 Memory Cockpit 功能

第一版综合驾驶舱原型保留功能:

- 读取 OpenViking 用户记忆目录
- 自动按主题分组为”项目/主题”卡片
- 展示近期 daily memory 日志
- 展示关键上下文文件体积
- 展示服务状态、端口占用、重点进程、主机资源
- 提供项目续接和动作日志接口

