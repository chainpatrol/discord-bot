import pino from "pino";
import { env } from "~/env";

export const logger = pino(
  { level: env.LOG_LEVEL ?? "info" },
  pino.transport({ targets: getTransportTargets() })
);

function getTransportTargets(): pino.TransportTargetOptions<
  Record<string, unknown>
>[] {
  if (env.NODE_ENV === "production") {
    return [
      {
        level: "debug",
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
      {
        level: "info",
        target: "@axiomhq/pino",
        options: {
          dataset: env.AXIOM_DATASET,
          token: env.AXIOM_TOKEN,
        },
      },
    ];
  }

  return [
    {
      level: "debug",
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  ];
}
