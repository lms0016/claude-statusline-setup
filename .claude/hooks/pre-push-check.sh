#!/bin/bash

# Claude Code hook: 在 git push 前提醒檢查版號和 CHANGELOG
# 設定 SKIP_VERSION_CHECK=1 可跳過檢查

input=$(cat)

# 如果設定了跳過檢查的環境變數，直接允許
if [ "$SKIP_VERSION_CHECK" = "1" ]; then
  echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}'
  exit 0
fi

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

      # 使用 JSON 格式阻止並提示
      cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "自上次發版 ($last_tag) 以來有 $commit_count 個新 commits: $recent_commits"
  }
}
EOF
      exit 0
    fi
  fi
fi

# 允許執行
echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}'
