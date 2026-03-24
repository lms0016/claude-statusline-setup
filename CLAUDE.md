# Claude Code 專案指引

## Git Push 流程

本專案有 pre-push hook，會在 push 前檢查是否有未發版的 commits。

Release commit（`chore: release vX.Y.Z`）會由 hook 自動建立對應的 git tag。
Push 時使用 `git push --tags` 將 tag 一併推上去。

當 hook 阻止 push 時：

1. 詢問用戶要「完成發版」還是「跳過檢查」
2. 如果選擇跳過：
   - 執行 `touch /tmp/.skip-version-check`
   - 執行 `git push`
   - **push 成功後，執行 `rm -f /tmp/.skip-version-check` 確保清理**
