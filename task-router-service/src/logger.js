class Logger {
  log(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: "task-router-service",
      level,
      message,
      ...metadata,
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message, metadata) {
    this.log("info", message, metadata);
  }

  warn(message, metadata) {
    this.log("warn", message, metadata);
  }

  error(message, metadata) {
    this.log("error", message, metadata);
  }

  debug(message, metadata) {
    this.log("debug", message, metadata);
  }
}

export const logger = new Logger();
