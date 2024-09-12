import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CacheType,
  CommandInteraction,
  CommandInteractionOptionResolver,
  DiscordjsError,
  DiscordjsErrorCodes,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";

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
      });
      return;
    }

    if (assetCheckResponse.status === "ALLOWED") {
      await interaction.reply({
        content: `⚠️ **This link, \`${defangUrl(urlInput)}\`, is on ChainPatrol's Allowlist.** \n\nIf you think this is a mistake, please file a [dispute](https://app.chainpatrol.io/dispute).`,
        ephemeral: true,
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

      // If no existing reports, continue with the original flow
    }
  } catch (error) {
    logger.error(error, "Unable to check asset status (url=%s)", urlInput);
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

    // Create buttons
    const editButton = new ButtonBuilder()
      .setCustomId("edit_report")
      .setLabel("Edit")
      .setStyle(ButtonStyle.Secondary);

    const submitButton = new ButtonBuilder()
      .setCustomId("submit_report")
      .setLabel("Submit")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      editButton,
      submitButton,
    );

    // Show ephemeral message with content from the modal and buttons
    const reply = await submissionInteraction.reply({
      content: `Please review your report for \`${escapedUrl}\`:
      
Title: \`${title}\`
Description: \`${description}\`
Contact Info: \`${contactInfo}\`

Click "Edit" to make changes or "Submit" to send the report.`,
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    // Create a collector for button interactions
    const collector = reply.createMessageComponentCollector({
      filter: (i) =>
        i.user.id === user.id &&
        (i.customId === "edit_report" || i.customId === "submit_report"),
      time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId === "edit_report") {
        // Re-open the modal
        await buttonInteraction.showModal(
          generateModal(user, options, guildId, { url, title, description, contactInfo }),
        );
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
  prefill?: { url: string; title: string; description: string; contactInfo: string },
) {
  const url = prefill?.url || options.getString("url", true);

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
    .setValue(prefill?.title || `Discord Report: ${url}`);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("descriptionInput")
    .setLabel("Description")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please explain why you think this is a scam`)
    .setValue(prefill?.description || "");

  const contactInput = new TextInputBuilder()
    .setCustomId("contactInput")
    .setLabel("Let us know how to best contact you")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please provide any additional contact information you may have`)
    .setValue(prefill?.contactInfo || "");

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
