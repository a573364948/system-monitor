#!/bin/bash

# System Monitor - GitHub 推送脚本

echo "🚀 System Monitor GitHub 推送向导"
echo "=================================="
echo ""

# 检查是否安装了 gh CLI
if command -v gh &> /dev/null; then
    echo "✅ 检测到 GitHub CLI (gh)"
    echo ""
    echo "选择推送方式:"
    echo "1) 使用 gh CLI 自动创建仓库并推送 (推荐)"
    echo "2) 手动输入 GitHub 仓库 URL"
    read -p "请选择 (1/2): " choice

    if [ "$choice" = "1" ]; then
        echo ""
        echo "📝 创建 GitHub 仓库..."
        echo ""
        read -p "仓库名称 [system-monitor]: " repo_name
        repo_name=${repo_name:-system-monitor}

        read -p "仓库类型 (public/private) [public]: " repo_type
        repo_type=${repo_type:-public}

        echo ""
        echo "正在创建仓库: $repo_name ($repo_type)"

        cd /tmp/system-monitor-repo

        if [ "$repo_type" = "private" ]; then
            gh repo create "$repo_name" --private --source=. --remote=origin --push
        else
            gh repo create "$repo_name" --public --source=. --remote=origin --push
        fi

        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ 成功推送到 GitHub!"
            echo ""
            echo "📦 查看仓库:"
            gh repo view --web
            echo ""
            echo "🔧 查看 Actions 构建:"
            echo "   gh run list"
            echo "   gh run watch"
            echo ""
            echo "📥 下载 APK:"
            echo "   1. 访问 Actions 页面"
            echo "   2. 等待构建完成 (约 5-10 分钟)"
            echo "   3. 下载 Artifacts 中的 APK"
        else
            echo "❌ 推送失败，请检查错误信息"
            exit 1
        fi
    else
        manual_push
    fi
else
    echo "⚠️  未检测到 GitHub CLI"
    echo "   安装方法: https://cli.github.com/"
    echo ""
    manual_push
fi

function manual_push() {
    echo "📝 手动推送模式"
    echo ""
    echo "步骤:"
    echo "1. 访问 https://github.com/new 创建新仓库"
    echo "2. 仓库名称: system-monitor"
    echo "3. 不要初始化 README"
    echo "4. 创建后复制仓库 URL"
    echo ""
    read -p "请输入仓库 URL (例如: https://github.com/username/system-monitor.git): " repo_url

    if [ -z "$repo_url" ]; then
        echo "❌ 未输入仓库 URL"
        exit 1
    fi

    cd /tmp/system-monitor-repo
    git remote add origin "$repo_url"
    git branch -M main
    git push -u origin main

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ 成功推送到 GitHub!"
        echo ""
        echo "📦 访问仓库: $repo_url"
        echo ""
        echo "🔧 查看 Actions:"
        echo "   ${repo_url%.git}/actions"
        echo ""
        echo "📥 下载 APK:"
        echo "   1. 访问 Actions 页面"
        echo "   2. 等待构建完成 (约 5-10 分钟)"
        echo "   3. 下载 Artifacts 中的 APK"
    else
        echo "❌ 推送失败，请检查错误信息"
        exit 1
    fi
}

echo ""
echo "📚 更多信息请查看: GITHUB_ACTIONS_GUIDE.md"
