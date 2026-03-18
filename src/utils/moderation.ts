import { env } from "~/env";
import { logger } from "~/utils/logger";

type ModerationLabel = {
  score: number;
  flagged: boolean;
};

type ModerationLabels = Record<string, ModerationLabel>;

type ModerationResponse = {
  status: string;
  data?: {
    flagged?: boolean;
    labels?: ModerationLabels;
    entities?: Record<string, unknown>;
  };
};

type ModerateTextInput = {
  text: string;
  apiKey: string;
  projectId: number;
  authorId?: string;
  entityId?: string;
  contextIds?: string[];
};

export type ModerateTextOutput = {
  flagged: boolean;
  labels: ModerationLabels;
  entities: Record<string, unknown>;
};

export const moderateText = async (
  input: ModerateTextInput,
): Promise<ModerateTextOutput> => {
  const requestUrl = `${env.MODERATION_API_URL}/api/v0/moderation/text`;
  logger.info(
    {
      moderation: {
        event: "discord_request_start",
        requestUrl,
        projectId: input.projectId,
        hasApiKey: Boolean(input.apiKey),
        textLength: input.text.length,
        authorId: input.authorId,
        entityId: input.entityId,
        contextIds: input.contextIds,
      },
    },
    "Sending Discord moderation request",
  );

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chainpatrol-key": input.apiKey,
    },
    body: JSON.stringify({
      text: input.text,
      projectId: input.projectId,
      authorId: input.authorId,
      entityId: input.entityId,
      contextIds: input.contextIds,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      {
        moderation: {
          event: "discord_request_failed",
          requestUrl,
          status: response.status,
          statusText: response.statusText,
          projectId: input.projectId,
          hasApiKey: Boolean(input.apiKey),
          responseBody: errorBody,
        },
      },
      "Discord moderation request failed",
    );
    throw new Error(
      `Moderation request failed: ${response.status} ${response.statusText} ${errorBody}`,
    );
  }

  const json = (await response.json()) as ModerationResponse;
  logger.info(
    {
      moderation: {
        event: "discord_request_success",
        requestUrl,
        projectId: input.projectId,
        flagged: json.data?.flagged ?? false,
        labelCount: Object.keys(json.data?.labels ?? {}).length,
      },
    },
    "Discord moderation request succeeded",
  );

  return {
    flagged: json.data?.flagged ?? false,
    labels: json.data?.labels ?? {},
    entities: json.data?.entities ?? {},
  };
};
