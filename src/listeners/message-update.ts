import { Events } from "discord.js";
import { CustomClient } from "~/client";
import { extractUrls } from "~/utils/url";
import { AssetType, ChainPatrolApiClient, chainpatrol } from "~/utils/api";
import { Flags, isFlagEnabled } from "~/utils/flags";

export default (client: CustomClient) => {
  console.log("MessageUpdate listener loaded.");

  client.on(Events.MessageUpdate, async (oldInteraction, newInteraction) => {
    if (!newInteraction.content) {
      return;
    }

    if (newInteraction.author?.bot) {
      return;
    }

    const guildId = newInteraction.guildId;

    if (!guildId) {
      return;
    }

    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus(
      { guildId }
    );

    if (!connectionStatus || !connectionStatus.connected) {
      return;
    }

    const slug = connectionStatus.organizationSlug;

    if (!isFlagEnabled(slug, Flags.REACT_TO_SUSPICIOUS_MESSAGES)) {
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
      const response = await chainpatrol.asset.check({
        content: url,
        type: "URL",
      });
      if (response.status === "BLOCKED") {
        await newInteraction.react("🚨");
        return;
      }
    }
  });
};
