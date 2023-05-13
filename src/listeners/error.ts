import { Events } from "discord.js";
import { CustomClient } from "src/client";
import * as Sentry from "@sentry/node";

export default (client: CustomClient) => {
  console.log("Error catcher loaded.");

  client.on(Events.Error, (error) => {
    console.error(error);
    Sentry.captureException(error);
  });
};
