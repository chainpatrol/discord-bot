import { ChainPatrolClient } from "@chainpatrol/sdk";
import axios from "axios";
import { env } from "~/env";

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

export enum AssetType {
  URL = "URL",
  PAGE = "PAGE",
  ADDRESS = "ADDRESS",
  DISCORD = "DISCORD",
  TWITTER = "TWITTER",
}

export type ReportCreateAssetType = {
  content: string;
  status: AssetStatus;
  type?: AssetType;
};

export type ReportCreateType = {
  assets: ReportCreateAssetType[];
  attachmentUrls: string[];
  contactInfo?: string;
  description: string;
  discordGuildId?: string;
  organizationSlug?: string;
  title: string;
  discordAvatarUrl: string;
  discordPublicUsername: string;
  discordFormattedUsername: string;
  externalReporter: {
    platform: string;
    platformIdentifier: string;
    avatarUrl?: string;
  };
};

export type ReportCreateOrganizationResponseType = {
  id: number;
  slug: string;
  name: string;
};

export type ReportCreateResponseType = {
  createdAt: string;
  id: number;
  organization: ReportCreateOrganizationResponseType;
};

export enum AssetStatus {
  BLOCKED = "BLOCKED",
  ALLOWED = "ALLOWED",
  UNKNOWN = "UNKNOWN",
}

enum ChainPatrolApiUri {
  ReportCreate = "api/v2/report/create",
  DiscordGuildStatus = "api/v2/internal/getDiscordGuildStatus",
}

class ChainPatrolApiRoutes {
  private static getURL(path: ChainPatrolApiUri) {
    return `${env.CHAINPATROL_API_URL}/${path}`;
  }

  public static reportCreateUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.ReportCreate);
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
      const response = await axios.post(path, body, { headers: headers });

      try {
        return response.data as T;
      } catch (error) {
        return null;
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  private static async postResponse(
    path: string,
    body?: Record<string, unknown>
  ) {
    const response = await axios.post(path, body);

    return response;
  }

  private static async post<T = any>(
    path: string,
    body?: Record<string, unknown>
  ) {
    try {
      const response = await ChainPatrolApiClient.postResponse(path, body);
      return response.data as T;
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

  public static async createReport(report: ReportCreateType) {
    const reportResponse =
      await ChainPatrolApiClient.post<ReportCreateResponseType>(
        ChainPatrolApiRoutes.reportCreateUrl(),
        report
      );

    return reportResponse;
  }
}
