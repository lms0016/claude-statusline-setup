# Claude Code 專案指引

## Git Push 流程

本專案有 pre-push hook，會在 push 前檢查是否有未發版的 commits。

當 hook 阻止 push 時：
1. 詢問用戶要「完成發版」還是「跳過檢查」
2. 如果選擇跳過：
   - 執行 `touch /tmp/.skip-version-check`
   - 執行 `git push`
   - **push 成功後，執行 `rm -f /tmp/.skip-version-check` 確保清理**
