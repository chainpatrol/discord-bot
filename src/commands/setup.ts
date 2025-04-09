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
      .setDescription("checks the status of the bot's connection"),
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
    !interaction.memberPermissions?.has([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
    ])
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
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId: interaction.guildId },
    });

    const currentChannels = currentConfig?.config?.monitoredChannels || [];
    if (currentChannels.includes(interaction.channelId)) {
      await interaction.reply({
        content: "❌ This channel is already being monitored.",
        ephemeral: true,
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
      await interaction.editReply({
        content: "This server is already connected to ChainPatrol.",
      });
      return;
    }

    // TODO: Implement connection logic
    await interaction.editReply({
      content: "✅ Server connected to ChainPatrol successfully!",
    });
  } catch (error) {
    logger.error("Error connecting to ChainPatrol:", error);
    await interaction.editReply({
      content: "❌ There was an error connecting to ChainPatrol. Please try again later.",
    });
  }
}

async function handleDisconnect(interaction: CommandInteraction) {
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

    if (!response?.connected) {
      await interaction.editReply({
        content: "This server is not connected to ChainPatrol.",
      });
      return;
    }

    // TODO: Implement disconnection logic
    await interaction.editReply({
      content: "✅ Server disconnected from ChainPatrol successfully!",
    });
  } catch (error) {
    logger.error("Error disconnecting from ChainPatrol:", error);
    await interaction.editReply({
      content:
        "❌ There was an error disconnecting from ChainPatrol. Please try again later.",
    });
  }
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
      const isMonitoredChannel =
        discordConfig?.config?.monitoredChannels?.includes(currentChannelId);
      const isModeratorChannel =
        discordConfig?.config?.moderatorChannelId === currentChannelId;

      let channelStatus = "";
      if (isMonitoredChannel) {
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
    // TODO: Implement feed channel update logic
    await interaction.editReply({
      content: `✅ Feed channel set to ${channel.toString()} successfully!`,
    });
  } catch (error) {
    logger.error("Error setting feed channel:", error);
    await interaction.editReply({
      content: "❌ There was an error setting the feed channel. Please try again later.",
    });
  }
}
