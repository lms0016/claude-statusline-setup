# Changelog

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
