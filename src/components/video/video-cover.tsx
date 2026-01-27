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
        className={`absolute inset-0 bg-gradient-to-br from-primary/5 via-muted to-primary/10 flex items-center justify-center ${className}`}
      >
        <div className="text-center text-muted-foreground/60">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
            <Film className="h-10 w-10 mx-auto relative" />
          </div>
          <span className="text-xs mt-2 block font-medium">暂无封面</span>
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
      unoptimized
    />
  );
}
