# Changelog

## [1.5.3] - 2026-10-23

### Fixed

- Setup no longer wipes `settings.json` when it contains invalid JSON; it now
  stops with an error and leaves the file untouched
- Session / Week reset times use the local timezone instead of a hardcoded UTC+8
- Git cache is stored per working directory, so concurrent sessions in different
  folders no longer evict each other's cache
- Git commands run without a shell, so branch names containing shell
  metacharacters are passed through safely

### Removed

- Dead code left over from 1.4.0 (cache hit rate, GitHub link helpers)

### Documentation

- README: drop the macOS / Keychain requirement, document line 2, `[worktree]`
  and lines changed
- Add the missing MIT `LICENSE` file

## [1.5.2] - 2026-10-14

### Fixed

- Context usage uses the actual token count from `current_usage` when present,
  instead of deriving it from the rounded percentage

## [1.5.1] - 2026-03-24

### Fixed

- Skip `tput cols` in non-TTY contexts, which reported a default width of 80
  and caused unwanted wrapping

## [1.5.0] - 2026-03-24

### Added

- Auto-wrap statusline segments at separator boundaries on narrow terminals

## [1.4.1] - 2026-03-24

### Fixed

- Lines changed now shows actual git diff stats (uncommitted changes) instead of
  cumulative session metrics
- Lines indicator disappears when working tree is clean

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

## [1.3.1] - 2026-01-21

### Fixed

- Windows compatibility: cache file uses `os.tmpdir()` instead of `/tmp`,
  Keychain access is skipped on Windows, path separators are normalized, and
  the statusLine command runs the script through `node` with a full path

## [1.3.0] - 2026-01-18

### Added

- Current directory display on a second line (home shortened to `~`)

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
