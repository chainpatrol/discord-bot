import { GatewayIntentBits } from "discord.js";
import * as Sentry from "@sentry/node";

import { CustomClient } from "~/client";
import { env } from "~/env";

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

process.on(
  "unhandledRejection",
  (reason: {} | null | undefined, promise: Promise<any>) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    Sentry.captureException(reason);
  }
);

process.on("uncaughtException", (err, origin) => {
  console.error("Fatal error at:", origin, "reason:", err);
  Sentry.captureException(err);
  process.exit(1); // We don't want to continue the process if this error occurs
});

// Load commands and listeners
client.loadCommands();
client.loadListeners();

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
