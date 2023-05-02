import axios from "axios";
import { Events } from "discord.js";
import { CustomClient } from "src/client";
import { env } from "../env";

export default (client: CustomClient) => {
  console.log("BigBrother listener loaded.");

  client.on(Events.MessageCreate, async (interaction) => {
    const content = interaction.content;

    const possibleUrls = isUrl(content);

    if (possibleUrls) {
      for (const url of possibleUrls) {
        const response = await axios.post(
          `${env.CHAINPATROL_API_URL}/api/v2/asset/check`,
          {
            type: "URL",
            content: url,
          }
        );
        if (
          response.data.status === "BLOCKED" ||
          response.data.status === "UNKNOWN"
        ) {
          interaction.react("🚨");
          return;
        }
      }
    }
  });
};

function isUrl(str: string) {
  const regex = /((?:https?|ftp):\/\/)?(?:www\.)?([^\s]+\.[^\s]+)/gi;

  return str.match(regex);
}
