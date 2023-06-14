import { Events } from "discord.js";
import { CustomClient } from "~/client";
import { extractUrls } from "~/utils/url";
import { AssetType, ChainPatrolApiClient } from "~/utils/api";

export default (client: CustomClient) => {
  console.log("MessageUpdate listener loaded.");

  client.on(Events.MessageUpdate, async (oldInteraction, newInteraction) => {
    if (!newInteraction.content) {
      return;
    }

    if (newInteraction.author?.bot) {
      return;
    }

    const oldReaction = newInteraction.reactions.resolve("🚨");
    if (oldReaction && oldReaction.me) {
      await oldReaction.users.remove(client.user?.id!);
    }

    const possibleUrls = extractUrls(newInteraction.content);

    if (!possibleUrls) {
      return;
    }

    for (const url of possibleUrls) {
      const response = await ChainPatrolApiClient.checkAsset({
        content: url,
        type: AssetType.URL,
      });
      if (response.status === "BLOCKED") {
        await newInteraction.react("🚨");
        return;
      }
    }
  });
};
