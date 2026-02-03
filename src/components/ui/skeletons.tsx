"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ==================== VideoCardSkeleton ====================

interface VideoCardSkeletonProps {
  className?: string;
}

export function VideoCardSkeleton({ className }: VideoCardSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* 封面骨架 */}
      <Skeleton className="aspect-video rounded-xl" />
      
      {/* 信息区域骨架 */}
      <div className="flex gap-3">
        {/* 头像 */}
        <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
        
        {/* 标题和作者 */}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

// ==================== VideoGridSkeleton ====================

interface VideoGridSkeletonProps {
  count?: number;
  className?: string;
}

export function VideoGridSkeleton({ count = 12, className }: VideoGridSkeletonProps) {
  return (
    <div
      className={cn(
        "grid gap-4 sm:gap-5 md:gap-6",
        "grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ==================== CommentSkeleton ====================

interface CommentSkeletonProps {
  className?: string;
}

export function CommentSkeleton({ className }: CommentSkeletonProps) {
  return (
    <div className={cn("flex gap-3", className)}>
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

// ==================== CommentListSkeleton ====================

interface CommentListSkeletonProps {
  count?: number;
  className?: string;
}

export function CommentListSkeleton({ count = 5, className }: CommentListSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <CommentSkeleton key={i} />
      ))}
    </div>
  );
}

// ==================== UserCardSkeleton ====================

interface UserCardSkeletonProps {
  className?: string;
}

export function UserCardSkeleton({ className }: UserCardSkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 p-4 rounded-lg border", className)}>
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

// ==================== TableRowSkeleton ====================

interface TableRowSkeletonProps {
  columns?: number;
  className?: string;
}

export function TableRowSkeleton({ columns = 5, className }: TableRowSkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-8" : i === columns - 1 ? "w-16" : "flex-1"
          )}
        />
      ))}
    </div>
  );
}

// ==================== TableSkeleton ====================

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({ rows = 10, columns = 5, className }: TableSkeletonProps) {
  return (
    <div className={cn("space-y-1 border rounded-lg", className)}>
      {/* 表头 */}
      <div className="flex items-center gap-4 p-4 border-b bg-muted/50">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* 表体 */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  );
}

// ==================== ProfileSkeleton ====================

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* 头部信息 */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="space-y-2 text-center sm:text-left">
          <Skeleton className="h-6 w-32 mx-auto sm:mx-0" />
          <Skeleton className="h-4 w-48 mx-auto sm:mx-0" />
          <Skeleton className="h-4 w-24 mx-auto sm:mx-0" />
        </div>
      </div>
      {/* 统计信息 */}
      <div className="flex justify-center gap-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center space-y-1">
            <Skeleton className="h-6 w-12 mx-auto" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== FormSkeleton ====================

interface FormSkeletonProps {
  fields?: number;
  className?: string;
}

export function FormSkeleton({ fields = 4, className }: FormSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-full mt-6" />
    </div>
  );
}

// ==================== PageSkeleton ====================

export function PageSkeleton() {
  return (
    <div className="container py-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <VideoGridSkeleton count={12} />
    </div>
  );
}
