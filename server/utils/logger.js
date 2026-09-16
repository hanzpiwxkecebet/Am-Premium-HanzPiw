const isDev = process.env.NODE_ENV !== 'production';

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = isDev ? levels.debug : levels.info;

function format(level, msg, data) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  return data ? `${prefix} ${msg} ${JSON.stringify(data)}` : `${prefix} ${msg}`;
}

const logger = {
  error: (msg, data) => { if (currentLevel >= levels.error) console.error(format('error', msg, data)); },
  warn:  (msg, data) => { if (currentLevel >= levels.warn)  console.warn(format('warn', msg, data)); },
  info:  (msg, data) => { if (currentLevel >= levels.info)  console.log(format('info', msg, data)); },
  debug: (msg, data) => { if (currentLevel >= levels.debug) console.debug(format('debug', msg, data)); },
};

module.exports = logger;
