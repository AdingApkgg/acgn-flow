import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };

// 骨架条目的身份对应固定布局槽位，不随真实内容排序变化。
export function skeletonKeys(count: number) {
  return Array.from({ length: count }, (_, slot) => `skeleton-slot-${slot}`);
}
