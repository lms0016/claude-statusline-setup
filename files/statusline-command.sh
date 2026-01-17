#!/usr/bin/env python3
"""
Claude Code Statusline - 顯示 session 使用量資訊

輸出格式：
  Opus · main · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# ============================================================================
# 設定
# ============================================================================

CACHE_FILE = Path("/tmp/claude-usage-cache.json")
CACHE_TTL = 300  # 快取有效期（秒）
API_URL = "https://api.anthropic.com/api/oauth/usage"
TIMEZONE_OFFSET = 8  # Asia/Taipei UTC+8
DEFAULT_CONTEXT_SIZE = 200_000

# ============================================================================
# ANSI 色碼
# ============================================================================

GREEN = "\033[32m"
YELLOW = "\033[33m"
ORANGE = "\033[38;5;208m"
RED = "\033[31m"
CYAN = "\033[36m"
MAGENTA = "\033[35m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

SEP = f" {DIM}·{RESET} "

# ============================================================================
# 顏色判斷
# ============================================================================

def get_color(percentage: float) -> str:
    """根據使用量百分比回傳對應顏色"""
    if percentage >= 80:
        return RED
    elif percentage >= 50:
        return YELLOW
    return GREEN


def get_context_color(percentage: float) -> str:
    """根據 context 使用量百分比回傳對應顏色（更細緻的分級）"""
    if percentage >= 80:
        return RED
    elif percentage >= 70:
        return ORANGE
    elif percentage >= 50:
        return YELLOW
    return GREEN

# ============================================================================
# Token 相關
# ============================================================================

def get_token_from_keychain() -> str | None:
    """從 macOS Keychain 取得 OAuth token"""
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            creds = json.loads(result.stdout.strip())
            return creds.get("claudeAiOauth", {}).get("accessToken")
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
        pass
    return None


def get_token_from_file() -> str | None:
    """從檔案取得 OAuth token"""
    creds_file = Path.home() / ".claude" / ".credentials.json"
    try:
        if creds_file.exists():
            with open(creds_file) as f:
                creds = json.load(f)
                return creds.get("claudeAiOauth", {}).get("accessToken")
    except (json.JSONDecodeError, IOError):
        pass
    return None


def get_token() -> str | None:
    """取得 OAuth token（優先 Keychain，fallback 檔案）"""
    return get_token_from_keychain() or get_token_from_file()

# ============================================================================
# API 與快取
# ============================================================================

def fetch_usage(token: str) -> dict | None:
    """呼叫 Usage API"""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "claude-code/2.0.32",
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
    }
    try:
        req = Request(API_URL, headers=headers, method="GET")
        with urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())
    except (URLError, HTTPError, json.JSONDecodeError):
        return None


def load_cache() -> dict | None:
    """載入快取"""
    try:
        if CACHE_FILE.exists():
            with open(CACHE_FILE) as f:
                cache = json.load(f)
                if time.time() - cache.get("timestamp", 0) < CACHE_TTL:
                    return cache.get("data")
    except (json.JSONDecodeError, IOError):
        pass
    return None


def save_cache(data: dict) -> None:
    """儲存快取"""
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump({"timestamp": time.time(), "data": data}, f)
    except IOError:
        pass

# ============================================================================
# 格式化工具
# ============================================================================

def format_hour(hour: int, minute: int) -> str:
    """將小時和分鐘格式化為 12 小時制"""
    if hour == 0:
        hour_str, ampm = "12", "am"
    elif hour < 12:
        hour_str, ampm = str(hour), "am"
    elif hour == 12:
        hour_str, ampm = "12", "pm"
    else:
        hour_str, ampm = str(hour - 12), "pm"

    if minute > 0:
        return f"{hour_str}:{minute:02d}{ampm}"
    return f"{hour_str}{ampm}"


def format_time(iso_time: str | None) -> str:
    """將 UTC 時間轉換為本地時間格式（例：2pm, 1:59pm）"""
    if not iso_time:
        return "N/A"
    try:
        dt = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        local_dt = dt + timedelta(hours=TIMEZONE_OFFSET)
        return format_hour(local_dt.hour, local_dt.minute)
    except (ValueError, AttributeError):
        return "N/A"


def format_week_reset(iso_time: str | None) -> str:
    """將 UTC 時間轉換為日期格式（例：Jan 24, 9am）"""
    if not iso_time:
        return ""
    try:
        dt = datetime.fromisoformat(iso_time.replace("Z", "+00:00"))
        local_dt = dt + timedelta(hours=TIMEZONE_OFFSET)

        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        month_str = months[local_dt.month - 1]
        time_str = format_hour(local_dt.hour, local_dt.minute)

        return f"{month_str} {local_dt.day}, {time_str}"
    except (ValueError, AttributeError):
        return ""


def format_tokens(tokens: int) -> str:
    """格式化 token 數量（例：65k, 1.5M）"""
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    elif tokens >= 1_000:
        return f"{tokens // 1_000}k"
    return str(tokens)

# ============================================================================
# Context 計算
# ============================================================================

def calculate_context_usage(context_window: dict | None) -> tuple[int, int, float]:
    """
    計算 context window 使用量
    回傳: (used_tokens, total_tokens, percentage)
    """
    if not context_window:
        return 0, DEFAULT_CONTEXT_SIZE, 0.0

    context_size = context_window.get("context_window_size", DEFAULT_CONTEXT_SIZE)

    # 優先使用 current_usage（更準確）
    current_usage = context_window.get("current_usage")
    if current_usage:
        used_tokens = (
            current_usage.get("input_tokens", 0) +
            current_usage.get("cache_read_input_tokens", 0) +
            current_usage.get("cache_creation_input_tokens", 0)
        )
    else:
        used_tokens = context_window.get("total_input_tokens", 0)

    percentage = (used_tokens * 100) / context_size if context_size > 0 else 0
    return used_tokens, context_size, percentage

# ============================================================================
# Git
# ============================================================================

def get_git_branch(cwd: str | None) -> str | None:
    """取得 git 分支名稱"""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            cwd=cwd or os.getcwd(),
            timeout=2
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return None

# ============================================================================
# 主程式
# ============================================================================

def main():
    # 讀取 stdin（Claude Code 傳入的 JSON）
    cwd = None
    model_name = None
    context_window = None

    try:
        stdin_data = sys.stdin.read()
        if stdin_data:
            input_json = json.loads(stdin_data)
            cwd = input_json.get("cwd") or input_json.get("workspace", {}).get("current_dir")
            model_info = input_json.get("model", {})
            model_name = model_info.get("display_name") or model_info.get("id")
            context_window = input_json.get("context_window")
    except (json.JSONDecodeError, IOError):
        pass

    # 取得各項資訊
    git_branch = get_git_branch(cwd)
    ctx_used, ctx_total, ctx_percent = calculate_context_usage(context_window)

    # 取得 API 使用量（從快取或 API）
    data = load_cache()
    if not data:
        token = get_token()
        if not token:
            print(f"{DIM}No token{RESET}")
            return

        data = fetch_usage(token)
        if not data:
            print(f"{DIM}API error{RESET}")
            return

        save_cache(data)

    # 解析 API 資料
    five_hour = data.get("five_hour", {})
    seven_day = data.get("seven_day", {})

    session_util = five_hour.get("utilization", 0)
    session_reset = format_time(five_hour.get("resets_at"))
    week_util = seven_day.get("utilization", 0)
    week_reset = format_week_reset(seven_day.get("resets_at"))

    # 取得顏色
    session_color = get_color(session_util)
    week_color = get_color(week_util)
    ctx_color = get_context_color(ctx_percent)

    # 組合輸出
    parts = []

    if model_name:
        parts.append(f"{BOLD}{MAGENTA}{model_name}{RESET}")

    if git_branch:
        parts.append(f"{CYAN}{git_branch}{RESET}")

    parts.append(
        f"Context {ctx_color}{ctx_percent:.0f}%{RESET} "
        f"{DIM}({format_tokens(ctx_used)}/{format_tokens(ctx_total)}){RESET}"
    )

    parts.append(
        f"Session {session_color}{session_util:.0f}%{RESET} "
        f"{DIM}@{session_reset}{RESET}"
    )

    week_reset_str = f" {DIM}@{week_reset}{RESET}" if week_reset else ""
    parts.append(f"Week {week_color}{week_util:.0f}%{RESET}{week_reset_str}")

    print(SEP.join(parts))


if __name__ == "__main__":
    main()
