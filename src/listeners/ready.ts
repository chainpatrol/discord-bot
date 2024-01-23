import { Events } from "discord.js";
import { CustomClient } from "~/client";
import { logger } from "~/utils/logger";

export default (client: CustomClient) => {
  logger.info("Ready listener loaded.");

  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, (c) => {
    logger.info(`Ready! Logged in as ${c.user.tag}`);
  });
};
