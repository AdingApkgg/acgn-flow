"use client";

import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500",
        className
      )}
    >
      <div className="rounded-full bg-muted p-6 mb-6 animate-in zoom-in-75 duration-300 delay-100">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
        {title}
      </h3>
      {description && (
        <p className="text-muted-foreground max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300 delay-300">
          {description}
        </p>
      )}
      {action && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-[400ms]">
          <Button className="mt-6" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
