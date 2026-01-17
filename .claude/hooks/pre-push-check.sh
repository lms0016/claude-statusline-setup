#!/bin/bash

# Claude Code hook: 在 git push 前提醒檢查版號和 CHANGELOG

input=$(cat)

# 使用 jq 安全地提取命令（如果沒有 jq 則用 grep）
if command -v jq &> /dev/null; then
  cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
else
  # fallback: 用 grep 提取
  cmd=$(echo "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"\(.*\)"/\1/')
fi

# 檢查是否是 git push 命令
if echo "$cmd" | grep -qE 'git\s+(-C\s+\S+\s+)?push(\s|$)'; then
  last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")

  if [ "$last_tag" != "none" ]; then
    commit_count=$(git rev-list ${last_tag}..HEAD --count 2>/dev/null || echo "0")

    if [ "$commit_count" -gt 0 ]; then
      # 取得最近的 commits
      recent_commits=$(git log ${last_tag}..HEAD --oneline 2>/dev/null | sed 's/"/\\"/g' | tr '\n' ' ')

      # 使用 JSON 格式輸出來阻止工具執行
      cat <<EOF
{
  "decision": "block",
  "reason": "偵測到 git push！自上次發版 ($last_tag) 以來有 $commit_count 個新 commits。\\n\\n請先完成以下事項：\\n1. 更新 package.json 版號\\n2. 更新 CHANGELOG.md\\n3. 新增 git tag\\n4. commit 這些變更\\n\\n最近的 commits: $recent_commits"
}
EOF
      exit 0
    fi
  fi
fi

# 允許執行
echo '{"decision": "allow"}'
