import { Events } from "discord.js";
import * as Sentry from "@sentry/node";
import { CustomClient } from "~/client";
import { logger } from "~/utils/logger";

export default (client: CustomClient) => {
  logger.info("Error catcher loaded.");

  client.on(Events.Error, (error) => {
    logger.error(error);
    Sentry.captureException(error);
  });
};
