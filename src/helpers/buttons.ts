import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export function inspectDisputeButtons(url: string) {
  const inspectButton = new ButtonBuilder()
    .setLabel("Inspect")
    .setStyle(ButtonStyle.Link)
    .setURL(`https://app.chainpatrol.io/search?url=${encodeURIComponent(url)}`);

  const disputeButton = new ButtonBuilder()
    .setLabel("Dispute")
    .setStyle(ButtonStyle.Link)
    .setURL(`https://app.chainpatrol.io/dispute?content=${encodeURIComponent(url)}`);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    inspectButton,
    disputeButton,
  );
}
