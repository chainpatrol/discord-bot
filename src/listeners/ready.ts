import { Events } from "discord.js";
import { CustomClient } from "src/client";

export default (client: CustomClient) => {
  console.log("Ready listener loaded.");

  // When the client is ready, run this code (only once)
  // We use 'c' for the event parameter to keep it separate from the already defined 'client'
  client.once(Events.ClientReady, (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
  });
};
