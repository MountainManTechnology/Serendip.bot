import pino from "pino";

const transport =
  process.env["NODE_ENV"] !== "production"
    ? ({ target: "pino-pretty", options: { colorize: true } } as const)
    : undefined;

export const logger = pino(
  transport
    ? { level: process.env["LOG_LEVEL"] ?? "info", transport }
    : { level: process.env["LOG_LEVEL"] ?? "info" },
);
