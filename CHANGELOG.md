# Changelog

## [1.4.0] - 2026-03-24

### Added

- Git worktree detection with `[worktree]` indicator
- Session cost display (💰 $X.XX) on line 2
- Lines changed display (+N -N lines) merged into git info section

### Changed

- Use built-in stdin JSON for rate limits instead of API calls
- Move lines changed into git info as parenthesized suffix
- Streamline line 2 layout (path + cost only)

### Removed

- Cache hit rate display (redundant with cost display)
- Clickable GitHub link (OSC 8 not supported in statusline)

## [1.2.0] - 2026-01-17

### Changed
- Rewrite statusline script from Python to JavaScript
  - No longer requires Python 3 to be installed
  - Only Node.js is needed (which is already required for npm)

### Fixed
- Improve git command detection regex in pre-push hook
  - Now correctly detects `git -C /path push` format

## [1.1.0] - 2026-01-17

### Added
- Enhanced git status indicators in statusline
  - Ahead/behind commits (↑↓)
  - Staged files (+)
  - Modified files (~)
  - Deleted files (-)
  - Untracked files (?)
  - Merge conflicts (!)
  - Clean working tree indicator (✓)

### Fixed
- Pre-push hook now uses correct JSON output format

## [1.0.0] - 2026-01-17

### Added
- CLI tool to setup Claude Code statusline
- Usage metrics display support
