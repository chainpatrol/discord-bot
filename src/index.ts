import { env } from "./env";

import fs from "node:fs";
import path from "node:path";

import { GatewayIntentBits } from "discord.js";

import interactionCreate from "./listeners/interactionCreate";
import ready from "./listeners/ready";
import { CustomClient } from "./client";

// Create a new client instance
const client = new CustomClient({
  intents: [GatewayIntentBits.Guilds],
});

// Add commands from commands folder
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
    );
  }
}

ready(client);
interactionCreate(client);

// Log in to Discord with your client's token
client.login(env.DISCORD_BOT_SECRET);
