import { ChainPatrolClient, AssetStatus, AssetType } from "@chainpatrol/sdk";
import { env } from "~/env";

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
  organizationName: string;
  organizationUrl: string;
  organizationSlug: string;
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
    }
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
      console.error(error);
      throw error;
    }
  }

  public static async fetchDiscordGuildStatus(
    discordGuild: DiscordGuildStatusType
  ) {
    const checkResponse =
      await ChainPatrolApiClient.postSecure<DiscordGuildStatusResponseType>(
        ChainPatrolApiRoutes.discordGuildStatusUrl(),
        discordGuild
      );

    return checkResponse;
  }
}
