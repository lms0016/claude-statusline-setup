#!/bin/bash

# Claude Code hook: 在 git push 前提醒檢查版號和 CHANGELOG

input=$(cat)

# 檢查是否是 git push 命令
if echo "$input" | grep -q '"command"' && echo "$input" | grep -qE 'git\s+push'; then
  last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")

  if [ "$last_tag" != "none" ]; then
    commit_count=$(git rev-list ${last_tag}..HEAD --count 2>/dev/null || echo "0")

    if [ "$commit_count" -gt 0 ]; then
      echo "STOP"
      echo "---"
      echo "偵測到 git push！自上次發版 ($last_tag) 以來有 $commit_count 個新 commits。"
      echo ""
      echo "請先完成以下事項："
      echo "1. 更新 package.json 版號"
      echo "2. 更新 CHANGELOG.md"
      echo "3. commit 這些變更"
      echo ""
      echo "最近的 commits："
      git log ${last_tag}..HEAD --oneline 2>/dev/null
      exit 0
    fi
  fi
fi

echo "PROCEED"
