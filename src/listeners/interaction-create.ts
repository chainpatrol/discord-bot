import { Events } from "discord.js";
import * as Sentry from "@sentry/node";

import { CustomClient } from "~/client";
import { logger } from "~/utils/logger";

export default (client: CustomClient) => {
  logger.info("InteractionCreate listener loaded.");

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    logger.info({ interaction }, "Received interaction");

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    const interactionLogger = logger.child({
      command: interaction.commandName,
      interactionId: interaction.id,
      userId: interaction.user.id,
    });

    try {
      await command.execute({ interaction, logger: interactionLogger });
    } catch (error) {
      logger.error(error);
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
