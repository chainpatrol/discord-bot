export function defangUrl(url: string) {
  return url.replace(".", "(dot)");
}
