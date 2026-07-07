'use strict';

const { config } = require('./config/constants');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] >= currentLevel) {
    const fn = level === 'error' ? console.error : console.log;
    fn(`[${level.toUpperCase()}]`, ...args);
  }
}

const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};

module.exports = { logger };
