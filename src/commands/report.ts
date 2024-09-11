import {
  ActionRowBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  CommandInteraction,
  CommandInteractionOptionResolver,
  ComponentType,
  DiscordjsError,
  DiscordjsErrorCodes,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";

import { AssetStatus, chainpatrol } from "~/utils/api";
import { logger } from "~/utils/logger";

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

  await interaction.deferReply({ ephemeral: true });

  try {
    const assetStatus = await checkAssetStatus(urlInput);

    if (assetStatus === "BLOCKED") {
      await interaction.editReply({
        content: `⚠️ **This link is already Blocked by ChainPatrol.** No need to report it again.\n\nIf you think this is a mistake, please file a [dispute](https://app.chainpatrol.io/dispute).`,
      });
      return;
    }

    if (assetStatus === "ALLOWED") {
      await interaction.editReply({
        content: `⚠️ **This link is on ChainPatrol's Allowlist.** \n\nIf you think this is a mistake, please file a [dispute](https://app.chainpatrol.io/dispute).`,
      });
      return;
    }

    const modal = generateModal(user, options, guildId);
    await interaction.editReply({
      content: "Please provide additional information about the report.",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              customId: "open_report_modal",
              label: "Open Report Form",
              style: ButtonStyle.Primary,
            },
          ],
        },
      ],
    });

    const buttonInteraction = await interaction.channel!.awaitMessageComponent({
      filter: (i) => i.customId === "open_report_modal" && i.user.id === user.id,
      time: 5 * 60 * 1000,
    });

    await buttonInteraction.showModal(modal);

    const modalSubmission = await buttonInteraction.awaitModalSubmit({
      filter: (i) => i.customId === "reportModal" && i.user.id === user.id,
      time: 10 * 60 * 1000,
    });

    const reportData = extractReportData(modalSubmission, user);
    await showReportConfirmation(modalSubmission, reportData);
  } catch (error) {
    handleError(interaction, error);
  }
}

async function checkAssetStatus(url: string): Promise<AssetStatus> {
  try {
    const response = await chainpatrol.asset.check({ content: url });
    return response.status;
  } catch (error) {
    logger.error(error, "Unable to check asset status (url=%s)", url);
    throw error;
  }
}

function extractReportData(submission: ModalSubmitInteraction, user: User) {
  const url = submission.fields.getTextInputValue("urlInput");
  const title = submission.fields.getTextInputValue("titleInput");
  const description = submission.fields.getTextInputValue("descriptionInput");
  const contactInfo = submission.fields.getTextInputValue("contactInput");

  return {
    url,
    title,
    description,
    contactInfo,
    externalUser: {
      platform: "discord",
      platformIdentifier: user.id,
      avatarUrl: user.displayAvatarURL(),
      displayName: `${user.username}#${user.discriminator}`,
    },
  };
}

async function showReportConfirmation(
  interaction: ModalSubmitInteraction,
  reportData: any,
) {
  const escapedUrl = defangUrl(reportData.url);
  await interaction.reply({
    content: `Please review your report for \`${escapedUrl}\`:

**Title:** ${reportData.title}
**Description:** ${reportData.description}
**Contact Info:** ${reportData.contactInfo}

Click 'Edit' to modify the report or 'Submit' to send it to ChainPatrol.`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            customId: "edit_report",
            label: "Edit",
            style: ButtonStyle.Secondary,
          },
          {
            type: ComponentType.Button,
            customId: "submit_report",
            label: "Submit",
            style: ButtonStyle.Primary,
          },
        ],
      },
    ],
    ephemeral: true,
  });

  const buttonInteraction = await interaction.channel!.awaitMessageComponent({
    filter: (i) =>
      (i.customId === "edit_report" || i.customId === "submit_report") &&
      i.user.id === interaction.user.id,
    time: 10 * 60 * 1000,
  });

  if (buttonInteraction.customId === "edit_report") {
    await buttonInteraction.showModal(
      generateModal(interaction.user, interaction.options, interaction.guildId),
    );
    return showReportConfirmation(
      await buttonInteraction.awaitModalSubmit({
        filter: (i) => i.customId === "reportModal" && i.user.id === interaction.user.id,
        time: 10 * 60 * 1000,
      }),
      extractReportData(
        await buttonInteraction.awaitModalSubmit({
          filter: (i) =>
            i.customId === "reportModal" && i.user.id === interaction.user.id,
          time: 10 * 60 * 1000,
        }),
        interaction.user,
      ),
    );
  } else {
    await submitReport(buttonInteraction, reportData);
  }
}

async function submitReport(interaction: ButtonInteraction, reportData: any) {
  try {
    const response = await chainpatrol.report.create({
      discordGuildId: interaction.guildId ?? undefined,
      externalReporter: reportData.externalUser,
      title: reportData.title,
      description: reportData.description,
      contactInfo: reportData.contactInfo,
      assets: [{ content: reportData.url, status: "BLOCKED" }],
    });

    await interaction.update({
      content: `✅ Thanks for submitting a report for \`${defangUrl(reportData.url)}\`! \n\nWe've sent this report to the **${response.organization.name}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nThanks for doing your part in making this space safer 🚀`,
      components: [],
    });
  } catch (error) {
    logger.error(error, "Unable to submit report");
    await interaction.update({
      content: `⚠️ **Something went wrong trying to submit your report.** Please try again later.`,
      components: [],
    });
  }
}

function handleError(interaction: CommandInteraction, error: unknown) {
  logger.error(error);
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === DiscordjsErrorCodes.InteractionCollectorError
  ) {
    interaction.followUp({
      content: `⚠️ **You took too long to respond.** Please try again.`,
      ephemeral: true,
    });
  } else {
    interaction.followUp({
      content: `⚠️ **An unexpected error occurred.** Please try again later.`,
      ephemeral: true,
    });
  }
}

function defangUrl(url: string) {
  return url.replace(".", "(dot)");
}

function generateModal(
  user: User,
  options: Omit<CommandInteractionOptionResolver<CacheType>, "getMessage" | "getFocused">,
  guildId: string | null,
) {
  const usernameWithDiscriminator = `${user.username}#${user.discriminator}`;
  const url = options.getString("url", true);

  const modal = new ModalBuilder()
    .setCustomId("reportModal")
    .setTitle("Report Scam Link");

  const urlInput = new TextInputBuilder()
    .setCustomId("urlInput")
    // The label is the prompt the user sees for this input
    .setLabel("Scam link to be reported")
    // Short means only a single line of text
    .setStyle(TextInputStyle.Short)
    .setValue(url)
    .setPlaceholder("example.com");
  // An action row only holds one text input,
  // so you need one action row per text input.
  const urlActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(urlInput);

  const titleInput = new TextInputBuilder()
    .setCustomId("titleInput")
    .setLabel("Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("ex. Phishing Scam on example.com")
    .setValue(`Discord Report: ${url}`);
  const titleActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(titleInput);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("descriptionInput")
    .setLabel("Description")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please explain why you think this is a scam`);
  const descripionActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      descriptionInput,
    );

  const contactInput = new TextInputBuilder()
    .setCustomId("contactInput")
    .setLabel("Let us know how to best contact you")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please provide any additional contact information you may have`);
  const contactActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(contactInput);

  // Add inputs to the modal (maximum 5)
  modal.addComponents(
    urlActionRow,
    titleActionRow,
    descripionActionRow,
    contactActionRow,
  );

  return modal;
}
