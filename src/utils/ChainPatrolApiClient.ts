import axios from "axios";
import { env } from "../env";

export type DiscordGuildStatusType = {
  guildId: string;
};

export type DiscordGuildStatusResponseType = {
  connected: boolean;
  guildId?: string;
  channelId?: string;
  organizationName: string;
  organizationUrl: string;
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
};

export type ReportCreateOrganizationResponseType = {
  name: string;
};

export type ReportCreateResponseType = {
  createdAt: string;
  id: number;
  organization: ReportCreateOrganizationResponseType;
};

export type ResourceCheckType = {
  content: string;
  detailed?: boolean;
  type: AssetType;
};

export type ResourceCheckReportReponseType = {
  createdAt: string;
  id: number;
};

export enum AssetStatus {
  BLOCKED = "BLOCKED",
  ALLOWED = "ALLOWED",
  UNKNOWN = "UNKNOWN",
}

export type ResourceCheckResponseType = {
  reason: string;
  reports: ResourceCheckReportReponseType[];
  status: AssetStatus;
};

export type AssetListType = {
  endDate?: string;
  startDate?: string;
  status?: AssetStatus;
  type: AssetType;
};

export type AssetListAssetReponseType = {
  content: string;
  status: AssetStatus;
  type: AssetType;
};

export type AssetListReponseType = {
  assets: AssetListAssetReponseType[];
};

enum ChainPatrolApiUri {
  ReportCreate = "api/v2/report/create",
  AssetCheck = "api/v2/asset/check",
  AssetList = "api/v2/asset/list",
  DiscordGuildStatus = "api/v2/internal/getDiscordGuildStatus",
}

class ChainPatrolApiRoutes {
  private static getURL(path: ChainPatrolApiUri) {
    return `${env.CHAINPATROL_API_URL}/${path}`;
  }

  public static reportCreateUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.ReportCreate);
  }

  public static assetCheckUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.AssetCheck);
  }

  public static assetListUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.AssetList);
  }

  public static discordGuildStatusUrl() {
    return ChainPatrolApiRoutes.getURL(ChainPatrolApiUri.DiscordGuildStatus);
  }
}

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

  public static async checkAsset(asset: ResourceCheckType) {
    const checkResponse =
      await ChainPatrolApiClient.post<ResourceCheckResponseType>(
        ChainPatrolApiRoutes.assetCheckUrl(),
        asset
      );

    return checkResponse;
  }

  public static async listAssets(config: AssetListType) {
    const listResponse = await ChainPatrolApiClient.post<AssetListReponseType>(
      ChainPatrolApiRoutes.assetListUrl(),
      config
    );

    return listResponse;
  }
}
