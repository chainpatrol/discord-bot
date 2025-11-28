import * as Sentry from "@sentry/node";
import { Events } from "discord.js";

import { CustomClient } from "~/client";
import { logger } from "~/utils/logger";

export default (client: CustomClient) => {
  logger.info("InteractionCreate listener loaded.");

  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isUserContextMenuCommand() &&
      !interaction.isMessageContextMenuCommand()
    ) {
      return;
    }

    logger.info(
      `received interaction (command=${interaction.commandName}, user.id=${interaction.user.id})`,
    );

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(error);
      Sentry.captureException(error);

      const content = `There was an unexpected error while executing this command!`;

      if (interaction.isRepliable()) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content, ephemeral: true });
          return;
        }

        if (interaction.deferred) {
          await interaction.editReply({ content });
          return;
        }

        await interaction.followUp({ content, ephemeral: true });
      }
    }
  });
};
