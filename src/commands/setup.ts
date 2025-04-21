import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  CommandInteraction,
  ComponentType,
  GuildBasedChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

import { env } from "~/env";
import { ChainPatrolApiClient, chainpatrol } from "~/utils/api";
import { logger } from "~/utils/logger";
import { posthog } from "~/utils/posthog";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("sets up the bot")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild,
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("connect")
      .setDescription("connects the bot to your ChainPatrol organization"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("disconnect")
      .setDescription("disconnects the bot from your ChainPatrol organization"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription(
        "checks the status of the bot's connection and info about the current channel",
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("feed")
      .setDescription("sets the channel for the bot to post in")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to post in")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("linkmonitoring")
      .setDescription("sets up link monitoring in the current channel"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ignore")
      .setDescription("ignores the current channel from link monitoring"),
  );

export async function execute(interaction: CommandInteraction) {
  posthog.capture({
    distinctId: interaction.guildId ?? "no-guild",
    event: "setup_command",
  });

  if (!interaction.isChatInputCommand()) return;

  const { options } = interaction;

  switch (options.getSubcommand()) {
    case "connect":
      await handleConnect(interaction);
      break;
    case "disconnect":
      await handleDisconnect(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    case "feed":
      await handleFeed(interaction);
      break;
    case "linkmonitoring":
      await handleLinkMonitoring(interaction);
      break;
    case "ignore":
      await handleIgnore(interaction);
      break;
  }
}

async function handleLinkMonitoring(interaction: CommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.channel) {
    await interaction.reply({
      content: "Could not find the current channel.",
      ephemeral: true,
    });
    return;
  }

  // Check if user has Administrator or Manage Guild permissions
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content:
        "❌ You need Administrator or Manage Server permissions to set up link monitoring.",
      ephemeral: true,
    });
    return;
  }

  try {
    const currentConfig = await chainpatrol.fetch<{
      config: {
        monitoredChannels: string[];
        isMonitoringLinks: boolean;
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId: interaction.guildId },
    });

    const currentChannels = currentConfig?.config?.monitoredChannels || [];
    const isMonitoringAllChannels =
      currentConfig?.config?.isMonitoringLinks && currentChannels.length === 0;

    if (isMonitoringAllChannels) {
      const yesButton = new ButtonBuilder()
        .setCustomId("confirm_specific_monitoring")
        .setLabel("Yes")
        .setStyle(ButtonStyle.Success);

      const noButton = new ButtonBuilder()
        .setCustomId("cancel_monitoring")
        .setLabel("No")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        yesButton,
        noButton,
      );

      const response = await interaction.reply({
        content:
          "Currently monitoring all channels. Would you like to switch to monitoring only this specific channel instead?",
        components: [row],
        ephemeral: true,
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_specific_monitoring") {
          await chainpatrol.fetch({
            method: "POST",
            path: ["v2", "internal", "updateDiscordConfig"],
            body: {
              guildId: interaction.guildId,
              monitoredChannels: [interaction.channelId],
            },
          });

          await i.update({
            content:
              "✅ Switched to monitoring only this channel. ChainPatrol will now monitor this channel for suspicious links and messages.",
            components: [],
          });
        } else {
          await i.update({
            content: "❌ Channel monitoring setup cancelled.",
            components: [],
          });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "❌ Channel monitoring setup timed out. Please try again.",
            components: [],
          });
        }
      });
      return;
    }

    if (currentChannels.includes(interaction.channelId)) {
      const yesButton = new ButtonBuilder()
        .setCustomId("confirm_remove_monitoring")
        .setLabel("Yes")
        .setStyle(ButtonStyle.Success);

      const noButton = new ButtonBuilder()
        .setCustomId("cancel_remove_monitoring")
        .setLabel("No")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        yesButton,
        noButton,
      );

      const response = await interaction.reply({
        content:
          "This channel is currently being monitored. Would you like to **remove** it from monitoring?",
        components: [row],
        ephemeral: true,
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_remove_monitoring") {
          await chainpatrol.fetch({
            method: "POST",
            path: ["v2", "internal", "updateDiscordConfig"],
            body: {
              guildId: interaction.guildId,
              monitoredChannels: currentChannels.filter(
                (id) => id !== interaction.channelId,
              ),
            },
          });

          await i.update({
            content:
              "✅ Channel has been removed from monitoring. ChainPatrol will no longer monitor this channel for suspicious links and messages.",
            components: [],
          });
        } else {
          await i.update({
            content: "❌ Channel monitoring removal cancelled.",
            components: [],
          });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "❌ Channel monitoring removal timed out. Please try again.",
            components: [],
          });
        }
      });
      return;
    }

    const yesButton = new ButtonBuilder()
      .setCustomId("confirm_monitoring")
      .setLabel("Yes")
      .setStyle(ButtonStyle.Success);

    const noButton = new ButtonBuilder()
      .setCustomId("cancel_monitoring")
      .setLabel("No")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

    const response = await interaction.reply({
      content:
        "Would you like ChainPatrol to monitor this channel for suspicious links and messages across our blocklist and security network?",
      components: [row],
      ephemeral: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "confirm_monitoring") {
        await chainpatrol.fetch({
          method: "POST",
          path: ["v2", "internal", "updateDiscordConfig"],
          body: {
            guildId: interaction.guildId,
            monitoredChannels: [...currentChannels, interaction.channelId],
          },
        });

        await i.update({
          content:
            "✅ Channel monitoring has been enabled. ChainPatrol will now monitor this channel for suspicious links and messages.",
          components: [],
        });
      } else {
        await i.update({
          content: "❌ Channel monitoring setup cancelled.",
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: "❌ Channel monitoring setup timed out. Please try again.",
          components: [],
        });
      }
    });
  } catch (error) {
    logger.error("Error setting up link monitoring:", error);
    await interaction.reply({
      content:
        "❌ There was an error setting up link monitoring. Please try again later.",
      ephemeral: true,
    });
  }
}

