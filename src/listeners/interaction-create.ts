import { Events } from "discord.js";
import * as Sentry from "@sentry/node";

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
      Sentry.captureException(error);

      const content = `There was an unexpected error while executing this command!`;

      /*
        `.deferReply()` can be used with components (like buttons) in messages but can't be used with `.showModal`
          
        On error code `InteractionCollectorError` with modal                    - replied: true, deferred: false
        On error code `InteractionCollectorError` without modal (buttons only)  - replied: true, deferred true | false
      */
      if (interaction.isRepliable()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content, ephemeral: true });
          return;
        }

        if (interaction.deferred) {
          await interaction.editReply({ content });
          return;
        }

        interaction.followUp({ content, ephemeral: true });
      }
    }
  });
};
