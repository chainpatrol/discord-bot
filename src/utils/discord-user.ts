const MENTION_REGEX = /<@!?(\d{17,20})>/g;

const PROFILE_LINK_REGEX = /https?:\/\/(?:www\.)?discord\.com\/users\/(\d{17,20})/gi;

const RAW_SNOWFLAKE_REGEX = /(?<![\/\w])(\d{17,20})(?!\w)/g;

export function extractDiscordUserIds(content: string): string[] {
  const ids = new Set<string>();

  for (const match of content.matchAll(MENTION_REGEX)) {
    ids.add(match[1]);
  }

  for (const match of content.matchAll(PROFILE_LINK_REGEX)) {
    ids.add(match[1]);
  }

  const strippedContent = content
    .replace(MENTION_REGEX, "")
    .replace(PROFILE_LINK_REGEX, "");

  for (const match of strippedContent.matchAll(RAW_SNOWFLAKE_REGEX)) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}

export function formatDiscordUserAssetUrl(userId: string): string {
  return `https://discord.com/users/${userId}`;
}
