import {
  AnimatePresence,
  domAnimation,
  type HTMLMotionProps,
  LazyMotion,
  motion,
  type Variants,
} from "framer-motion";
import { type ReactNode, useEffect, useId, useSyncExternalStore } from "react";
import { useCountUp } from "react-countup";

const subscribeToHydration = () => () => {};

/**
 * 客户端挂载检测 Hook
 * 服务端和首次水合均为 false；挂载后通知消费者更新。
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
}

// ============================================================================
// 预定义动画变体
// ============================================================================

/** 渐入动画 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** 从下方滑入 */
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  exit: { opacity: 0, y: 10, transition: { duration: 0.2 } },
};

/** 从上方滑入 */
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

/** 缩放渐入 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

/** 弹性缩放 */
export const springScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

/** 交错容器 - 用于列表/网格动画 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/** 交错子项 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

/** 卡片悬停动画 */
export const cardHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.02, y: -4 },
  tap: { scale: 0.98 },
};

/** 按钮点击动画 */
export const buttonTap = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: "spring", stiffness: 400, damping: 17 },
};

// ============================================================================
// 工具组件
// ============================================================================

interface MotionProviderProps {
  children: ReactNode;
}

/**
 * 动画提供器 - 使用 LazyMotion 延迟加载动画功能
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

// ============================================================================
// 客户端安全的动画组件
// ============================================================================

interface ClientOnlyMotionProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
}

/**
 * 保持服务端和客户端的元素类型一致，避免挂载时替换交互子树。
 */
export function MotionDiv({ children, className, ...props }: ClientOnlyMotionProps) {
  const mounted = useIsMounted();

  return (
    <motion.div className={className} {...props} initial={mounted ? props.initial : false}>
      {children}
    </motion.div>
  );
}

// ============================================================================
// 高级动画组件
// ============================================================================

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
}

/**
 * 渐入动画组件
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.4,
  direction = "up",
  distance = 20,
}: FadeInProps) {
  const mounted = useIsMounted();

  const getInitialPosition = () => {
    switch (direction) {
      case "up":
        return { y: distance };
      case "down":
        return { y: -distance };
      case "left":
        return { x: distance };
      case "right":
        return { x: -distance };
      default:
        return {};
    }
  };

  return (
    <motion.div
      className={className}
      initial={mounted ? { opacity: 0, ...getInitialPosition() } : false}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

/**
 * 页面过渡包装器
 */
export function PageWrapper({ children, className }: PageWrapperProps) {
  const mounted = useIsMounted();

  return (
    <motion.div
      className={className}
      initial={mounted ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

/**
 * 交错列表动画容器
 */
export function StaggerList({ children, className, staggerDelay = 0.05 }: StaggerListProps) {
  const mounted = useIsMounted();

  return (
    <motion.div
      className={className}
      initial={mounted ? "hidden" : false}
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

/**
 * 交错列表子项
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

interface ScaleOnHoverProps {
  children: ReactNode;
  className?: string;
  scale?: number;
}

/**
 * 悬停缩放效果
 */
export function ScaleOnHover({ children, className, scale = 1.03 }: ScaleOnHoverProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {children}
    </motion.div>
  );
}

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (value: number) => string;
}

const formatCount = (value: number) => Math.round(value).toString();

/**
 * 数字递增动画 - 使用 react-countup
 */
export function CountUp({ value, duration = 1, className, formatter = formatCount }: CountUpProps) {
  const id = useId();
  const { update } = useCountUp({
    ref: id,
    end: value,
    duration,
    formattingFn: formatter,
  });

  useEffect(() => {
    update(value);
  }, [update, value]);

  return (
    <span id={id} className={className}>
      {formatter(value)}
    </span>
  );
}

// ============================================================================
// 导出
// ============================================================================

export { AnimatePresence, motion };
