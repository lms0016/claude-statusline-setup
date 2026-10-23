# claude-statusline-setup

Setup Claude Code statusline with usage metrics display.

## Installation

```bash
npm i -g @lms0016/claude-statusline-setup
claude-statusline-setup
```

## What it does

Installs a custom statusline for Claude Code that shows:

- Current model name (Opus, Sonnet, Haiku)
- Git branch with enhanced status indicators, a `[worktree]` marker, and
  uncommitted line changes
- Context window usage
- Session usage (5-hour rolling limit) and its reset time
- Weekly usage (7-day rolling limit) and its reset time
- Current directory and session cost (second line)

Example output:

```text
Opus · main ↑2 +3 ~1 (+120 -15 lines) · Context 32% (65k/200k) · Session 70% @2pm · Week 6% @Jan 24, 9am
~/Projects/myapp · 💰 $0.42
```

Reset times are shown in your local timezone. Segments wrap onto extra lines
when the terminal is too narrow.

### Git Status Indicators

| Symbol | Meaning |
| --- | --- |
| `[worktree]` | Current directory is a linked git worktree |
| `↑N` | N commits ahead of remote |
| `↓N` | N commits behind remote |
| `+N` | N staged files |
| `~N` | N modified files (unstaged) |
| `-N` | N deleted files |
| `?N` | N untracked files |
| `!N` | N merge conflicts |
| `✓` | Clean working tree |
| `(+N -N lines)` | Uncommitted lines added / removed (staged + unstaged) |

## Requirements

- macOS, Linux, or Windows
- Claude Code CLI (usage data is read from the JSON Claude Code passes on stdin)
- Node.js 16+ (required for npm, no additional install needed)
- `git` on `PATH` for the git segment (optional)

## Files installed

- `~/.claude/statusline-command.js` - The statusline script (an existing,
  different copy is backed up first)
- `~/.claude/settings.json` - Updated with statusLine config; other settings are
  kept. If the file is not valid JSON, setup stops without touching it.

## License

[MIT](LICENSE)
