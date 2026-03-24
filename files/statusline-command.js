#!/usr/bin/env node

/**
 * Claude Code Statusline - displays session usage info from stdin JSON
 *
 * Output format:
 *   ModelName · branch ✓ · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
 *   ~/Projects/myapp · $0.42 · +120 -15 lines · Cache 85%
 *   user/repo  (clickable link to GitHub)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ============================================================================
// Config
// ============================================================================

const GIT_CACHE_FILE = path.join(os.tmpdir(), 'claude-statusline-git-cache.json');
const GIT_CACHE_TTL = 5; // seconds
const TIMEZONE_OFFSET = 8; // Asia/Taipei UTC+8
const DEFAULT_CONTEXT_SIZE = 200000;

// ============================================================================
// ANSI color codes
// ============================================================================

const GREEN   = '\x1b[32m';
const YELLOW  = '\x1b[33m';
const ORANGE  = '\x1b[38;5;208m';
const RED     = '\x1b[31m';
const CYAN    = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const BOLD    = '\x1b[1m';
const DIM     = '\x1b[2m';
const RESET   = '\x1b[0m';

const SEP = ` ${DIM}·${RESET} `;

// ============================================================================
// Terminal width detection & segment wrapping
// ============================================================================

function stripAnsi(str) {
  // Strip ANSI escape sequences and OSC 8 hyperlinks
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}

function getTerminalWidth() {
  if (process.env.COLUMNS) {
    const cols = parseInt(process.env.COLUMNS, 10);
    if (!isNaN(cols) && cols > 0) return cols;
  }
  try {
    const cols = parseInt(
      execSync('tput cols', { encoding: 'utf8', timeout: 500, stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
      10
    );
    if (!isNaN(cols) && cols > 0) return cols;
  } catch { /* ignore */ }
  return 0; // 0 = unknown, skip wrapping
}

function wrapSegments(segments, maxWidth) {
  if (maxWidth <= 0 || segments.length === 0) return [segments.join(SEP)];

  const sepWidth = stripAnsi(SEP).length;
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  for (const seg of segments) {
    const segWidth = stripAnsi(seg).length;
    const addedWidth = currentLine.length > 0 ? sepWidth + segWidth : segWidth;

    if (currentWidth + addedWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine.join(SEP));
      currentLine = [seg];
      currentWidth = segWidth;
    } else {
      currentLine.push(seg);
      currentWidth += addedWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(SEP));
  }

  return lines;
}

// ============================================================================
// Color thresholds
// ============================================================================

function getRateLimitColor(pct) {
  if (pct >= 80) return RED;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

function getContextColor(pct) {
  if (pct >= 80) return RED;
  if (pct >= 70) return ORANGE;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

// ============================================================================
// Time formatting (Asia/Taipei UTC+8)
// ============================================================================

function toLocalDt(epochSeconds) {
  return new Date(epochSeconds * 1000 + TIMEZONE_OFFSET * 60 * 60 * 1000);
}

function formatHour(hour, minute) {
  let hourStr, ampm;
  if (hour === 0)       { hourStr = '12'; ampm = 'am'; }
  else if (hour < 12)   { hourStr = String(hour); ampm = 'am'; }
  else if (hour === 12) { hourStr = '12'; ampm = 'pm'; }
  else                  { hourStr = String(hour - 12); ampm = 'pm'; }

  return minute > 0
    ? `${hourStr}:${String(minute).padStart(2, '0')}${ampm}`
    : `${hourStr}${ampm}`;
}

// Accepts Unix epoch seconds or ISO string; returns "2pm" style
function formatResetTime(value) {
  if (value == null) return null;
  try {
    const epochSec = typeof value === 'number' ? value : Date.parse(value) / 1000;
    if (isNaN(epochSec)) return null;
    const dt = toLocalDt(epochSec);
    return formatHour(dt.getUTCHours(), dt.getUTCMinutes());
  } catch {
    return null;
  }
}

// Returns "Jan 24, 2pm" style for the weekly reset
function formatWeekReset(value) {
  if (value == null) return null;
  try {
    const epochSec = typeof value === 'number' ? value : Date.parse(value) / 1000;
    if (isNaN(epochSec)) return null;
    const dt = toLocalDt(epochSec);
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    const timeStr = formatHour(dt.getUTCHours(), dt.getUTCMinutes());
    return `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${timeStr}`;
  } catch {
    return null;
  }
}

// ============================================================================
// Token formatting
// ============================================================================

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000)     return `${Math.floor(tokens / 1_000)}k`;
  return String(tokens);
}

