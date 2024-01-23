import { Events, GatewayIntentBits } from "discord.js";
import * as Sentry from "@sentry/node";

import { CustomClient } from "~/client";
import { env } from "~/env";
import { logger } from "./utils/logger";

if (env.SENTRY_SECRET) {
  Sentry.init({
    dsn: env.SENTRY_SECRET,
    tracesSampleRate: 0.01,
  });
}

// Create a new client instance
const client = new CustomClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on(Events.ClientReady, () => logger.info("The bot is online"));
client.on(Events.Debug, (m) => logger.debug(m));
client.on(Events.Warn, (m) => logger.warn(m));
client.on(Events.Error, (m) => logger.error(m));
client.on(Events.ShardError, (error) => {
  logger.error(error, "A websocket connection encountered an error");
  Sentry.captureException(error);
});

function shutdown(force: boolean = false) {
  logger.info("Destroying client and exiting process...");
  client.destroy();
  if (force) {
    process.abort();
  } else {
    process.exit(1);
  }
}

process.on(
  "unhandledRejection",
  (reason: {} | null | undefined, promise: Promise<any>) => {
    logger.error({ reason, promise }, "Unhandled Promise rejection");
    Sentry.captureException(reason);
  }
);

process.on("uncaughtException", (err, origin) => {
  logger.fatal({ err, origin }, "Uncaught Exception");
  Sentry.captureException(err);
  shutdown();
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT");
  shutdown();
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM");
  shutdown();
});

process.on("warning", (warning) => {
  logger.warn({ warning }, "Node.js warning");
});

// Load commands and listeners
client.loadCommands();
client.loadListeners();

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
