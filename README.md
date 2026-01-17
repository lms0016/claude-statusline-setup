# @lms0016/claude-statusline-setup

Setup Claude Code statusline with usage metrics display.

## Installation

```bash
npm i -g @lms0016/claude-statusline-setup
claude-statusline-setup
```

## What it does

Installs a custom statusline for Claude Code that shows:

- Current model name (Opus, Sonnet, Haiku)
- Git branch
- Context window usage
- Session usage (5-hour rolling limit)
- Weekly usage (7-day rolling limit)

Example output:
```
Opus · main · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
```

## Requirements

- macOS (uses Keychain for token storage)
- Claude Code CLI
- Python 3.x

## Files installed

- `~/.claude/statusline-command.sh` - The statusline script
- `~/.claude/settings.json` - Updated with statusLine config