async function handleConnect(interaction: CommandInteraction) {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
    guildId,
  });

  if (!connectionStatus) {
    await interaction.editReply({
      content: "Error checking bot status",
    });
    return;
  }

  const { connected } = connectionStatus;

  if (connected) {
    await interaction.editReply({
      content:
        "The bot is already connected to an organization on ChainPatrol. Run `/setup disconnect` to disconnect the bot from your organization if you're an admin",
    });
    return;
  }

  await interaction.editReply({
    content:
      "Click the button below to connect your ChainPatrol organization. After connecting, you can run `/setup status` to check the status of the bot's connection",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "Connect",
            url: `${env.CHAINPATROL_API_URL}/admin/connect/discord?guildId=${guildId}`,
          },
        ],
      },
    ],
  });
}

async function handleDisconnect(interaction: CommandInteraction) {
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
    guildId,
  });

  if (!connectionStatus) {
    await interaction.editReply({
      content: "Error checking bot status",
    });
    return;
  }

  const { connected } = connectionStatus;

  if (!connected) {
    await interaction.editReply({
      content: "The bot is not connected to any organization on ChainPatrol",
    });
    return;
  }

  await interaction.editReply({
    content:
      "Click the button below to disconnect your ChainPatrol organization. After disconnecting, you can run `/setup status` to check the status of the bot's connection",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "Disconnect",
            url: `${env.CHAINPATROL_API_URL}/admin/disconnect/discord?guildId=${guildId}`,
          },
        ],
      },
    ],
  });
}

async function handleStatus(interaction: CommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await ChainPatrolApiClient.fetchDiscordGuildStatus({
      guildId: interaction.guildId,
    });

    if (response?.connected) {
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
          monitoredChannels: string[];
        } | null;
      }>({
        method: "POST",
        path: ["v2", "internal", "getDiscordConfig"],
        body: { guildId: interaction.guildId },
      });

      const currentChannelId = interaction.channelId;
      const monitoredChannels = discordConfig?.config?.monitoredChannels || [];
      const isMonitoringAllChannels =
        discordConfig?.config?.isMonitoringLinks && monitoredChannels.length === 0;
      const isMonitoredChannel =
        isMonitoringAllChannels || monitoredChannels.includes(currentChannelId);
      const isModeratorChannel =
        discordConfig?.config?.moderatorChannelId === currentChannelId;

      let channelStatus = "";
      if (isMonitoringAllChannels) {
        channelStatus += "🔍 All channels are being monitored for links.\n";
      } else if (isMonitoredChannel) {
        channelStatus += "🔍 This channel is actively monitored for links.\n";
      }
      if (isModeratorChannel) {
        channelStatus += "👮 This channel is set as the moderator channel.\n";
      }

      await interaction.editReply({
        content: `✅ This server is connected to ChainPatrol.\nOrganization: ${response.organizationName}\n\n${channelStatus}`,
      });
    } else {
      await interaction.editReply({
        content: "❌ This server is not connected to ChainPatrol.",
      });
    }
  } catch (error) {
    logger.error("Error checking ChainPatrol status:", error);
    await interaction.editReply({
      content:
        "❌ There was an error checking the ChainPatrol status. Please try again later.",
    });
  }
}

