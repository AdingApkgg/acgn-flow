"use client";

import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FadeIn, motion } from "@/components/motion";

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
    <FadeIn
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
      direction="up"
      distance={30}
    >
      <motion.div 
        className="rounded-full bg-muted p-6 mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
      >
        <Icon className="h-12 w-12 text-muted-foreground" />
      </motion.div>
      <motion.h3 
        className="text-lg font-semibold mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {title}
      </motion.h3>
      {description && (
        <motion.p 
          className="text-muted-foreground max-w-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button className="mt-6" onClick={action.onClick}>
            {action.label}
          </Button>
        </motion.div>
      )}
    </FadeIn>
  );
}
