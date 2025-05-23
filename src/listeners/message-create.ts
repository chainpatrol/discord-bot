import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  Message,
  TextChannel,
} from "discord.js";

import { CustomClient } from "~/client";
import { ChainPatrolApiClient, chainpatrol } from "~/utils/api";
import { logger } from "~/utils/logger";
import { posthog } from "~/utils/posthog";
import { extractUrls } from "~/utils/url";

interface DiscordConfig {
  config: {
    id: number;
    organizationId: number;
    isMonitoringLinks: boolean;
    moderatorUsernames: string[];
    guildId: string;
    feedChannelId: string | null;
    isFeedEnabled: boolean;
    responseAction: "REACTION" | "NOTIFY" | "DELETE";
    moderatorChannelId: string | null;
    monitoredChannels: string[];
    excludedChannels?: string[];
  } | null;
}

const fetchDiscordConfig = async (guildId: string): Promise<DiscordConfig> => {
  return chainpatrol.fetch<DiscordConfig>({
    method: "POST",
    path: ["v2", "internal", "getDiscordConfig"],
    body: { guildId },
  });
};

const createNotificationEmbed = (message: Message, url: string) => {
  const messageLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ Suspicious Link Detected")
    .setDescription(`A potentially harmful link was detected in <#${message.channelId}>`)
    .addFields(
      { name: "Link", value: `\`${url}\`` },
      { name: "Posted by", value: `<@${message.author.id}>` },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Jump to Message")
      .setStyle(ButtonStyle.Link)
      .setURL(messageLink),
  );

  return { embed, row };
};

const handleBlockedUrl = async (
  message: Message,
  url: string,
  config: DiscordConfig["config"],
) => {
  if (!config) return;

  switch (config.responseAction) {
    case "REACTION":
      await message.react("🚨");
      break;
    case "DELETE":
      await message.delete();
      break;
    case "NOTIFY":
      if (config.moderatorChannelId) {
        const moderatorChannel = await message.guild?.channels.fetch(
          config.moderatorChannelId,
        );
        if (moderatorChannel?.isTextBased()) {
          const { embed, row } = createNotificationEmbed(message, url);
          await moderatorChannel.send({
            embeds: [embed],
            components: [row],
          });
        }
      }
      break;
  }
};

const isValidMessage = (message: Message): boolean => {
  return !message.author.bot && !!message.guildId;
};

const shouldMonitorChannel = (
  config: DiscordConfig["config"],
  channelId: string,
): boolean => {
  if (!config?.isMonitoringLinks) return false;
  if (
    config.monitoredChannels.length > 0 &&
    !config.monitoredChannels.includes(channelId)
  )
    return false;
  if (config.excludedChannels?.includes(channelId)) return false;
  return true;
};

export default (client: CustomClient) => {
  logger.info("MessageCreate listener loaded.");

  client.on(Events.MessageCreate, async (message) => {
    if (!isValidMessage(message)) return;

    posthog.capture({
      distinctId: message.guildId!,
      event: "message_processed",
      properties: {
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
      },
    });

    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
      guildId: message.guildId!,
    });

    if (!connectionStatus?.connected) return;

    const discordConfig = await fetchDiscordConfig(message.guildId!);
    if (!shouldMonitorChannel(discordConfig.config, message.channelId)) return;

    const possibleUrls = extractUrls(message.content);
    if (!possibleUrls) return;

    posthog.capture({
      distinctId: message.guildId!,
      event: "link_checked",
      properties: {
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        linkCount: possibleUrls.length,
      },
    });

    for (const url of possibleUrls) {
      const response = await chainpatrol.asset.check({ content: url });
      if (response.status === "BLOCKED") {
        posthog.capture({
          distinctId: message.guildId!,
          event: "link_blocked",
          properties: {
            guildId: message.guildId,
            channelId: message.channelId,
            userId: message.author.id,
            url: url,
          },
        });
        await handleBlockedUrl(message, url, discordConfig.config);
        return;
      }
    }
  });
};
