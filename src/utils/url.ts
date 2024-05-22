export function defangUrl(url: string) {
  let defangedUrl = url;
  while (defangedUrl.includes(".")) {
    defangedUrl = url.replace(".", "(dot)");
  }
  return defangedUrl;
}

export const URL_REGEX = /https?:\/\/(?:www\.)?([^\s]+\.[^\s]+)/gi;

export function extractUrls(str: string) {
  return str.match(URL_REGEX);
}
