import { env } from "./env";
import { GatewayIntentBits } from "discord.js";
import { CustomClient } from "./client";

// Create a new client instance
const client = new CustomClient({
  intents: [GatewayIntentBits.Guilds],
});

// Load commands and listeners
client.loadCommands();
client.loadListeners();

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