// ============================================================================
// Context window calculation
// ============================================================================

function calculateContextUsage(contextWindow) {
  if (!contextWindow) return { used: 0, total: DEFAULT_CONTEXT_SIZE, percentage: 0 };

  // Prefer pre-calculated percentage when available
  if (contextWindow.used_percentage != null) {
    const pct   = contextWindow.used_percentage;
    const total = contextWindow.context_window_size || DEFAULT_CONTEXT_SIZE;
    const used  = Math.round(pct / 100 * total);
    return { used, total, percentage: pct };
  }

  const total = contextWindow.context_window_size || DEFAULT_CONTEXT_SIZE;
  let used = 0;
  const cur = contextWindow.current_usage;
  if (cur) {
    used = (cur.input_tokens || 0)
         + (cur.cache_read_input_tokens || 0)
         + (cur.cache_creation_input_tokens || 0);
  } else {
    used = contextWindow.total_input_tokens || 0;
  }

  const percentage = total > 0 ? (used * 100) / total : 0;
  return { used, total, percentage };
}

// ============================================================================
// Git (with 5-second file cache keyed by cwd)
// ============================================================================

function runGit(args, cwd) {
  try {
    return execSync(`git ${args.join(' ')}`, {
      encoding: 'utf8',
      cwd: cwd || process.cwd(),
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
  } catch {
    return null;
  }
}

function loadGitCache(cwd) {
  try {
    if (fs.existsSync(GIT_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(GIT_CACHE_FILE, 'utf8'));
      if (cache.cwd === cwd && (Date.now() / 1000 - (cache.timestamp || 0)) < GIT_CACHE_TTL) {
        return cache.data;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function saveGitCache(cwd, data) {
  try {
    fs.writeFileSync(GIT_CACHE_FILE, JSON.stringify({
      cwd,
      timestamp: Date.now() / 1000,
      data,
    }));
  } catch { /* ignore */ }
}

function isWorktree(cwd) {
  const gitDir = runGit(['rev-parse', '--git-dir'], cwd);
  const gitCommonDir = runGit(['rev-parse', '--git-common-dir'], cwd);

  if (!gitDir || !gitCommonDir) return false;

  const basePath = cwd || process.cwd();
  const normalizedGitDir = path.resolve(basePath, gitDir);
  const normalizedCommonDir = path.resolve(basePath, gitCommonDir);

  return normalizedGitDir !== normalizedCommonDir;
}

function collectGitData(cwd) {
  const cached = loadGitCache(cwd);
  if (cached) return cached;

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!branch) {
    saveGitCache(cwd, null);
    return null;
  }

  // Worktree detection
  const worktree = isWorktree(cwd);

  // Ahead / behind
  let ahead = 0, behind = 0;
  const upstream = runGit(['rev-parse', '--abbrev-ref', '@{upstream}'], cwd);
  if (upstream) {
    const ab = runGit(['rev-list', '--left-right', '--count', `HEAD...${upstream}`], cwd);
    if (ab) {
      const parts = ab.split(/\s+/);
      if (parts.length === 2) {
        ahead  = parseInt(parts[0], 10) || 0;
        behind = parseInt(parts[1], 10) || 0;
      }
    }
  }

  // Porcelain status
  const status = { staged: 0, modified: 0, untracked: 0, deleted: 0, conflicts: 0 };
  const porcelain = runGit(['status', '--porcelain'], cwd);
  if (porcelain) {
    for (const line of porcelain.split('\n')) {
      if (line.length < 2) continue;
      const idx = line[0], wt = line[1];
      if (idx === 'U' || wt === 'U') {
        status.conflicts++;
      } else if (['A', 'M', 'R', 'C'].includes(idx)) {
        status.staged++;
      } else if (idx === 'D') {
        status.deleted++;
      }
      if (wt === 'M') status.modified++;
      else if (wt === 'D' && idx !== 'D') status.deleted++;
      if (idx === '?' && wt === '?') status.untracked++;
    }
  }

  // Diff stats (staged + unstaged lines added/removed)
  let linesAdded = 0, linesRemoved = 0;
  for (const args of [['diff', '--numstat'], ['diff', '--cached', '--numstat']]) {
    const output = runGit(args, cwd);
    if (output) {
      for (const line of output.split('\n')) {
        const m = line.match(/^(\d+)\s+(\d+)/);
        if (m) {
          linesAdded   += parseInt(m[1], 10) || 0;
          linesRemoved += parseInt(m[2], 10) || 0;
        }
      }
    }
  }

  const data = { branch, worktree, ahead, behind, status, linesAdded, linesRemoved };
  saveGitCache(cwd, data);
  return data;
}

function formatGitInfo(cwd) {
  const git = collectGitData(cwd);
  if (!git) return null;

  const { branch, worktree, ahead, behind, status } = git;
  const parts = [];

  if (worktree) {
    parts.push(`${DIM}[worktree]${RESET}`);
  }

  parts.push(`${CYAN}${branch}${RESET}`);

  if (ahead  > 0) parts.push(`${GREEN}↑${ahead}${RESET}`);
  if (behind > 0) parts.push(`${YELLOW}↓${behind}${RESET}`);

  let hasChanges = false;
  if (status.conflicts > 0) { parts.push(`${RED}!${status.conflicts}${RESET}`);  hasChanges = true; }
  if (status.staged    > 0) { parts.push(`${GREEN}+${status.staged}${RESET}`);   hasChanges = true; }
  if (status.modified  > 0) { parts.push(`${YELLOW}~${status.modified}${RESET}`); hasChanges = true; }
  if (status.deleted   > 0) { parts.push(`${RED}-${status.deleted}${RESET}`);    hasChanges = true; }
  if (status.untracked > 0) { parts.push(`${DIM}?${status.untracked}${RESET}`);  hasChanges = true; }

  if (!hasChanges && ahead === 0 && behind === 0) {
    parts.push(`${GREEN}✓${RESET}`);
  }

  return parts.join(' ');
}

// ============================================================================
// Path formatting
// ============================================================================

function formatCwd(cwd) {
  if (!cwd) return null;
  const home = os.homedir();

  // Normalize paths: convert Windows backslashes to forward slashes
  const normalizedCwd = cwd.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');

  if (normalizedCwd === normalizedHome) return '~';
  if (normalizedCwd.startsWith(normalizedHome + '/')) {
    return '~' + normalizedCwd.slice(normalizedHome.length);
  }
  return normalizedCwd;
}

// ============================================================================
// Cost formatting
// ============================================================================

function formatCost(costUsd) {
  if (costUsd == null || costUsd === 0) return null;
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 1) return `$${costUsd.toFixed(2)}`;
  return `$${costUsd.toFixed(2)}`;
}

// ============================================================================
// Lines changed formatting
// ============================================================================

function formatLinesChanged(added, removed) {
  if ((added == null || added === 0) && (removed == null || removed === 0)) return null;
  const parts = [];
  if (added > 0)   parts.push(`${GREEN}+${added}${RESET}`);
  if (removed > 0)  parts.push(`${RED}-${removed}${RESET}`);
  return parts.join(' ') + ` ${DIM}lines${RESET}`;
}

// ============================================================================
// Cache hit rate
// ============================================================================

function formatCacheRate(currentUsage) {
  if (!currentUsage) return null;
  const cacheRead = currentUsage.cache_read_input_tokens || 0;
  const cacheCreate = currentUsage.cache_creation_input_tokens || 0;
  const inputTokens = currentUsage.input_tokens || 0;
  const totalInput = cacheRead + cacheCreate + inputTokens;
  if (totalInput === 0) return null;
  const rate = (cacheRead / totalInput) * 100;
  const color = rate >= 70 ? GREEN : rate >= 40 ? YELLOW : DIM;
  return `Cache ${color}${Math.round(rate)}%${RESET}`;
}

// ============================================================================
// Clickable GitHub link (OSC 8)
// ============================================================================

function getGitHubUrl(cwd) {
  const remote = runGit(['remote', 'get-url', 'origin'], cwd);
  if (!remote) return null;

  let url = remote;
  // Convert SSH to HTTPS: git@github.com:user/repo.git -> https://github.com/user/repo
  if (url.startsWith('git@')) {
    url = url.replace(/^git@([^:]+):/, 'https://$1/');
  }
  // Remove .git suffix
  url = url.replace(/\.git$/, '');

  // Only return GitHub URLs
  if (!url.includes('github.com')) return null;
  return url;
}

function formatGitHubLink(cwd) {
  const url = getGitHubUrl(cwd);
  if (!url) return null;

  // Extract repo name (last part of URL) as display text
  const repoName = url.split('/').slice(-2).join('/');

  // OSC 8 clickable link: \e]8;;URL\a DISPLAY_TEXT \e]8;;\a
  return `\x1b]8;;${url}\x07${DIM}${repoName}${RESET}\x1b]8;;\x07`;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  // Read and parse stdin JSON
  let input = {};
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (raw) input = JSON.parse(raw);
  } catch { /* ignore */ }

  const cwd       = input.cwd || input.workspace?.current_dir || null;
  const modelName = input.model?.display_name || input.model?.id || null;

  // Context window
  const ctx      = calculateContextUsage(input.context_window);
  const ctxColor = getContextColor(ctx.percentage);

  // Rate limits from stdin JSON
  const fiveHour = input.rate_limits?.five_hour  || null;
  const sevenDay = input.rate_limits?.seven_day  || null;

  // Git info (cached)
  const gitInfo = formatGitInfo(cwd);

  // ── Assemble line 1 ────────────────────────────────────────────────────────
  const parts = [];

  if (modelName) {
    parts.push(`${BOLD}${MAGENTA}${modelName}${RESET}`);
  }

  if (gitInfo) {
    const git = collectGitData(cwd);
    const linesDisplay = git
      ? formatLinesChanged(git.linesAdded, git.linesRemoved)
      : null;
    const gitSegment = linesDisplay
      ? `${gitInfo} ${DIM}(${RESET}${linesDisplay}${DIM})${RESET}`
      : gitInfo;
    parts.push(gitSegment);
  }

  // Context segment
  parts.push(
    `Context ${ctxColor}${Math.round(ctx.percentage)}%${RESET} ` +
    `${DIM}(${formatTokens(ctx.used)}/${formatTokens(ctx.total)})${RESET}`
  );

  // Session (5-hour) segment
  if (fiveHour != null) {
    const pct   = fiveHour.used_percentage ?? 0;
    const color = getRateLimitColor(pct);
    const reset = formatResetTime(fiveHour.resets_at);
    const resetStr = reset ? ` ${DIM}@${reset}${RESET}` : '';
    parts.push(`Session ${color}${Math.round(pct)}%${RESET}${resetStr}`);
  }

  // Week (7-day) segment
  if (sevenDay != null) {
    const pct   = sevenDay.used_percentage ?? 0;
    const color = getRateLimitColor(pct);
    const reset = formatWeekReset(sevenDay.resets_at);
    const resetStr = reset ? ` ${DIM}@${reset}${RESET}` : '';
    parts.push(`Week ${color}${Math.round(pct)}%${RESET}${resetStr}`);
  }

  // ── Line 2 parts: directory · cost ──────────────────────────────────────
  const line2Parts = [];

  const cwdDisplay = formatCwd(cwd);
  if (cwdDisplay) {
    line2Parts.push(`${ORANGE}${cwdDisplay}${RESET}`);
  }

  const costDisplay = formatCost(input.cost?.total_cost_usd);
  if (costDisplay) {
    line2Parts.push(`💰 ${costDisplay}`);
  }

  // ── Output with auto-wrapping ─────────────────────────────────────────────
  const termWidth = getTerminalWidth();
  const allLines = [
    ...wrapSegments(parts, termWidth),
    ...(line2Parts.length > 0 ? wrapSegments(line2Parts, termWidth) : []),
  ];
  console.log(allLines.join('\n'));

}

main();
