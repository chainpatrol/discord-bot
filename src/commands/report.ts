import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CacheType,
  CommandInteraction,
  CommandInteractionOptionResolver,
  ContextMenuCommandBuilder,
  DiscordAPIError,
  DiscordjsErrorCodes,
  EmbedBuilder,
  Guild,
  Message,
  MessageContextMenuCommandInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  User,
  UserContextMenuCommandInteraction,
} from "discord.js";

import { inspectDisputeButtons } from "~/helpers/buttons";
import { chainpatrol, getDiscordGuildStatus, getReportsForOrg } from "~/utils/api";
import { logger } from "~/utils/logger";
import { posthog } from "~/utils/posthog";
import { defangUrl, extractUrls } from "~/utils/url";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option.setName("url").setDescription("The scam link to report").setRequired(true),
  );

export const userContextMenuData = new ContextMenuCommandBuilder()
  .setName("Report User")
  .setType(2);

export const messageContextMenuData = new ContextMenuCommandBuilder()
  .setName("Report Message")
  .setType(3);

export async function execute(
  interaction:
    | CommandInteraction
    | UserContextMenuCommandInteraction
    | MessageContextMenuCommandInteraction,
) {
  posthog.capture({
    distinctId: interaction.guildId ?? "no-guild",
    event: "report_command",
  });

  const { guildId, user } = interaction;

  let urlInput: string;
  let defaultDescription = "";
  let defaultTitle = "";

  if (interaction.isChatInputCommand()) {
    logger.info(`running report command (user.id=${interaction.user.id})`);
    urlInput = interaction.options.getString("url", true);
  } else if (interaction.isUserContextMenuCommand()) {
    logger.info(
      `running report user context menu (user.id=${interaction.user.id}, target.id=${interaction.targetUser.id})`,
    );
    const targetUser = interaction.targetUser;
    urlInput = `https://discord.com/users/${targetUser.id}`;
    defaultTitle = `Discord User Report: ${targetUser.username}#${targetUser.discriminator}`;

    let recentMessagesText = "";
    if (interaction.guild) {
      try {
        const messageFetchPromise = fetchUserRecentMessages(
          interaction.guild,
          targetUser.id,
          5,
        );
        const timeoutPromise = new Promise<
          Array<{ content: string; channelId: string; createdAt: Date | null }>
        >((resolve) => {
          setTimeout(() => resolve([]), 1500);
        });

        const recentMessages = await Promise.race([messageFetchPromise, timeoutPromise]);

        if (recentMessages.length > 0) {
          recentMessagesText = "\n\n**Recent Messages in Server:**\n";
          recentMessages.forEach((msg, index) => {
            const channelMention = msg.channelId
              ? `<#${msg.channelId}>`
              : "Unknown Channel";
            const timestamp = msg.createdAt
              ? `<t:${Math.floor(msg.createdAt.getTime() / 1000)}:R>`
              : "";
            const content = msg.content.substring(0, 200);
            recentMessagesText += `${index + 1}. ${channelMention} ${timestamp}: ${content}${msg.content.length > 200 ? "..." : ""}\n`;
          });
        }
      } catch (error) {
        logger.error(error, "Error fetching recent messages for user report");
      }
    }

    defaultDescription = `Reporting user: ${targetUser.username}#${targetUser.discriminator} (ID: ${targetUser.id})\n\nUser link: ${urlInput}${recentMessagesText}\n\nReason: [Please provide details about why you're reporting this user]`;
  } else if (interaction.isMessageContextMenuCommand()) {
    logger.info(
      `running report message context menu (user.id=${interaction.user.id}, message.id=${interaction.targetMessage.id})`,
    );
    const targetMessage = interaction.targetMessage;
    const messageUrls = extractUrls(targetMessage.content);
    const messageLink = `https://discord.com/channels/${targetMessage.guildId}/${targetMessage.channelId}/${targetMessage.id}`;

    if (messageUrls && messageUrls.length > 0) {
      urlInput = messageUrls[0];
    } else {
      urlInput = messageLink;
    }

    defaultTitle = `Discord Message Report`;
    defaultDescription = `Reporting message from ${targetMessage.author.username}#${targetMessage.author.discriminator} (ID: ${targetMessage.author.id})\n\nMessage content: ${targetMessage.content.substring(0, 500)}${targetMessage.content.length > 500 ? "..." : ""}\n\nMessage link: ${messageLink}`;
  } else {
    return;
  }

  const isDiscordUserLink = urlInput.startsWith("https://discord.com/users/");
  const isDiscordProtocol = urlInput.startsWith("discord://");
  const isChatInputCommand = interaction.isChatInputCommand();

  if (isChatInputCommand && !isDiscordProtocol && !isDiscordUserLink) {
    try {
      const assetCheckResponse = await chainpatrol.asset.check({ content: urlInput });

      if (assetCheckResponse.status === "BLOCKED") {
        await interaction.reply({
          content: `⚠️ **This link, \`${defangUrl(urlInput)}\`, is already Blocked by ChainPatrol.** No need to report it again.`,
          ephemeral: true,
          components: [inspectDisputeButtons(urlInput)],
        });
        return;
      }

      if (assetCheckResponse.status === "ALLOWED") {
        await interaction.reply({
          content: `⚠️ **This link, \`${defangUrl(urlInput)}\`, is on ChainPatrol's Allowlist.**`,
          ephemeral: true,
          components: [inspectDisputeButtons(urlInput)],
        });
        return;
      }

      if (assetCheckResponse.status === "UNKNOWN") {
        const guildStatus = await getDiscordGuildStatus(guildId ?? "");

        const reports = await getReportsForOrg({
          organizationSlug: guildStatus?.organizationSlug ?? "chainpatrol",
          assetContents: [urlInput],
        });

        if (reports.reports.length > 0) {
          await interaction.reply({
            content: `⚠️ **This link, \`${defangUrl(urlInput)}\`, has already been reported to ChainPatrol.** The report is currently under review. Thank you for your vigilance!`,
            ephemeral: true,
          });
          return;
        }
      }
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        logger.error(
          error,
          "Discord API error while checking asset status (url=%s)",
          urlInput,
        );
        throw error;
      }

      await interaction.reply({
        content: `⚠️ **Something went wrong while checking the status of this link, \`${defangUrl(urlInput)}\`.**`,
        ephemeral: true,
      });
      return;
    }
  }

  const options = interaction.isChatInputCommand()
    ? interaction.options
    : ({} as Omit<
        CommandInteractionOptionResolver<CacheType>,
        "getMessage" | "getFocused"
      >);

  const modal = generateModal(
    user,
    options,
    guildId,
    {
      url: urlInput,
      title: defaultTitle,
      description: defaultDescription,
      contactInfo: "",
    },
    interaction.isChatInputCommand() ? undefined : urlInput,
  );
  await interaction.showModal(modal);

  // Wait for modal submission
  try {
    const submissionInteraction = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === "reportModal" && i.user.id === user.id,
      time: 5 * 60 * 1000, // 5 minutes
    });

    const url = submissionInteraction.fields.getTextInputValue("urlInput");
    const escapedUrl = defangUrl(url);
    const title = submissionInteraction.fields.getTextInputValue("titleInput");
    const description =
      submissionInteraction.fields.getTextInputValue("descriptionInput");
    const contactInfo = submissionInteraction.fields.getTextInputValue("contactInput");

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel_report")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const submitButton = new ButtonBuilder()
      .setCustomId("submit_report")
      .setLabel("Submit Report")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🚀");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      cancelButton,
      submitButton,
    );

    const reportEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`Report for ${escapedUrl}`)
      .addFields(
        { name: "Asset", value: `${escapedUrl} | 🔴 Blocked`, inline: false },
        {
          name: "Description",
          value: description || "No description provided.",
          inline: false,
        },
        {
          name: "Contact",
          value: contactInfo || "No contact information provided.",
          inline: false,
        },
      )
      .setFooter({
        text: "Does this information look correct? Double-check that all the details you provided are accurate.",
      });

    // Show ephemeral message with content from the modal and buttons
    const reply = await submissionInteraction.reply({
      content: "Please review your report:",
      embeds: [reportEmbed],
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    // Create a collector for button interactions
    const collector = reply.createMessageComponentCollector({
      filter: (i) =>
        i.user.id === user.id &&
        (i.customId === "cancel_report" || i.customId === "submit_report"),
      time: 5 * 60 * 1000,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId === "cancel_report") {
        await buttonInteraction.update({
          content: `Report cancelled for ${escapedUrl}`,
          embeds: [],
          components: [],
        });
        collector.stop();
      } else if (buttonInteraction.customId === "submit_report") {
        await buttonInteraction.deferUpdate();

        // Submit report to API
        const externalUser = {
          platform: "discord",
          platformIdentifier: user.id,
          avatarUrl: user.displayAvatarURL(),
          displayName: `${user.username}#${user.discriminator}`,
        };

        try {
          const response = await chainpatrol.report.create({
            discordGuildId: guildId ?? undefined,
            externalReporter: externalUser,
            title,
            description,
            contactInfo,
            assets: [{ content: url, status: "BLOCKED" }],
          });
          logger.info(
            response,
            `report submitted (reportId=${response.id}, url=${escapedUrl})`,
          );
          const reportUrl = `https://app.chainpatrol.io/reports/${response.id}`;

          await buttonInteraction.followUp({
            content: `✅ Thanks for submitting a report for \`${escapedUrl}\`! \n\nWe've sent this report to the **${response.organization?.name ?? "ChainPatrol"}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nYou can view your report here: ${reportUrl}\n\nThanks for doing your part in making this space safer 🚀`,
            ephemeral: true,
          });

          await buttonInteraction.editReply({
            components: [],
          });
        } catch (error) {
          logger.error(error, "An error occurred while executing the report command");
          await buttonInteraction.followUp({
            content: `⚠️ Something went wrong trying to submit your report. Please try again later.`,
            ephemeral: true,
          });
        }
        collector.stop();
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        await submissionInteraction.editReply({
          content: `⚠️ **You took too long to complete the report.** Please try again.`,
          components: [],
        });
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      logger.info(`modal interaction timed out (url=${urlInput})`);
      await interaction.followUp({
        content: `⚠️ **You took too long to complete the report.** Please try again.`,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }
}

async function fetchUserRecentMessages(
  guild: Guild,
  userId: string,
  limit: number = 5,
): Promise<Array<{ content: string; channelId: string; createdAt: Date | null }>> {
  const messages: Array<{ content: string; channelId: string; createdAt: Date | null }> =
    [];

  try {
    const channels = await guild.channels.fetch();
    const textChannels = Array.from(channels.values()).filter(
      (channel): channel is TextChannel =>
        !!channel && channel.isTextBased() && !channel.isDMBased(),
    );

    const fetchPromises = textChannels.slice(0, 10).map(async (channel) => {
      try {
        const fetchedMessages = await channel.messages.fetch({ limit: 20 });
        return fetchedMessages
          .filter(
            (msg) =>
              msg.author.id === userId &&
              !msg.author.bot &&
              msg.content.trim().length > 0,
          )
          .map((msg) => ({
            content: msg.content,
            channelId: channel.id,
            createdAt: msg.createdAt,
          }));
      } catch (error) {
        logger.debug(`Could not fetch messages from channel ${channel.id}: ${error}`);
        return [];
      }
    });

    const results = await Promise.allSettled(fetchPromises);
    for (const result of results) {
      if (result.status === "fulfilled") {
        messages.push(...result.value);
        if (messages.length >= limit * 3) {
          break;
        }
      }
    }

    return messages
      .sort((a, b) => {
        const timeA = a.createdAt?.getTime() ?? 0;
        const timeB = b.createdAt?.getTime() ?? 0;
        return timeB - timeA;
      })
      .slice(0, limit);
  } catch (error) {
    logger.error(error, "Error fetching user recent messages");
    return [];
  }
}

function generateModal(
  user: User,
  options: Omit<CommandInteractionOptionResolver<CacheType>, "getMessage" | "getFocused">,
  guildId: string | null,
  defaultValues?: {
    url: string;
    title: string;
    description: string;
    contactInfo: string;
  },
  urlOverride?: string,
) {
  const url = urlOverride || defaultValues?.url || options.getString?.("url", true) || "";

  const modal = new ModalBuilder()
    .setCustomId("reportModal")
    .setTitle("Report Scam Link");

  const urlInput = new TextInputBuilder()
    .setCustomId("urlInput")
    .setLabel("Scam link, user, or message to be reported")
    .setStyle(TextInputStyle.Short)
    .setValue(url)
    .setPlaceholder("example.com or discord://user/123456789");

  const titleInput = new TextInputBuilder()
    .setCustomId("titleInput")
    .setLabel("Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("ex. Phishing Scam on example.com")
    .setValue(defaultValues?.title || `Discord Report: ${url}`);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("descriptionInput")
    .setLabel("Description")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please explain why you think this is a scam`)
    .setValue(defaultValues?.description || "");

  const contactInput = new TextInputBuilder()
    .setCustomId("contactInput")
    .setLabel("Let us know how to best contact you")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please provide any additional contact information you may have`)
    .setValue(defaultValues?.contactInfo || "");

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(urlInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(titleInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      descriptionInput,
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(contactInput),
  );

  return modal;
}
