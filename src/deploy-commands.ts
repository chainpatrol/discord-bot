import { REST, Routes } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

const clientId = env["DISCORD_APPLICATION_ID"];
const guildId = env["TEST_DISCORD_SERVER_ID"];
const token = env["DISCORD_BOT_SECRET"];
const deployGlobally = env["DISCORD_DEPLOY_GLOBAL"];

const commands: any[] = [];
// Grab all the command files from the commands directory you created earlier
const commandsPath = path.resolve(__dirname, "..", "src", "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts"));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: "10" }).setToken(token);

// and deploy your commands!
const deployCommands = async () => {
  console.log(
    `Started refreshing ${commands.length} application (/) commands.`
  );

  if (deployGlobally) {
    const data = (await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    })) as any[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands across all servers (global).`
    );
  } else if (guildId) {
    // The put method is used to fully refresh all commands in the guild with the current set
    const data = (await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    )) as any[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands on dev server ${guildId}.`
    );
  } else {
    throw new Error(
      "No guild ID provided via TEST_DISCORD_SERVER_ID, and DISCORD_DEPLOY_GLOBAL is false."
    );
  }
};

deployCommands()
  .then(() => console.log("Done!"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
