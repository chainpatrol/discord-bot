import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  GuildBasedChannel,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { env } from "~/env";
import { ChainPatrolApiClient } from "~/utils/api";
import { CommandContext } from "../types";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("sets up the bot")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("connect")
      .setDescription("connects the bot to your ChainPatrol organization")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("disconnect")
      .setDescription("disconnects the bot from your ChainPatrol organization")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("checks the status of the bot's connection")
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
          .addChannelTypes(ChannelType.GuildText)
      )
  );

export async function execute(ctx: CommandContext) {
  const { interaction, logger } = ctx;

  if (!interaction.isChatInputCommand()) {
    return;
  }

  // Only allow the command to be run in a server
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: "This command can only be run in a server",
    });
    return;
  }

  // Only allow admins to run the command
  if (!interaction.memberPermissions?.has("Administrator")) {
    await interaction.reply({
      ephemeral: true,
      content: "You must be an administrator to run this command",
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const { options } = interaction;
  const subcommand = options.getSubcommand(true);

  try {
    if (subcommand === "connect") {
      await connect(ctx);
    } else if (subcommand === "disconnect") {
      await disconnect(ctx);
    } else if (subcommand === "status") {
      await status(ctx);
    } else if (subcommand === "feed") {
      await feed(ctx);
    }
  } catch (error) {
    // Handle errors
    logger.error(error);
    await interaction.editReply({
      content: "Error running setup command",
    });
  }
}

async function connect({ interaction }: CommandContext) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return;
  }

  // Check if the bot is already connected to the server
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

  // Display a button to open the ChainPatrol login page
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

async function disconnect({ interaction }: CommandContext) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return;
  }

  // Check if the bot is connected to the server
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

  // Display a button to open the ChainPatrol disconnect page
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

async function status({ interaction, logger }: CommandContext) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return;
  }

  // Check if the bot is connected to the server
  try {
    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus(
      { guildId }
    );

    if (!connectionStatus) {
      await interaction.editReply({
        content: "Error checking bot status",
      });
      return;
    }

    const { connected, channelId, organizationName, organizationUrl } =
      connectionStatus;

    if (!connected) {
      await interaction.editReply({
        content:
          "❌ The bot is not connected to any organization on ChainPatrol. Run `/setup connect` to connect the bot to your organization",
      });
      return;
    }

    let channel: GuildBasedChannel | null = null;

    if (channelId && interaction.guild) {
      channel = await interaction.guild.channels.fetch(channelId);
    }

    if (!channel) {
      await interaction.editReply({
        content: `✅ The bot is connected to [${organizationName}](${organizationUrl}) on ChainPatrol`,
      });
      return;
    }

    await interaction.editReply({
      content: `✅ The bot is connected to [${organizationName}](${organizationUrl}) on ChainPatrol and is posting alerts to <#${channelId}>`,
    });
  } catch (error) {
    logger.error(error);
    await interaction.editReply({
      content: "Error checking bot status",
    });
  }
}

async function feed({ interaction, logger }: CommandContext) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const channel = interaction.options.getChannel("channel", true);

  try {
    const connectionStatus = await ChainPatrolApiClient.fetchDiscordGuildStatus(
      { guildId }
    );

    if (!connectionStatus) {
      await interaction.editReply({
        content: "Error checking bot status",
      });
      return;
    }

    if (!connectionStatus.connected) {
      await interaction.editReply({
        content:
          "❌ The bot is not connected to any organization on ChainPatrol. Run `/setup connect` to connect the bot to your organization",
      });
      return;
    }

    // Display a button to open the ChainPatrol connect feed page
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
              url: `${env.CHAINPATROL_API_URL}/admin/connect-feed/discord?guildId=${guildId}&channelId=${channel.id}&channelName=${channel.name}`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    logger.error(error);
    await interaction.editReply({
      content: "Error setting up feed",
    });
  }
}
