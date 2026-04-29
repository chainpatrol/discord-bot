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
    project?: {
      mode?: "enabled" | "disabled" | "dry_run";
      version?: string | null;
    };
    note?: string;
  };
  error?: {
    code?: string;
    message?: string;
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

export type ModerationProjectMode = "enabled" | "disabled" | "dry_run";

type ModerationFailureReason =
  | "network_error"
  | "unauthorized"
  | "project_disabled"
  | "project_not_found"
  | "unexpected_error";

export type ModerationProbeResult =
  | {
      ok: true;
      mode: ModerationProjectMode;
      version: string | null;
    }
  | {
      ok: false;
      reason: ModerationFailureReason;
      status?: number;
      message?: string;
    };

const CLOUDFLARE_RESPONSE_HEADERS = [
  "cf-ray",
  "cf-cache-status",
  "cf-mitigated",
  "server",
] as const;

const collectCloudflareHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const name of CLOUDFLARE_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value) {
      result[name] = value;
    }
  }
  return result;
};

const tryParseJson = (raw: string): ModerationResponse | undefined => {
  try {
    return JSON.parse(raw) as ModerationResponse;
  } catch {
    return undefined;
  }
};

const classifyErrorEvent = (
  status: number,
  errorCode: string | undefined,
): {
  event: string;
  reason: ModerationFailureReason;
  message: string;
} => {
  if (status === 401) {
    return {
      event: "discord_moderation_unauthorized",
      reason: "unauthorized" as const,
      message:
        "Moderation API key is missing or invalid. Verify the moderation API key in the ChainPatrol dashboard.",
    };
  }
  if (status === 404 || errorCode === "NOT_FOUND") {
    return {
      event: "discord_moderation_project_not_found",
      reason: "project_not_found" as const,
      message:
        "Moderation project was not found. Verify the moderation project ID in the ChainPatrol dashboard.",
    };
  }
  if (status === 403 || errorCode === "FORBIDDEN") {
    return {
      event: "discord_moderation_project_disabled",
      reason: "project_disabled" as const,
      message:
        "Moderation project is disabled. Set the project mode to 'enabled' (or 'dry_run' for testing) in the moderation dashboard.",
    };
  }
  return {
    event: "discord_request_failed",
    reason: "unexpected_error" as const,
    message: `Moderation request failed with status ${status}.`,
  };
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

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(requestUrl, {
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
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error as Error & { code?: string; cause?: unknown };
    logger.error(
      {
        moderation: {
          event: "discord_request_network_error",
          requestUrl,
          projectId: input.projectId,
          hasApiKey: Boolean(input.apiKey),
          durationMs,
          errorName: err?.name,
          errorMessage: err?.message,
          errorCode: err?.code,
          errorCause:
            err?.cause instanceof Error
              ? { name: err.cause.name, message: err.cause.message }
              : err?.cause,
        },
      },
      "Discord moderation request failed before receiving response (likely network/DNS/TLS or blocked upstream)",
    );
    throw error;
  }

  const durationMs = Date.now() - startedAt;
  const cloudflareHeaders = collectCloudflareHeaders(response.headers);

  if (!response.ok) {
    const errorBody = await response.text();
    const parsed = tryParseJson(errorBody);
    const errorCode = parsed?.error?.code;
    const errorMessage = parsed?.error?.message;
    const classification = classifyErrorEvent(response.status, errorCode);
    const logLevel: "error" | "warn" =
      classification.reason === "project_disabled" ||
      classification.reason === "project_not_found" ||
      classification.reason === "unauthorized"
        ? "warn"
        : "error";
    logger[logLevel](
      {
        moderation: {
          event: classification.event,
          requestUrl,
          status: response.status,
          statusText: response.statusText,
          projectId: input.projectId,
          hasApiKey: Boolean(input.apiKey),
          durationMs,
          cloudflareHeaders,
          errorCode,
          errorMessage,
          remediation: classification.message,
          responseBody: errorBody,
        },
      },
      `Discord moderation request failed: ${classification.message}`,
    );
    throw new Error(
      `Moderation request failed: ${response.status} ${response.statusText} ${errorBody}`,
    );
  }

  const json = (await response.json()) as ModerationResponse;
  if (json.data?.project?.mode === "dry_run") {
    logger.warn(
      {
        moderation: {
          event: "discord_moderation_project_dry_run",
          requestUrl,
          projectId: input.projectId,
          mode: json.data.project.mode,
          version: json.data.project.version ?? null,
          remediation:
            "Moderation project is in 'dry_run' mode - results are not persisted. Set mode to 'enabled' in the dashboard once ready.",
        },
      },
      "Moderation project is in dry_run mode (not persisting results)",
    );
  }
  logger.info(
    {
      moderation: {
        event: "discord_request_success",
        requestUrl,
        projectId: input.projectId,
        durationMs,
        cloudflareHeaders,
        mode: json.data?.project?.mode,
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

export const probeModerationProject = async (input: {
  apiKey: string;
  projectId: number;
}): Promise<ModerationProbeResult> => {
  const requestUrl = `${env.MODERATION_API_URL}/api/v0/moderation/text?probe=true`;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chainpatrol-key": input.apiKey,
      },
      body: JSON.stringify({
        text: "",
        projectId: input.projectId,
      }),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error as Error & { code?: string; cause?: unknown };
    logger.error(
      {
        moderation: {
          event: "discord_moderation_probe_network_error",
          requestUrl,
          projectId: input.projectId,
          durationMs,
          errorName: err?.name,
          errorMessage: err?.message,
          errorCode: err?.code,
        },
      },
      "Moderation probe failed before receiving response",
    );
    return {
      ok: false,
      reason: "network_error",
      message: err?.message,
    };
  }

  const durationMs = Date.now() - startedAt;
  const cloudflareHeaders = collectCloudflareHeaders(response.headers);
  const rawBody = await response.text();
  const parsed = tryParseJson(rawBody);

  if (!response.ok) {
    const errorCode = parsed?.error?.code;
    const errorMessage = parsed?.error?.message;
    const classification = classifyErrorEvent(response.status, errorCode);
    logger.warn(
      {
        moderation: {
          event: classification.event,
          context: "probe",
          requestUrl,
          status: response.status,
          projectId: input.projectId,
          durationMs,
          cloudflareHeaders,
          errorCode,
          errorMessage,
          remediation: classification.message,
        },
      },
      `Moderation probe failed: ${classification.message}`,
    );
    return {
      ok: false,
      reason: classification.reason,
      status: response.status,
      message: errorMessage ?? classification.message,
    };
  }

  const mode = parsed?.data?.project?.mode ?? "enabled";
  logger.info(
    {
      moderation: {
        event: "discord_moderation_probe_ok",
        requestUrl,
        projectId: input.projectId,
        durationMs,
        cloudflareHeaders,
        mode,
        version: parsed?.data?.project?.version ?? null,
      },
    },
    "Moderation probe succeeded",
  );
  return {
    ok: true,
    mode,
    version: parsed?.data?.project?.version ?? null,
  };
};
