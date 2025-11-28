export function defangUrl(url: string) {
  return url.replaceAll(".", "(dot)");
}

export const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{2,}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

export function extractUrls(str: string) {
  const matches = str.match(URL_REGEX);
  if (!matches) return null;
  
  return matches.map(url => {
    if (!url.match(/^https?:\/\//i)) {
      return `https://${url}`;
    }
    return url;
  });
}
