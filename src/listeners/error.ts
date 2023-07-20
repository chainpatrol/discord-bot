import { Events } from "discord.js";
import * as Sentry from "@sentry/node";
import { CustomClient } from "~/client";

export default (client: CustomClient) => {
  console.log("Error catcher loaded.");

  client.on(Events.Error, (error) => {
    console.error(error);
    Sentry.captureException(error);
  });
};
