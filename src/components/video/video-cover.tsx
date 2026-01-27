"use client";

import Image from "next/image";
import { Film } from "lucide-react";

interface VideoCoverProps {
  coverUrl?: string | null;
  title: string;
  className?: string;
}

export function VideoCover({ coverUrl, title, className = "" }: VideoCoverProps) {
  if (!coverUrl) {
    return (
      <div 
        className={`bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center ${className}`}
      >
        <div className="text-center text-muted-foreground">
          <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <span className="text-xs opacity-70">暂无封面</span>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={coverUrl}
      alt={title}
      fill
      className={`object-cover ${className}`}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    />
  );
}
