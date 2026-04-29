import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  Message,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";

import { CustomClient } from "~/client";
import { ChainPatrolApiClient, chainpatrol } from "~/utils/api";
import { logger } from "~/utils/logger";
import { moderateText } from "~/utils/moderation";
import { posthog } from "~/utils/posthog";
import { extractUrls } from "~/utils/url";

interface DiscordConfig {
  config: {
    id: number;
    organizationId: number;
    isMonitoringLinks: boolean;
    moderationMonitoringEnabled: boolean;
    moderationProjectId: number | null;
    moderationApiKey: string | null;
    moderatorUsernames: string[];
    guildId: string;
    feedChannelId: string | null;
    isFeedEnabled: boolean;
    responseAction: "REACTION" | "NOTIFY" | "DELETE" | null;
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

const getFlaggedCategories = (labels: Record<string, { flagged: boolean }>) => {
  return Object.entries(labels)
    .filter(([, value]) => value.flagged)
    .map(([key]) => key);
};

const createModerationNotificationEmbed = (message: Message, categories: string[]) => {
  const messageLink = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
  const categoryText = categories.length > 0 ? categories.join(", ") : "unknown";

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ Moderation Alert")
    .setDescription(`A flagged message was detected in <#${message.channelId}>`)
    .addFields(
      { name: "Categories", value: categoryText },
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

const MODERATION_NOTICE_TTL_MS = 10000;

const sendDeletionNotice = async (message: Message, categories: string[]) => {
  const categoryText = categories.length > 0 ? categories.join(", ") : "policy";
  const notice = await message.channel.send(
    `<@${message.author.id}> your message was deleted for the flagged reason (${categoryText}).`,
  );
  setTimeout(() => {
    void notice.delete().catch(() => {});
  }, MODERATION_NOTICE_TTL_MS);
};

const notifyModerators = async (
  message: Message,
  config: DiscordConfig["config"],
  categories: string[],
) => {
  if (!config?.moderatorChannelId) {
    return;
  }
  const moderatorChannel = await message.guild?.channels.fetch(config.moderatorChannelId);
  if (!moderatorChannel?.isTextBased()) {
    return;
  }
  const { embed, row } = createModerationNotificationEmbed(message, categories);
  await moderatorChannel.send({
    embeds: [embed],
    components: [row],
  });
};

const handleModerationFlag = async (
  message: Message,
  config: DiscordConfig["config"],
  categories: string[],
) => {
  if (!config) return;

  switch (config.responseAction) {
    case "REACTION":
      await message.react("🚨");
      break;
    case "DELETE":
      await message.delete();
      await notifyModerators(message, config, categories);
      await sendDeletionNotice(message, categories);
      break;
    case "NOTIFY":
      await notifyModerators(message, config, categories);
      break;
  }
};

const isValidMessage = (message: Message): boolean => {
  return !message.author.bot && !!message.guildId;
};

const isAdminMessage = (message: Message): boolean => {
  return Boolean(message.member?.permissions.has(PermissionFlagsBits.Administrator));
};

const shouldMonitorChannel = (
  config: DiscordConfig["config"],
  channelId: string,
): boolean => {
  if (!config?.isMonitoringLinks && !config?.moderationMonitoringEnabled) return false;
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
    if (!isValidMessage(message)) {
      return;
    }

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

    if (!connectionStatus?.connected) {
      return;
    }

    const discordConfig = await fetchDiscordConfig(message.guildId!);
    logger.info(
      {
        moderation: {
          event: "discord_config_loaded",
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          moderationMonitoringEnabled:
            discordConfig.config?.moderationMonitoringEnabled ?? false,
          moderationProjectId: discordConfig.config?.moderationProjectId ?? null,
          hasModerationApiKey: Boolean(discordConfig.config?.moderationApiKey),
          isMonitoringLinks: discordConfig.config?.isMonitoringLinks ?? false,
          monitoredChannels: discordConfig.config?.monitoredChannels ?? [],
          excludedChannels: discordConfig.config?.excludedChannels ?? [],
        },
      },
      "Loaded Discord config",
    );

    if (!shouldMonitorChannel(discordConfig.config, message.channelId)) {
      logger.info(
        {
          moderation: {
            event: "discord_monitoring_skipped_by_channel_scope",
            guildId: message.guildId,
            channelId: message.channelId,
            moderationMonitoringEnabled:
              discordConfig.config?.moderationMonitoringEnabled ?? false,
            moderationProjectId: discordConfig.config?.moderationProjectId ?? null,
            hasModerationApiKey: Boolean(discordConfig.config?.moderationApiKey),
          },
        },
        "Skipping Discord moderation due to channel scope",
      );
      return;
    }

    if (
      discordConfig.config?.moderationMonitoringEnabled &&
      discordConfig.config.moderationProjectId &&
      discordConfig.config.moderationApiKey
    ) {
      if (isAdminMessage(message)) {
        logger.info(
          {
            moderation: {
              event: "discord_moderation_skipped_admin_user",
              guildId: message.guildId,
              channelId: message.channelId,
              userId: message.author.id,
            },
          },
          "Skipping Discord moderation for admin user",
        );
      } else {
        try {
          logger.info(
            {
              moderation: {
                event: "discord_submit_for_moderation",
                guildId: message.guildId,
                channelId: message.channelId,
                userId: message.author.id,
                projectId: discordConfig.config.moderationProjectId,
                hasModerationApiKey: Boolean(discordConfig.config.moderationApiKey),
                responseAction: discordConfig.config.responseAction,
              },
            },
            "Submitting Discord message for moderation",
          );
          const moderationResult = await moderateText({
            text: message.content,
            apiKey: discordConfig.config.moderationApiKey,
            projectId: discordConfig.config.moderationProjectId,
            authorId: message.author.id,
            entityId: `${message.guildId}:${message.id}`,
            contextIds: [message.channelId],
          });

          if (moderationResult.flagged) {
            const flaggedCategories = getFlaggedCategories(moderationResult.labels);
            logger.info(
              {
                moderation: {
                  event: "discord_message_flagged",
                  guildId: message.guildId,
                  channelId: message.channelId,
                  userId: message.author.id,
                  responseAction: discordConfig.config.responseAction,
                  categories: flaggedCategories,
                },
              },
              "Discord message flagged by moderation",
            );
            await handleModerationFlag(message, discordConfig.config, flaggedCategories);
            return;
          }
        } catch (error) {
          logger.error(
            {
              moderation: {
                event: "discord_moderation_error",
                guildId: message.guildId,
                channelId: message.channelId,
                userId: message.author.id,
                projectId: discordConfig.config.moderationProjectId,
                hasModerationApiKey: Boolean(discordConfig.config.moderationApiKey),
              },
              error,
            },
            "Failed Discord moderation check",
          );
        }
      }
    } else {
      logger.info(
        {
          moderation: {
            event: "discord_moderation_skipped_missing_config",
            guildId: message.guildId,
            channelId: message.channelId,
            moderationMonitoringEnabled:
              discordConfig.config?.moderationMonitoringEnabled ?? false,
            moderationProjectId: discordConfig.config?.moderationProjectId ?? null,
            hasModerationApiKey: Boolean(discordConfig.config?.moderationApiKey),
          },
        },
        "Skipping Discord moderation because setup is incomplete",
      );
    }

    if (!discordConfig.config?.isMonitoringLinks) {
      return;
    }

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
        logger.info(
          `Blocked URL detected - Guild: ${message.guildId}, Channel: ${message.channelId}, Action: ${discordConfig.config?.responseAction}`,
        );
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
