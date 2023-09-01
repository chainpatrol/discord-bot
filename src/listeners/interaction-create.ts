import { Events } from "discord.js";
import { CustomClient } from "~/client";

export default (client: CustomClient) => {
  console.log("InteractionCreate listener loaded.");

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    console.log(
      `received interaction (command=${interaction.commandName}, user.id=${interaction.user.id})`
    );

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error("error", error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  });
};
