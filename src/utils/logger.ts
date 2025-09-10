import pino from "pino";
import { env } from "~/env";

export type Logger = pino.Logger;

function createLogger({
  name,
  level = "info",
  redact,
}: {
  name?: string;
  level?: pino.LoggerOptions["level"];
  redact?: pino.LoggerOptions["redact"];
}): Logger {
  // In browser environment, use basic pino configuration
  if (typeof window !== "undefined") {
    return pino({
      level,
      name,
      redact,
      browser: { asObject: true },
    });
  }

  // Server-side logging configuration
  const targets: pino.TransportTargetOptions<Record<string, unknown>>[] = [];

  // Log to console in development
  if (env.NODE_ENV !== "production") {
    targets.push({
      level: "debug",
      target: "pino-pretty",
      options: {
        colorize: true,
        sync: true,
      },
    });
  }

  // Log to BetterStack in production
  if (
    env.NODE_ENV === "production" &&
    env.BETTERSTACK_SOURCE_TOKEN
  ) {
    targets.push({
      level: "info",
      target: "@logtail/pino",
      options: {
        sourceToken: env.BETTERSTACK_SOURCE_TOKEN,
        ...(env.BETTERSTACK_INGESTING_HOST
          ? {
              options: {
                endpoint: `https://${env.BETTERSTACK_INGESTING_HOST}`,
              },
            }
          : {}),
      },
    });
  }

  return pino(
    { level, name, redact },
    targets.length > 0 ? pino.transport({ targets }) : undefined
  );
}

export const logger = createLogger({
  name: "discord_bot",
  level: env.LOG_LEVEL ?? "info",
});
