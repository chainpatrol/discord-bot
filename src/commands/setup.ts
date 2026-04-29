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
import { type ModerationProbeResult, probeModerationProject } from "~/utils/moderation";
import { posthog } from "~/utils/posthog";

const formatProbeStatus = (probe: ModerationProbeResult): string => {
  if (probe.ok) {
    switch (probe.mode) {
      case "enabled":
        return "Enabled (project is active)";
      case "dry_run":
        return "⚠️ Dry run (results are NOT persisted - set mode to 'enabled' in the dashboard)";
      case "disabled":
        return "❌ Disabled (project mode is 'disabled' - set mode to 'enabled' in the dashboard)";
    }
  }
  switch (probe.reason) {
    case "project_disabled":
      return "❌ Project disabled (set the moderation project to 'enabled' in the dashboard)";
    case "project_not_found":
      return "❌ Project not found (verify the moderation project ID in the dashboard)";
    case "unauthorized":
      return "❌ API key invalid (regenerate the moderation API key in the dashboard)";
    case "network_error":
      return "❌ Unreachable (network/DNS/TLS error - check the moderation service)";
    case "unexpected_error":
      return `❌ Unexpected error${probe.status ? ` (status ${probe.status})` : ""}`;
  }
};

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
      .setName("moderation")
      .setDescription("sets up moderation monitoring in the current channel"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("linkmonitoring")
      .setDescription("deprecated alias for /setup moderation"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ignore")
      .setDescription("ignores the current channel from monitoring"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("autoban")
      .setDescription(
        "toggles auto-ban of blocked Discord users detected in monitored channels",
      ),
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
    case "moderation":
      await handleLinkMonitoring(interaction, false);
      break;
    case "linkmonitoring":
      await handleLinkMonitoring(interaction, true);
      break;
    case "ignore":
      await handleIgnore(interaction);
      break;
    case "autoban":
      await handleAutoBan(interaction);
      break;
  }
}

async function handleLinkMonitoring(
  interaction: CommandInteraction,
  isDeprecatedAlias: boolean,
) {
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
        "❌ You need Administrator or Manage Server permissions to configure moderation monitoring.",
      ephemeral: true,
    });
    return;
  }

  try {
    const currentConfig = await chainpatrol.fetch<{
      config: {
        monitoredChannels: string[];
        isMonitoringLinks: boolean;
        moderationMonitoringEnabled: boolean;
        moderationProjectId: number | null;
        moderationApiKey: string | null;
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId: interaction.guildId },
    });

    const currentChannels = currentConfig?.config?.monitoredChannels || [];
    const isMonitoringAllChannels =
      currentConfig?.config?.isMonitoringLinks && currentChannels.length === 0;
    const moderationMonitoringEnabled =
      currentConfig?.config?.moderationMonitoringEnabled ?? false;
    const hasModerationSetup = Boolean(
      currentConfig?.config?.moderationApiKey &&
        currentConfig?.config?.moderationProjectId,
    );

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
        content: `${
          isDeprecatedAlias
            ? "⚠️ `/setup linkmonitoring` is deprecated. Use `/setup moderation` going forward.\n\n"
            : ""
        }Currently monitoring all channels. Would you like to switch to monitoring only this specific channel instead?`,
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
              "✅ Switched to monitoring only this channel. ChainPatrol moderation is now scoped to this channel.",
            components: [],
          });
        } else {
          await i.update({
            content: "❌ Moderation monitoring setup cancelled.",
            components: [],
          });
        }
      });

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "❌ Moderation monitoring setup timed out. Please try again.",
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
          "This channel is currently being monitored for moderation. Would you like to remove it?",
        components: [row],
        ephemeral: true,
      });

      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm_remove_monitoring") {
          const nextChannels = currentChannels.filter(
            (id) => id !== interaction.channelId,
          );
          await chainpatrol.fetch({
            method: "POST",
            path: ["v2", "internal", "updateDiscordConfig"],
            body: {
              guildId: interaction.guildId,
              monitoredChannels: nextChannels,
              moderationMonitoringEnabled: nextChannels.length > 0,
            },
          });

          await i.update({
            content: "✅ Channel has been removed from moderation monitoring.",
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

    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus({
      guildId: interaction.guildId,
    });
    const dashboardUrl = connectionStatus?.organizationUrl
      ? `${connectionStatus.organizationUrl}/settings/integrations`
      : `${env.CHAINPATROL_API_URL}/dashboard`;
    const setupModerationButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Set Up Moderation")
      .setURL(dashboardUrl);
    const setupRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      setupModerationButton,
    );

    const setupPrompt = hasModerationSetup
      ? moderationMonitoringEnabled
        ? "Would you like ChainPatrol moderation to monitor this channel? Moderation is already enabled for this server."
        : "Would you like to enable ChainPatrol moderation for this channel?"
      : "Would you like to set up channel monitoring? Moderation is not configured yet. Set your Moderation Project ID in the ChainPatrol dashboard to enable moderation.";

    const response = await interaction.reply({
      content: `${
        isDeprecatedAlias
          ? "⚠️ `/setup linkmonitoring` is deprecated. Use `/setup moderation` going forward.\n\n"
          : ""
      }${setupPrompt}`,
      components: hasModerationSetup ? [row] : [row, setupRow],
      ephemeral: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "confirm_monitoring") {
        let probeWarning = "";
        if (
          hasModerationSetup &&
          currentConfig?.config?.moderationApiKey &&
          currentConfig?.config?.moderationProjectId
        ) {
          const probe = await probeModerationProject({
            apiKey: currentConfig.config.moderationApiKey,
            projectId: currentConfig.config.moderationProjectId,
          });
          if (probe.ok && probe.mode === "dry_run") {
            probeWarning =
              `\n\n⚠️ The moderation project is in **dry run** mode - results will NOT be persisted. ` +
              `Set the project mode to 'enabled' in the dashboard: ${dashboardUrl}`;
          } else if (probe.ok && probe.mode === "disabled") {
            probeWarning = `\n\n❌ The moderation project mode is currently **'disabled'**. The bot will not act on messages until you set the project mode to 'enabled' in the dashboard: ${dashboardUrl}`;
          } else if (!probe.ok) {
            probeWarning = `\n\n❌ Moderation health check failed: ${formatProbeStatus(probe)}\nFix this in the dashboard: ${dashboardUrl}`;
          }
        }

        await chainpatrol.fetch({
          method: "POST",
          path: ["v2", "internal", "updateDiscordConfig"],
          body: {
            guildId: interaction.guildId,
            monitoredChannels: [...currentChannels, interaction.channelId],
            moderationMonitoringEnabled: hasModerationSetup,
          },
        });

        await i.update({
          content: hasModerationSetup
            ? `✅ Moderation monitoring is enabled for this channel.${probeWarning}`
            : `✅ Channel monitoring was saved, but moderation is not configured yet. Configure it in the dashboard: ${dashboardUrl}`,
          components: [],
        });
      } else {
        await i.update({
          content: "❌ Moderation setup cancelled.",
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: "❌ Moderation setup timed out. Please try again.",
          components: [],
        });
      }
    });
  } catch (error) {
    logger.error("Error setting up moderation monitoring:", error);
    await interaction.reply({
      content:
        "❌ There was an error setting up moderation monitoring. Please try again later.",
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
          excludedChannels: string[];
          isAutoBanEnabled: boolean;
        } | null;
      }>({
        method: "POST",
        path: ["v2", "internal", "getDiscordConfig"],
        body: { guildId: interaction.guildId },
      });

      const config = discordConfig?.config;
      const monitoredChannels = config?.monitoredChannels ?? [];
      const excludedChannels = config?.excludedChannels ?? [];
      const isAllChannelsScope = monitoredChannels.length === 0;
      const channelScope = isAllChannelsScope
        ? "All accessible channels (no explicit channel scope set)"
        : monitoredChannels.map((id) => `<#${id}>`).join(", ");
      const feedStatus =
        config?.isFeedEnabled && config.feedChannelId
          ? `Enabled (posting to <#${config.feedChannelId}>)`
          : "Disabled";
      const hasModerationConfig = Boolean(
        config?.moderationApiKey && config?.moderationProjectId,
      );
      const moderationStatus = config?.moderationMonitoringEnabled
        ? hasModerationConfig
          ? "Enabled"
          : "Blocked (missing moderation setup)"
        : "Disabled";
      const projectIdStatus = config?.moderationProjectId
        ? String(config.moderationProjectId)
        : "Not set";

      let projectHealthStatus = "Not probed (moderation not configured)";
      if (
        hasModerationConfig &&
        config?.moderationApiKey &&
        config?.moderationProjectId
      ) {
        const probe = await probeModerationProject({
          apiKey: config.moderationApiKey,
          projectId: config.moderationProjectId,
        });
        projectHealthStatus = formatProbeStatus(probe);
      }
      const responseAction = config?.responseAction ?? "REACTION";
      const moderatorChannel = config?.moderatorChannelId
        ? `<#${config.moderatorChannelId}>`
        : "Not set";
      const organizationName = response.organizationName ?? "Unknown";
      const dashboardLink = response.organizationUrl
        ? `${response.organizationUrl}/settings/integrations`
        : `${env.CHAINPATROL_API_URL}/dashboard`;
      const excludedScope =
        excludedChannels.length > 0
          ? excludedChannels.map((id) => `<#${id}>`).join(", ")
          : "None";
      const nextStep = hasModerationConfig
        ? isAllChannelsScope
          ? "Moderation is currently active across all channels the bot can access. Run `/setup moderation` in a channel if you want to scope monitoring."
          : "Moderation is active only in the configured scoped channels. Run `/setup moderation` in a channel to add or remove it from the scope."
        : `Finish moderation setup in dashboard: ${dashboardLink}`;
      const autoBanStatus = config?.isAutoBanEnabled ? "Enabled" : "Disabled";
      const setupSummary = [
        "**Connection**",
        `- Status: Connected`,
        `- Organization: ${organizationName}`,
        "",
        "**Monitoring**",
        `- Moderation monitoring: ${moderationStatus}`,
        `- Response action: ${responseAction}`,
        `- Channel scope: ${channelScope}`,
        `- Excluded channels: ${excludedScope}`,
        "",
        "**Moderation Config**",
        `- Configured: ${hasModerationConfig ? "Yes" : "No"}`,
        `- Project ID: ${projectIdStatus}`,
        `- Project health: ${projectHealthStatus}`,
        `- Moderator channel: ${moderatorChannel}`,
        "",
        "**Auto-Ban**",
        `- ${autoBanStatus}`,
        "",
        "**Feed**",
        `- ${feedStatus}`,
        "",
        "**Next Step**",
        `- ${nextStep}`,
      ].join("\n");

      await interaction.editReply({
        content: `✅ **ChainPatrol Setup Status**\n\n${setupSummary}`,
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
          "❌ This channel is currently being monitored. Please remove it from monitoring first using `/setup moderation`.",
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

async function handleAutoBan(interaction: CommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    await interaction.reply({
      content:
        "❌ You need Administrator or Manage Server permissions to configure auto-ban.",
      ephemeral: true,
    });
    return;
  }

  try {
    const currentConfig = await chainpatrol.fetch<{
      config: {
        isAutoBanEnabled: boolean;
      } | null;
    }>({
      method: "POST",
      path: ["v2", "internal", "getDiscordConfig"],
      body: { guildId: interaction.guildId },
    });

    const isCurrentlyEnabled = currentConfig?.config?.isAutoBanEnabled ?? false;

    const toggleButton = new ButtonBuilder()
      .setCustomId("toggle_autoban")
      .setLabel(isCurrentlyEnabled ? "Disable Auto-Ban" : "Enable Auto-Ban")
      .setStyle(isCurrentlyEnabled ? ButtonStyle.Danger : ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel_autoban")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      toggleButton,
      cancelButton,
    );

    const statusText = isCurrentlyEnabled ? "**enabled**" : "**disabled**";
    const response = await interaction.reply({
      content: `Auto-ban is currently ${statusText}.\n\nWhen enabled, the bot will automatically ban Discord users that are on ChainPatrol's blocklist when their IDs are detected in monitored channels. Unknown user IDs will be reported to ChainPatrol for review.\n\nThe bot requires the **Ban Members** permission to use this feature.`,
      components: [row],
      ephemeral: true,
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === "toggle_autoban") {
        const newValue = !isCurrentlyEnabled;

        await chainpatrol.fetch({
          method: "POST",
          path: ["v2", "internal", "updateDiscordConfig"],
          body: {
            guildId: interaction.guildId,
            isAutoBanEnabled: newValue,
          },
        });

        await i.update({
          content: newValue
            ? "✅ Auto-ban has been **enabled**. The bot will now automatically ban blocked Discord users detected in monitored channels."
            : "✅ Auto-ban has been **disabled**.",
          components: [],
        });
      } else {
        await i.update({
          content: "❌ Auto-ban setup cancelled.",
          components: [],
        });
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: "❌ Auto-ban setup timed out. Please try again.",
          components: [],
        });
      }
    });
  } catch (error) {
    logger.error("Error setting up auto-ban:", error);
    await interaction.reply({
      content: "❌ There was an error setting up auto-ban. Please try again later.",
      ephemeral: true,
    });
  }
}
