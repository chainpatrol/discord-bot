import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
} from "discord.js";

import { CustomClient } from "~/client";
import { ChainPatrolApiClient, chainpatrol } from "~/utils/api";
import { Flags, isFlagEnabled } from "~/utils/flags";
import { logger } from "~/utils/logger";
import { extractUrls } from "~/utils/url";

export default (client: CustomClient) => {
  logger.info("MessageCreate listener loaded.");

  client.on(Events.MessageCreate, async (interaction) => {
    if (interaction.author.bot) {
      return;
    }

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId) {
      return;
    }

    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
      guildId,
    });

    if (!connectionStatus || !connectionStatus.connected) {
      return;
    }

    const slug = connectionStatus.organizationSlug;

    const discordConfig = await chainpatrol.fetch<{
      config: {
        id: number;
        organizationId: number;
        isMonitoringLinks: boolean;
        moderatorUsernames: string[];
        guildId: string;
        feedChannelId: string | null;
        isFeedEnabled: boolean;
        responseAction: "REACTION" | "NOTIFY";
        moderatorChannelId: string | null;
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId },
    });

    if (!discordConfig?.config?.isMonitoringLinks) {
      return;
    }

    if (
      discordConfig.config.feedChannelId &&
      discordConfig.config.feedChannelId !== channelId
    ) {
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
      });
      if (response.status === "BLOCKED") {
        if (discordConfig.config.responseAction === "REACTION") {
          await interaction.react("🚨");
        } else if (
          discordConfig.config.responseAction === "NOTIFY" &&
          discordConfig.config.moderatorChannelId
        ) {
          const moderatorChannel = await interaction.guild?.channels.fetch(
            discordConfig.config.moderatorChannelId,
          );
          if (moderatorChannel?.isTextBased()) {
            const messageLink = `https://discord.com/channels/${guildId}/${channelId}/${interaction.id}`;

            const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("⚠️ Suspicious Link Detected")
              .setDescription(
                `A potentially harmful link was detected in <#${channelId}>`,
              )
              .addFields(
                { name: "Link", value: `\`${url}\`` },
                { name: "Posted by", value: `<@${interaction.author.id}>` },
              )
              .setTimestamp();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel("Jump to Message")
                .setStyle(ButtonStyle.Link)
                .setURL(messageLink),
            );

            await moderatorChannel.send({
              embeds: [embed],
              components: [row],
            });
          }
        }
        return;
      }
    }
  });
};
