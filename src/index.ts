import { env } from "./env";
import { GatewayIntentBits } from "discord.js";
import { CustomClient } from "./client";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: env.DISCORD_BOT_SECRET,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

// Create a new client instance
const client = new CustomClient({
  intents: [GatewayIntentBits.Guilds],
});

// Load commands and listeners
client.loadCommands();
client.loadListeners();

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
