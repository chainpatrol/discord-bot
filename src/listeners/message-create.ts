import { Events } from "discord.js";
import { CustomClient } from "~/client";
import { extractUrls } from "~/utils/url";
import { AssetType, ChainPatrolApiClient } from "~/utils/api";

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
