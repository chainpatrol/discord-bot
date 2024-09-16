import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CacheType,
  CommandInteraction,
  CommandInteractionOptionResolver,
  DiscordAPIError,
  DiscordjsErrorCodes,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";

import { inspectDisputeButtons } from "~/helpers/buttons";
import { chainpatrol, getDiscordGuildStatus, getReportsForOrg } from "~/utils/api";
import { logger } from "~/utils/logger";
import { defangUrl } from "~/utils/url";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option.setName("url").setDescription("The scam link to report").setRequired(true),
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;

  logger.info(`running report command (user.id=${interaction.user.id})`);

  const { guildId, user, options } = interaction;

  const urlInput = options.getString("url", true);

  // Check asset status
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
      // Check for existing reports
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

  // Show the modal to the user
  const modal = generateModal(user, options, guildId);
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
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      cancelButton,
      submitButton,
    );

    // Show ephemeral message with content from the modal and buttons
    const reply = await submissionInteraction.reply({
      content: `# Report for ${escapedUrl}

## Asset

- ${escapedUrl} | 🔴 Blocked 

## Description

${description}

## Contact

${contactInfo}

Does this information look correct?
Double-check that all the details you provided are accurate.`,
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    // Create a collector for button interactions
    const collector = reply.createMessageComponentCollector({
      filter: (i) =>
        i.user.id === user.id &&
        (i.customId === "cancel_report" || i.customId === "submit_report"),
      time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId === "cancel_report") {
        await buttonInteraction.update({
          content: `Report cancelled for ${escapedUrl}`,
          components: [],
        });
        collector.stop();
      } else if (buttonInteraction.customId === "submit_report") {
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

          await buttonInteraction.update({
            content: `✅ Thanks for submitting a report for \`${escapedUrl}\`! \n\nWe've sent this report to the **${response.organization?.name ?? "ChainPatrol"}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nThanks for doing your part in making this space safer 🚀`,
            components: [],
          });
        } catch (error) {
          logger.error(error, "Unable to submit report");
          await buttonInteraction.update({
            content: `⚠️ **Something went wrong trying to submit your report.** Please try again later.`,
            components: [],
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
) {
  const url = defaultValues?.url || options.getString("url", true);

  const modal = new ModalBuilder()
    .setCustomId("reportModal")
    .setTitle("Report Scam Link");

  const urlInput = new TextInputBuilder()
    .setCustomId("urlInput")
    .setLabel("Scam link to be reported")
    .setStyle(TextInputStyle.Short)
    .setValue(url)
    .setPlaceholder("example.com");

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
