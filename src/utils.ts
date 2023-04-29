import * as Sentry from "@sentry/node";

export function errorHandler(error: Error, message = "Error") {
  console.error(message, error);
  Sentry.captureException(error);
}