async function handleFeed(interaction: CommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.get("channel", true).channel as GuildBasedChannel;

  if (!channel.isTextBased()) {
    await interaction.reply({
      content: "Please select a text channel.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
      guildId: interaction.guildId,
    });

    if (!connectionStatus?.connected) {
      await interaction.editReply({
        content:
          "❌ The bot is not connected to any organization on ChainPatrol. Run `/setup connect` to connect the bot to your organization",
      });
      return;
    }

    await interaction.editReply({
      content:
        "Click the button below to connect your ChainPatrol organization to this channel. After connecting, you can run `/setup status` to check the status of the bot's connection",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "Connect Feed",
              url: `${env.CHAINPATROL_API_URL}/admin/connect-feed/discord?guildId=${interaction.guildId}&channelId=${channel.id}&channelName=${channel.name}`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    logger.error("Error setting feed channel:", error);
    await interaction.editReply({
      content: "❌ There was an error setting the feed channel. Please try again later.",
    });
  }
}

async function handleIgnore(interaction: CommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.channel) {
    await interaction.reply({
      content: "Could not find the current channel.",
      ephemeral: true,
    });
    return;
  }

  // Check if user has Administrator or Manage Guild permissions
  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content:
        "❌ You need Administrator or Manage Server permissions to ignore channels.",
      ephemeral: true,
    });
    return;
  }

  try {
    const currentConfig = await chainpatrol.fetch<{
      config: {
        excludedChannels: string[];
        monitoredChannels: string[];
        isMonitoringLinks: boolean;
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId: interaction.guildId },
    });

    const currentExcludedChannels = currentConfig?.config?.excludedChannels || [];
    const currentMonitoredChannels = currentConfig?.config?.monitoredChannels || [];
    const isMonitoringAllChannels =
      currentConfig?.config?.isMonitoringLinks && currentMonitoredChannels.length === 0;

    if (currentExcludedChannels.includes(interaction.channelId)) {
      await interaction.reply({
        content: "❌ This channel is already being ignored.",
        ephemeral: true,
      });
      return;
    }

    if (
      isMonitoringAllChannels ||
      currentMonitoredChannels.includes(interaction.channelId)
    ) {
      await interaction.reply({
        content:
          "❌ This channel is currently being monitored. Please remove it from monitoring first using `/setup linkmonitoring`.",
        ephemeral: true,
      });
      return;
    }

    const yesButton = new ButtonBuilder()
      .setCustomId("confirm_ignore")
      .setLabel("Yes")
      .setStyle(ButtonStyle.Success);

    const noButton = new ButtonBuilder()
      .setCustomId("cancel_ignore")
      .setLabel("No")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

    const response = await interaction.reply({
      content: "Would you like ChainPatrol to ignore this channel from link monitoring?",
      components: [row],
      ephemeral: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "confirm_ignore") {
        await chainpatrol.fetch({
          method: "POST",
          path: ["v2", "internal", "updateDiscordConfig"],
          body: {
            guildId: interaction.guildId,
            excludedChannels: [...currentExcludedChannels, interaction.channelId],
          },
        });

        await i.update({
          content:
            "✅ Channel has been ignored. ChainPatrol will no longer monitor this channel for suspicious links and messages.",
          components: [],
        });
      } else {
        await i.update({
          content: "❌ Channel ignore setup cancelled.",
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: "❌ Channel ignore setup timed out. Please try again.",
          components: [],
        });
      }
    });
  } catch (error) {
    logger.error("Error setting up channel ignore:", error);
    await interaction.reply({
      content: "❌ There was an error setting up channel ignore. Please try again later.",
      ephemeral: true,
    });
  }
}
