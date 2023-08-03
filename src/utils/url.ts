export function defangUrl(url: string) {
  return url.replace(".", "(dot)");
}

export const URL_REGEX = /https?:\/\/(?:www\.)?([^\s]+\.[^\s]+)/gi;

export function extractUrls(str: string) {
  return str.match(URL_REGEX);
}
