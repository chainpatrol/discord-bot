import { PostHog } from "posthog-node";

import { env } from "~/env";

const posthog = new PostHog(env.POSTHOG_API_KEY, {
  host: "https://app.posthog.com",
});

export { posthog };
