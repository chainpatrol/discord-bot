import {
  ActionRowBuilder,
  CommandInteraction,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalActionRowComponentBuilder,
  User,
  CacheType,
  CommandInteractionOptionResolver,
  DiscordjsErrorCodes,
  DiscordjsError,
} from "discord.js";
import { chainpatrol } from "~/utils/api";
import { CommandContext } from "../types";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("The scam link to report")
      .setRequired(true)
  );

/**
 * This function is called when the `/report` command is executed.
 *
 * IMPORTANT: This function opens a modal to collect additional information from the user.
 * It is critical that you call `interaction.showModal` as early as possible in this function
 * to ensure that the modal is shown to the user before the 3 second timeout.
 */
export async function execute({ interaction, logger }: CommandContext) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  logger.info({ user: interaction.user }, "Running report command");

  const { guildId, user, options } = interaction;

  const urlInput = options.getString("url", true);

  // Show the modal to the user
  const modal = generateModal(user, options, guildId);
  await interaction.showModal(modal);

  // extract data from modal
  let submissionInteraction: Awaited<
    ReturnType<typeof interaction.awaitModalSubmit>
  >;

  try {
    submissionInteraction = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === "reportModal" && i.user.id === user.id,
      time: 60_000,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      logger.info({ url: urlInput, error }, "Modal timed out");
      await interaction.followUp({
        content: `⚠️ **You took too long to submit the report.** Please try again.`,
        ephemeral: true,
      });
      return;
    }
    throw error;
  }

  const url = submissionInteraction.fields.getTextInputValue("urlInput");
  const escapedUrl = url.replace(".", "(dot)");

  const title = submissionInteraction.fields.getTextInputValue("titleInput");
  const description =
    submissionInteraction.fields.getTextInputValue("descriptionInput");
  const contactInfo =
    submissionInteraction.fields.getTextInputValue("contactInput");

  // Getting the Discord user information
  const discordAvatarUrl = user.displayAvatarURL();
  const discordPublicUsername = user.username;
  const discordFormattedUsername = `${user.username}#${user.discriminator}`; // username in "user#1234" format
  const externalUser = {
    platform: "discord",
    platformIdentifier: user.id,
    avatarUrl: discordAvatarUrl,
    displayName: discordFormattedUsername,
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

    await submissionInteraction.reply({
      content: `✅ Thanks for submitting a report for \`${escapedUrl}\` ! \n\nWe've sent this report to the **${response.organization.name}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nThanks for doing your part in making this space safer 🚀`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error(error, "Unable to submit report");

    if (error instanceof DiscordjsError) {
      throw error;
    }

    logger.info(
      "checking if the reason submission failed is because the asset is already blocked or on the allowlist"
    );

    try {
      const assetCheckResponse = await chainpatrol.asset.check({
        content: urlInput,
      });

      if (assetCheckResponse.status === "BLOCKED") {
        logger.info({ url: urlInput }, "URL is already blocked");
        await submissionInteraction.reply({
          content: `⚠️ **This link is already Blocked by ChainPatrol.** No need to report it again.`,
          ephemeral: true,
        });
        return;
      }

      if (assetCheckResponse.status === "ALLOWED") {
        logger.info({ url: urlInput }, "URL is on allowlist");
        await submissionInteraction.reply({
          content: `⚠️ **This link is on ChainPatrol's Allowlist.** \n\nIf you think this is a mistake, please file a [dispute](https://app.chainpatrol.io/dispute).`,
          ephemeral: true,
        });
        return;
      }
    } catch (error) {
      logger.error(error, "Unable to check asset status (url=%s)", urlInput);

      if (error instanceof DiscordjsError) {
        throw error;
      }

      await submissionInteraction.reply({
        content: `⚠️ **Something went wrong trying to submit your report.** Please try again later.`,
        ephemeral: true,
      });
    }
  }
}

function generateModal(
  user: User,
  options: Omit<
    CommandInteractionOptionResolver<CacheType>,
    "getMessage" | "getFocused"
  >,
  guildId: string | null
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
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      urlInput
    );

  const titleInput = new TextInputBuilder()
    .setCustomId("titleInput")
    .setLabel("Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("ex. Phishing Scam on example.com")
    .setValue(`Discord Report: ${url}`);
  const titleActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      titleInput
    );

  const descriptionInput = new TextInputBuilder()
    .setCustomId("descriptionInput")
    .setLabel("Description")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please explain why you think this is a scam`);
  const descripionActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      descriptionInput
    );

  const contactInput = new TextInputBuilder()
    .setCustomId("contactInput")
    .setLabel("Let us know how to best contact you")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      `Please provide any additional contact information you may have`
    );
  const contactActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      contactInput
    );

  // Add inputs to the modal (maximum 5)
  modal.addComponents(
    urlActionRow,
    titleActionRow,
    descripionActionRow,
    contactActionRow
  );

  return modal;
}
