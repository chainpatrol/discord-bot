// Guide: https://discordjs.guide/creating-your-bot/command-deployment.html#command-registration
const { REST, Routes } = require("discord.js");
// const { clientId, guildId, token } = require('./config.json');
const fs = require("node:fs");
const os = require("os");

// add dot env
require("dotenv").config();

const clientId = process.env["DISCORD_APPLICATION_ID"];
const guildId = process.env["TEST_DISCORD_SERVER_ID"];
const token = process.env["DISCORD_BOT_SECRET"];

const commands = [];
// Grab all the command files from the commands directory you created earlier
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: "10" }).setToken(token);

// and deploy your commands!
const deployCommands = async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    if (process.env.DISCORD_DEPLOY_GLOBAL) {
      const data = await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });

      console.log(
        `Successfully reloaded ${data.length} application (/) commands across all servers (global).`
      );
    } else {
      // The put method is used to fully refresh all commands in the guild with the current set
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );

      console.log(
        `Successfully reloaded ${data.length} application (/) commands on dev server ${guildId}.`
      );
    }
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
};

deployCommands();

module.exports = {
  deployCommands,
};
