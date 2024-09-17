import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const inspectDisputeButtons = (url: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Inspect")
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://app.chainpatrol.io/search?content=${encodeURIComponent(url ?? "")}`,
      ),
    new ButtonBuilder()
      .setLabel("Dispute")
      .setStyle(ButtonStyle.Link)
      .setURL("https://app.chainpatrol.io/dispute"),
  );
