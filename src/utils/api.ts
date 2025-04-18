import { AssetStatus, AssetType, ChainPatrolClient } from "@chainpatrol/sdk";

import { env } from "~/env";

import { logger } from "./logger";

export type { AssetStatus, AssetType };

export const chainpatrol = new ChainPatrolClient({
  apiKey: env.CHAINPATROL_API_KEY,
  baseUrl: `${env.CHAINPATROL_API_URL}/api/`,
});

export type DiscordGuildStatusType = {
  guildId: string;
};

export type DiscordGuildStatusResponseType = {
  connected: boolean;
  guildId?: string;
  channelId?: string;
  organizationName?: string;
  organizationUrl?: string;
  organizationSlug?: string;
  isFeedEnabled?: boolean;
  isMonitoringLinks?: boolean;
};

enum ChainPatrolApiUri {
  DiscordGuildStatus = "api/v2/internal/getDiscordGuildStatus",
}

class ChainPatrolApiRoutes {
  private static getURL(path: ChainPatrolApiUri) {
    return `${env.CHAINPATROL_API_URL}/${path}`;
  }

  public static discordGuildStatusUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.DiscordGuildStatus);
  }
}

/**
 * @deprecated Use @chainpatrol/sdk instead
 */
export class ChainPatrolApiClient {
  private static async postSecure<T = any>(
    path: string,
    body?: Record<string, unknown>,
    headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-KEY": env.CHAINPATROL_API_KEY,
    },
  ) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

      try {
        return (await response.json()) as T;
      } catch (error) {
        return null;
      }
    } catch (error) {
      logger.error(error);
      throw error;
    }
  }

  public static async fetchDiscordGuildStatus(discordGuild: DiscordGuildStatusType) {
    const checkResponse =
      await ChainPatrolApiClient.postSecure<DiscordGuildStatusResponseType>(
        ChainPatrolApiRoutes.discordGuildStatusUrl(),
        discordGuild,
      );

    return checkResponse;
  }
}

export async function getReportsForOrg(input: {
  organizationSlug: string;
  assetContents: string[];
}): Promise<{ reports: Report[] }> {
  if (!input.organizationSlug) {
    input.organizationSlug = "chainpatrol";
  }

  const response = await chainpatrol.fetch<{ reports: Report[] }>({
    method: "POST",
    path: ["v2", "internal", "reports", "search"],
    body: input,
  });
  return response;
}

export async function getDiscordGuildStatus(
  guildId: string,
): Promise<DiscordGuildStatusResponseType | null> {
  try {
    const response = await chainpatrol.fetch<DiscordGuildStatusResponseType>({
      method: "POST",
      path: ["v2", "internal", "getDiscordGuildStatus"],
      body: { guildId },
    });
    return response;
  } catch (error) {
    logger.error(error, "Unable to fetch Discord guild status");
    return null;
  }
}
