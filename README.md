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
- Git branch with enhanced status indicators
- Context window usage
- Session usage (5-hour rolling limit)
- Weekly usage (7-day rolling limit)

Example output:
```
Opus · main ↑2 +3 ~1 · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
```

### Git Status Indicators

| Symbol | Meaning |
|--------|---------|
| `↑N` | N commits ahead of remote |
| `↓N` | N commits behind remote |
| `+N` | N staged files |
| `~N` | N modified files (unstaged) |
| `-N` | N deleted files |
| `?N` | N untracked files |
| `!N` | N merge conflicts |
| `✓` | Clean working tree |

## Requirements

- macOS (uses Keychain for token storage)
- Claude Code CLI
- Python 3.x

## Files installed

- `~/.claude/statusline-command.sh` - The statusline script
- `~/.claude/settings.json` - Updated with statusLine config
