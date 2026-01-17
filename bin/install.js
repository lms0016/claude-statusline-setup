#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ANSI colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STATUSLINE_FILE = 'statusline-command.js';
const SETTINGS_FILE = 'settings.json';

function log(msg, color = '') {
  console.log(`${color}${msg}${RESET}`);
}

function ensureClaudeDir() {
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    log(`Created ${CLAUDE_DIR}`, GREEN);
  }
}

function copyStatuslineScript() {
  const src = path.join(__dirname, '..', 'files', STATUSLINE_FILE);
  const dest = path.join(CLAUDE_DIR, STATUSLINE_FILE);

  if (!fs.existsSync(src)) {
    log(`Error: Source file not found: ${src}`, RED);
    return false;
  }

  // Check if file already exists
  if (fs.existsSync(dest)) {
    const srcContent = fs.readFileSync(src, 'utf8');
    const destContent = fs.readFileSync(dest, 'utf8');
    if (srcContent === destContent) {
      log(`${STATUSLINE_FILE} is already up to date`, CYAN);
      return true;
    }
    // Backup existing file
    const backupPath = `${dest}.backup.${Date.now()}`;
    fs.copyFileSync(dest, backupPath);
    log(`Backed up existing file to ${backupPath}`, YELLOW);
  }

  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  log(`Installed ${STATUSLINE_FILE} to ${CLAUDE_DIR}`, GREEN);
  return true;
}

function updateSettings() {
  const settingsPath = path.join(CLAUDE_DIR, SETTINGS_FILE);
  let settings = {};

  // Read existing settings if present
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      log(`Warning: Could not parse existing ${SETTINGS_FILE}`, YELLOW);
    }
  }

  // Check if statusLine is already configured
  const statusLineConfig = {
    type: 'command',
    command: `~/.claude/${STATUSLINE_FILE}`,
    padding: 0
  };

  if (settings.statusLine &&
      settings.statusLine.type === 'command' &&
      settings.statusLine.command === statusLineConfig.command) {
    log('statusLine is already configured', CYAN);
    return;
  }

  // Update statusLine config
  settings.statusLine = statusLineConfig;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  log(`Updated ${SETTINGS_FILE} with statusLine config`, GREEN);
}

function showSuccess() {
  console.log('');
  log('='.repeat(50), CYAN);
  log(`${BOLD}Claude Statusline Setup Complete!${RESET}`, GREEN);
  log('='.repeat(50), CYAN);
  console.log('');
  log('Your statusline will show:', CYAN);
  log('  - Current model name');
  log('  - Git branch with status (ahead/behind, staged, modified, untracked)');
  log('  - Context window usage');
  log('  - Session usage (5-hour limit)');
  log('  - Weekly usage (7-day limit)');
  console.log('');
  log('Git indicators: ↑ahead ↓behind +staged ~modified -deleted ?untracked ✓clean', CYAN);
  console.log('');
  log('Restart Claude Code to see the changes.', YELLOW);
  console.log('');
}

function main() {
  log(`${BOLD}Claude Statusline Setup${RESET}`, CYAN);
  log('-'.repeat(30), CYAN);
  console.log('');

  ensureClaudeDir();

  if (copyStatuslineScript()) {
    updateSettings();
    showSuccess();
  } else {
    log('Setup failed!', RED);
    process.exit(1);
  }
}

main();
