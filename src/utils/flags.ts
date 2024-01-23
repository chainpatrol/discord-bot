export const enum Flags {
  REACT_TO_SUSPICIOUS_MESSAGES = "REACT_TO_SUSPICIOUS_MESSAGES",
}

const orgFlags: Record<string, Record<Flags, boolean>> = {
  chainpatrol: {
    [Flags.REACT_TO_SUSPICIOUS_MESSAGES]: true,
  },
  mountaintop: {
    [Flags.REACT_TO_SUSPICIOUS_MESSAGES]: true,
  },
};

export function isFlagEnabled(slug: string, flag: Flags): boolean {
  if (!(slug in orgFlags)) {
    return false;
  }

  const config = orgFlags[slug];

  if (!config || !(flag in config)) {
    return false;
  }

  const flagValue = config[flag];

  return flagValue;
}
