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
} from "discord.js";
import {
  ChainPatrolApiClient,
  AssetType,
  AssetStatus,
} from "../utils/ChainPatrolApiClient";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("reports a scam link to ChainPatrol")
  .addStringOption((option) =>
    option
      .setName("url")
      .setDescription("The scam link to report")
      .setRequired(true)
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    const { guildId, user, options } = interaction;
    const modal = generateModal(user, options);

    // Show the modal to the user
    await interaction.showModal(modal);

    // extract data from modal
    const submissionResult = await interaction.awaitModalSubmit({
      time: 60000,
    });

    const url = submissionResult.fields.getTextInputValue("urlInput");
    const escapedUrl = url.replace(".", "(dot)");

    const title = submissionResult.fields.getTextInputValue("titleInput");
    const description =
      submissionResult.fields.getTextInputValue("descriptionInput");
    const contact = submissionResult.fields.getTextInputValue("contactInput");

    const response = await ChainPatrolApiClient.createReport({
      discordGuildId: guildId ?? undefined,
      title: title,
      description: description,
      contactInfo: contact,
      assets: [
        {
          content: url,
          status: AssetStatus.BLOCKED,
          type: AssetType.URL,
        },
      ],
      attachmentUrls: [],
    });

    await submissionResult.reply({
      content: `✅ Thanks for submitting a report for \`${escapedUrl}\` ! \n\nWe've sent this report to the **${response.organization.name}** team and **ChainPatrol** to conduct a review. Once approved the report will be sent out to wallets to block.\n\nThanks for doing your part in making this space safer 🚀`,
      ephemeral: true,
    });
  } catch (error) {
    // Handle errors
    console.error("error", error);
    await interaction.reply({
      content: "Error with submitting report",
      ephemeral: true,
    });
  }
}

function generateModal(
  user: User,
  options: Omit<
    CommandInteractionOptionResolver<CacheType>,
    "getMessage" | "getFocused"
  >
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
    .setPlaceholder(url);
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
    .setPlaceholder(`Discord Report: ${url}`)
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
    .setPlaceholder(`Please explain why you think this is a scam`)
    .setValue(
      `reported by discord user ${usernameWithDiscriminator} , Discord ID: ${user.id}`
    );
  const descripionActionRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      descriptionInput
    );

  const contactInput = new TextInputBuilder()
    .setCustomId("contactInput")
    .setLabel("Let us know how to best contact you")
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(`Please provide your Discord username and ID`)
    .setValue(
      `discord user ${usernameWithDiscriminator} , Discord ID: ${user.id}`
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
