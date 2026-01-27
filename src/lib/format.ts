import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatViews(views: number): string {
  if (views >= 100000000) {
    return `${(views / 100000000).toFixed(1)}亿`;
  }
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1)}万`;
  }
  return views.toString();
}

export function formatRelativeTime(date: Date | string): string {
  return dayjs(date).fromNow();
}

export function formatDate(date: Date | string, format: string = "YYYY-MM-DD"): string {
  return dayjs(date).format(format);
}
