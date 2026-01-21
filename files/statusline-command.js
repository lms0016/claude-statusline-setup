#!/usr/bin/env node

/**
 * Claude Code Statusline - 顯示 session 使用量資訊
 *
 * 輸出格式：
 *   Opus · main ✓ · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
 *   ~/Projects/myapp
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

// ============================================================================
// 設定
// ============================================================================

const CACHE_FILE = path.join(os.tmpdir(), 'claude-usage-cache.json');
const CACHE_TTL = 300; // 快取有效期（秒）
const API_URL = 'https://api.anthropic.com/api/oauth/usage';
const TIMEZONE_OFFSET = 8; // Asia/Taipei UTC+8
const DEFAULT_CONTEXT_SIZE = 200000;

// ============================================================================
// ANSI 色碼
// ============================================================================

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const ORANGE = '\x1b[38;5;208m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const SEP = ` ${DIM}·${RESET} `;

// ============================================================================
// 顏色判斷
// ============================================================================

function getColor(percentage) {
  if (percentage >= 80) return RED;
  if (percentage >= 50) return YELLOW;
  return GREEN;
}

function getContextColor(percentage) {
  if (percentage >= 80) return RED;
  if (percentage >= 70) return ORANGE;
  if (percentage >= 50) return YELLOW;
  return GREEN;
}

// ============================================================================
// Token 相關
// ============================================================================

function getTokenFromKeychain() {
  // Windows 不支援 macOS Keychain
  if (process.platform === 'win32') {
    return null;
  }

  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result) {
      const creds = JSON.parse(result);
      return creds?.claudeAiOauth?.accessToken || null;
    }
  } catch {
    // Keychain 存取失敗，忽略
  }
  return null;
}

function getTokenFromFile() {
  const credsFile = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    if (fs.existsSync(credsFile)) {
      const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      return creds?.claudeAiOauth?.accessToken || null;
    }
  } catch {
    // 檔案讀取失敗，忽略
  }
  return null;
}

function getToken() {
  return getTokenFromKeychain() || getTokenFromFile();
}

// ============================================================================
// API 與快取
// ============================================================================

function fetchUsage(token) {
  return new Promise((resolve) => {
    const url = new URL(API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/2.0.32',
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() / 1000 - (cache.timestamp || 0) < CACHE_TTL) {
        return cache.data;
      }
    }
  } catch {
    // 快取讀取失敗，忽略
  }
  return null;
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      timestamp: Date.now() / 1000,
      data,
    }));
  } catch {
    // 快取寫入失敗，忽略
  }
}

// ============================================================================
// 格式化工具
// ============================================================================

function formatHour(hour, minute) {
  let hourStr, ampm;
  if (hour === 0) {
    hourStr = '12'; ampm = 'am';
  } else if (hour < 12) {
    hourStr = String(hour); ampm = 'am';
  } else if (hour === 12) {
    hourStr = '12'; ampm = 'pm';
  } else {
    hourStr = String(hour - 12); ampm = 'pm';
  }

  if (minute > 0) {
    return `${hourStr}:${String(minute).padStart(2, '0')}${ampm}`;
  }
  return `${hourStr}${ampm}`;
}

function formatTime(isoTime) {
  if (!isoTime) return 'N/A';
  try {
    const dt = new Date(isoTime);
    const localDt = new Date(dt.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
    return formatHour(localDt.getUTCHours(), localDt.getUTCMinutes());
  } catch {
    return 'N/A';
  }
}

function formatWeekReset(isoTime) {
  if (!isoTime) return '';
  try {
    const dt = new Date(isoTime);
    const localDt = new Date(dt.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[localDt.getUTCMonth()];
    const timeStr = formatHour(localDt.getUTCHours(), localDt.getUTCMinutes());

    return `${monthStr} ${localDt.getUTCDate()}, ${timeStr}`;
  } catch {
    return '';
  }
}

function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.floor(tokens / 1000)}k`;
  }
  return String(tokens);
}

// ============================================================================
// Context 計算
// ============================================================================

function calculateContextUsage(contextWindow) {
  if (!contextWindow) {
    return { used: 0, total: DEFAULT_CONTEXT_SIZE, percentage: 0 };
  }

  const contextSize = contextWindow.context_window_size || DEFAULT_CONTEXT_SIZE;

  let usedTokens = 0;
  const currentUsage = contextWindow.current_usage;
  if (currentUsage) {
    usedTokens = (currentUsage.input_tokens || 0) +
                 (currentUsage.cache_read_input_tokens || 0) +
                 (currentUsage.cache_creation_input_tokens || 0);
  } else {
    usedTokens = contextWindow.total_input_tokens || 0;
  }

  const percentage = contextSize > 0 ? (usedTokens * 100) / contextSize : 0;
  return { used: usedTokens, total: contextSize, percentage };
}

// ============================================================================
// Git
// ============================================================================

function runGitCommand(args, cwd) {
  try {
    const result = execSync(`git ${args.join(' ')}`, {
      encoding: 'utf8',
      cwd: cwd || process.cwd(),
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

function getGitBranch(cwd) {
  return runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

function getAheadBehind(cwd) {
  const upstream = runGitCommand(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd);
  if (!upstream) return { ahead: 0, behind: 0 };

  const result = runGitCommand(['rev-list', '--left-right', '--count', `HEAD...${upstream}`], cwd);
  if (result) {
    const parts = result.split(/\s+/);
    if (parts.length === 2) {
      return { ahead: parseInt(parts[0], 10), behind: parseInt(parts[1], 10) };
    }
  }
  return { ahead: 0, behind: 0 };
}

function getGitStatus(cwd) {
  const status = { staged: 0, modified: 0, untracked: 0, deleted: 0, conflicts: 0 };

  const result = runGitCommand(['status', '--porcelain'], cwd);
  if (!result) return status;

  for (const line of result.split('\n')) {
    if (line.length < 2) continue;

    const indexStatus = line[0];
    const worktreeStatus = line[1];

    // Conflicts
    if (indexStatus === 'U' || worktreeStatus === 'U') {
      status.conflicts++;
    }
    // Staged changes
    else if (['A', 'M', 'R', 'C'].includes(indexStatus)) {
      status.staged++;
    } else if (indexStatus === 'D') {
      status.deleted++;
    }

    // Unstaged modifications
    if (worktreeStatus === 'M') {
      status.modified++;
    } else if (worktreeStatus === 'D' && indexStatus !== 'D') {
      status.deleted++;
    }

    // Untracked
    if (indexStatus === '?' && worktreeStatus === '?') {
      status.untracked++;
    }
  }

  return status;
}

function formatCwd(cwd) {
  if (!cwd) return null;
  const home = os.homedir();

  // 標準化路徑：將 Windows 反斜線轉為正斜線
  const normalizedCwd = cwd.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');

  if (normalizedCwd === normalizedHome) return '~';
  if (normalizedCwd.startsWith(normalizedHome + '/')) {
    return '~' + normalizedCwd.slice(normalizedHome.length);
  }
  return normalizedCwd;
}

function formatGitInfo(branch, cwd) {
  if (!branch) return null;

  const parts = [`${CYAN}${branch}${RESET}`];

  const { ahead, behind } = getAheadBehind(cwd);
  if (ahead > 0) parts.push(`${GREEN}↑${ahead}${RESET}`);
  if (behind > 0) parts.push(`${YELLOW}↓${behind}${RESET}`);

  const status = getGitStatus(cwd);
  let hasChanges = false;

  if (status.conflicts > 0) {
    parts.push(`${RED}!${status.conflicts}${RESET}`);
    hasChanges = true;
  }
  if (status.staged > 0) {
    parts.push(`${GREEN}+${status.staged}${RESET}`);
    hasChanges = true;
  }
  if (status.modified > 0) {
    parts.push(`${YELLOW}~${status.modified}${RESET}`);
    hasChanges = true;
  }
  if (status.deleted > 0) {
    parts.push(`${RED}-${status.deleted}${RESET}`);
    hasChanges = true;
  }
  if (status.untracked > 0) {
    parts.push(`${DIM}?${status.untracked}${RESET}`);
    hasChanges = true;
  }

  // Clean working tree
  if (!hasChanges && ahead === 0 && behind === 0) {
    parts.push(`${GREEN}✓${RESET}`);
  }

  return parts.join(' ');
}

// ============================================================================
// 主程式
// ============================================================================

async function main() {
  let cwd = null;
  let modelName = null;
  let contextWindow = null;

  // 讀取 stdin
  try {
    const stdinData = fs.readFileSync(0, 'utf8');
    if (stdinData) {
      const inputJson = JSON.parse(stdinData);
      cwd = inputJson.cwd || inputJson.workspace?.current_dir;
      const modelInfo = inputJson.model || {};
      modelName = modelInfo.display_name || modelInfo.id;
      contextWindow = inputJson.context_window;
    }
  } catch {
    // stdin 讀取失敗，忽略
  }

  // 取得各項資訊
  const gitBranch = getGitBranch(cwd);
  const gitInfo = formatGitInfo(gitBranch, cwd);
  const ctx = calculateContextUsage(contextWindow);

  // 取得 API 使用量
  let data = loadCache();
  if (!data) {
    const token = getToken();
    if (!token) {
      console.log(`${DIM}No token${RESET}`);
      return;
    }

    data = await fetchUsage(token);
    if (!data) {
      console.log(`${DIM}API error${RESET}`);
      return;
    }

    saveCache(data);
  }

  // 解析 API 資料
  const fiveHour = data.five_hour || {};
  const sevenDay = data.seven_day || {};

  const sessionUtil = fiveHour.utilization || 0;
  const sessionReset = formatTime(fiveHour.resets_at);
  const weekUtil = sevenDay.utilization || 0;
  const weekReset = formatWeekReset(sevenDay.resets_at);

  // 取得顏色
  const sessionColor = getColor(sessionUtil);
  const weekColor = getColor(weekUtil);
  const ctxColor = getContextColor(ctx.percentage);

  // 組合輸出
  const parts = [];

  if (modelName) {
    parts.push(`${BOLD}${MAGENTA}${modelName}${RESET}`);
  }

  if (gitInfo) {
    parts.push(gitInfo);
  }

  parts.push(
    `Context ${ctxColor}${Math.round(ctx.percentage)}%${RESET} ` +
    `${DIM}(${formatTokens(ctx.used)}/${formatTokens(ctx.total)})${RESET}`
  );

  parts.push(
    `Session ${sessionColor}${Math.round(sessionUtil)}%${RESET} ` +
    `${DIM}@${sessionReset}${RESET}`
  );

  const weekResetStr = weekReset ? ` ${DIM}@${weekReset}${RESET}` : '';
  parts.push(`Week ${weekColor}${Math.round(weekUtil)}%${RESET}${weekResetStr}`);

  // 第一行：主要資訊
  console.log(parts.join(SEP));

  // 第二行：當前目錄
  const cwdDisplay = formatCwd(cwd);
  if (cwdDisplay) {
    console.log(`${ORANGE}${cwdDisplay}${RESET}`);
  }
}

main();
