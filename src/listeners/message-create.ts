import axios from "axios";
import { Events } from "discord.js";
import { CustomClient } from "src/client";
import { env } from "../env";
import { extractUrls } from "src/utils/url";
import { AssetType, ChainPatrolApiClient } from "src/utils/api";

export default (client: CustomClient) => {
  console.log("MessageCreate listener loaded.");

  client.on(Events.MessageCreate, async (interaction) => {
    const content = interaction.content;

    const possibleUrls = extractUrls(content);

    if (!possibleUrls) {
      return;
    }

    for (const url of possibleUrls) {
      const response = await ChainPatrolApiClient.checkAsset({
        content: url,
        type: AssetType.URL,
      });
      if (response.status === "BLOCKED") {
        await interaction.react("🚨");
        return;
      }
    }
  });
};
