/** 切源或 seek 打断 play() 时，保留用户的播放意图。 */
export function playbackErrorStopsIntent(error: unknown): boolean {
  return !(
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
