# GitHub Actions 自动打包 APK 设置指南

## 前提条件

1. 拥有 GitHub 账号
2. 安装了 git 和 gh CLI (GitHub CLI)

## 步骤 1: 创建 GitHub 仓库

### 方法 A: 使用 GitHub CLI (推荐)

```bash
cd /home/deck/.openclaw/workspace/apps/memory-cockpit

# 登录 GitHub (如果还没登录)
gh auth login

# 创建新仓库
gh repo create system-monitor --public --source=. --remote=origin --push

# 或者创建私有仓库
gh repo create system-monitor --private --source=. --remote=origin --push
```

### 方法 B: 手动创建

1. 访问 https://github.com/new
2. 仓库名称: `system-monitor`
3. 选择 Public 或 Private
4. 不要初始化 README (我们已经有了)
5. 点击 "Create repository"

然后在本地执行:

```bash
cd /home/deck/.openclaw/workspace/apps/memory-cockpit

# 添加远程仓库 (替换 YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/system-monitor.git

# 提交所有更改
git add .
git commit -m "feat: 完成 System Monitor v1.0.0

- 后端模块化重构
- OpenClaw 对话管理
- 权限审批功能
- 分享处理
- 命令执行
- 前端 UI 重构
- GitHub Actions 自动构建配置
"

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 步骤 2: 启用 GitHub Actions

推送代码后,GitHub Actions 会自动运行。你可以:

1. 访问你的仓库页面
2. 点击 "Actions" 标签
3. 查看构建进度

## 步骤 3: 下载 APK

### 从 Actions 下载

1. 等待构建完成 (大约 5-10 分钟)
2. 点击成功的构建任务
3. 滚动到底部的 "Artifacts" 部分
4. 下载 `system-monitor-debug-apk`
5. 解压 ZIP 文件得到 APK

### 从 Release 下载 (可选)

如果你想创建正式版本:

```bash
# 创建 tag
git tag v1.0.0
git push origin v1.0.0
```

这会触发 Release 构建,APK 会自动附加到 Release 页面。

## 步骤 4: 安装 APK

1. 将 APK 传输到 Android 设备
2. 在设备上启用"未知来源"安装
3. 点击 APK 文件安装

## 步骤 5: 配置应用

安装后,你需要配置服务器地址:

1. 确保服务器正在运行: `npm start`
2. 获取服务器 IP 地址 (局域网或 Tailscale)
3. 在应用中配置服务器 URL: `http://YOUR_IP:18489`

## 自动构建触发条件

GitHub Actions 会在以下情况自动构建:

- 推送到 `main` 或 `master` 分支
- 创建 Pull Request
- 创建 tag (如 `v1.0.0`)
- 手动触发 (在 Actions 页面点击 "Run workflow")

## 手动触发构建

1. 访问仓库的 Actions 页面
2. 选择 "Build Android APK" 工作流
3. 点击 "Run workflow" 按钮
4. 选择分支
5. 点击绿色的 "Run workflow" 按钮

## 构建产物

每次构建会生成:

- `system-monitor-debug.apk` - Debug 版本 (可直接安装)
- `system-monitor-release-unsigned.apk` - Release 版本 (未签名)

Debug 版本可以直接安装使用。Release 版本需要签名才能安装。

## 签名 Release APK (可选)

如果需要签名的 Release 版本,需要:

1. 生成 keystore
2. 在 GitHub 仓库设置中添加 Secrets
3. 修改 GitHub Actions 工作流添加签名步骤

详细步骤见: https://developer.android.com/studio/publish/app-signing

## 故障排查

### 构建失败

1. 查看 Actions 日志
2. 检查是否有语法错误
3. 确保所有依赖都在 package.json 中

### APK 无法安装

1. 确保启用了"未知来源"安装
2. 检查 Android 版本兼容性 (最低 Android 5.0)
3. 尝试卸载旧版本后重新安装

### 应用无法连接服务器

1. 确保服务器正在运行
2. 检查防火墙设置
3. 确保设备和服务器在同一网络
4. 或使用 Tailscale 等 VPN 连接

## 下一步优化

1. 添加应用图标和启动画面
2. 配置签名证书用于 Release 构建
3. 添加自动版本号管理
4. 实现应用内服务器配置界面
5. 添加推送通知功能

## 相关链接

- [Capacitor 文档](https://capacitorjs.com/)
- [GitHub Actions 文档](https://docs.github.com/actions)
- [Android 开发文档](https://developer.android.com/)
