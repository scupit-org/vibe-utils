export type LogLevel = "info" | "warn" | "error" | "success" | "debug";

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  success: "\x1b[32m",
  debug: "\x1b[90m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

function log(level: LogLevel, message: string): void {
  if (level === "debug" && !verboseEnabled) return;
  const prefix = COLORS[level]!;
  const label = level.toUpperCase().padEnd(7);
  console.error(`${prefix}${BOLD}[${label}]${RESET}${prefix} ${message}${RESET}`);
}

export const logger = {
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
  success: (msg: string) => log("success", msg),
  debug: (msg: string) => log("debug", msg),
  blank: () => console.error(""),
};
