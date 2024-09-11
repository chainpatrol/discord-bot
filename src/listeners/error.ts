import * as Sentry from "@sentry/node";
import { Events } from "discord.js";

import { CustomClient } from "~/client";
import { logger } from "~/utils/logger";

export default (client: CustomClient) => {
  logger.info("Error catcher loaded.");

  client.on(Events.Error, (error) => {
    logger.error(error);
    Sentry.captureException(error);
  });
};
