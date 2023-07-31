import { Events } from "discord.js";
import { CustomClient } from "~/client";
import { extractUrls } from "~/utils/url";
import {
  AssetStatus,
  AssetType,
  ChainPatrolApiClient,
  chainpatrol,
} from "~/utils/api";
import { Flags, isFlagEnabled } from "~/utils/flags";

export default (client: CustomClient) => {
  console.log("MessageCreate listener loaded.");

  client.on(Events.MessageCreate, async (interaction) => {
    if (interaction.author.bot) {
      return;
    }

    const guildId = interaction.guildId;

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

    const content = interaction.content;

    const possibleUrls = extractUrls(content);

    if (!possibleUrls) {
      return;
    }

    for (const url of possibleUrls) {
      const response = await chainpatrol.asset.check({
        content: url,
        type: AssetType.URL,
      });
      if (response.status === AssetStatus.BLOCKED) {
        await interaction.react("🚨");
        return;
      }
    }
  });
};
