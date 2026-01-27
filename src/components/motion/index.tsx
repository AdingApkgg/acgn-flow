"use client";

import { motion, type Variants, AnimatePresence, useInView } from "framer-motion";
import { forwardRef, type ComponentPropsWithoutRef, useRef } from "react";

// ==================== 基础变体 ====================

// 淡入动画
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

// 从下方淡入
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// 从上方淡入
export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// 从左侧滑入
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// 从右侧滑入
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// 缩放淡入
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// 弹性缩放
export const springScale: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    transition: { type: "spring", stiffness: 300, damping: 20 } 
  },
};

// 旋转淡入
export const rotateIn: Variants = {
  hidden: { opacity: 0, rotate: -10, scale: 0.95 },
  visible: { opacity: 1, rotate: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

// 模糊淡入
export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(10px)" },
  visible: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.5 } },
};

// ==================== 容器变体 ====================

// 交错动画容器
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

// 快速交错容器
export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

// 网格交错容器
export const gridStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
};

// 交错子元素
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

// 卡片交错子元素
export const cardStaggerItem: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } 
  },
};

// ==================== 页面过渡 ====================

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } 
  },
  exit: { 
    opacity: 0, 
    y: -10, 
    transition: { duration: 0.2 } 
  },
};

// 平滑页面过渡
export const smoothPageTransition: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { duration: 0.6, ease: "easeInOut" } 
  },
  exit: { 
    opacity: 0, 
    transition: { duration: 0.3 } 
  },
};

// ==================== 交互动画 ====================

// 悬停效果
export const hoverLift = {
  y: -4,
  boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.2)",
  transition: { duration: 0.2, ease: "easeOut" },
};

// 点击效果
export const tapScale = {
  scale: 0.97,
  transition: { duration: 0.1 },
};

// 按钮悬停
export const buttonHover = {
  scale: 1.02,
  transition: { duration: 0.2, ease: "easeOut" },
};

// 按钮点击
export const buttonTap = {
  scale: 0.98,
};

// 图标旋转
export const iconSpin = {
  rotate: 360,
  transition: { duration: 0.5, ease: "easeInOut" },
};

// ==================== 特殊动画 ====================

// 脉冲动画
export const pulse: Variants = {
  hidden: { scale: 1 },
  visible: {
    scale: [1, 1.05, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
};

// 浮动动画
export const float: Variants = {
  hidden: { y: 0 },
  visible: {
    y: [-5, 5, -5],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
};

// 闪烁动画
export const shimmer: Variants = {
  hidden: { opacity: 0.5 },
  visible: {
    opacity: [0.5, 1, 0.5],
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
  },
};

// ==================== 导出 Motion 组件 ====================

export const MotionDiv = motion.div;
export const MotionSection = motion.section;
export const MotionUl = motion.ul;
export const MotionLi = motion.li;
export const MotionSpan = motion.span;
export const MotionP = motion.p;
export const MotionH1 = motion.h1;
export const MotionH2 = motion.h2;
export const MotionArticle = motion.article;
export const MotionNav = motion.nav;
export const MotionAside = motion.aside;
export const MotionHeader = motion.header;
export const MotionFooter = motion.footer;
export { AnimatePresence };

// ==================== 封装组件 ====================

// 淡入容器组件
interface FadeInProps extends ComponentPropsWithoutRef<typeof motion.div> {
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  duration?: number;
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  ({ children, delay = 0, direction = "up", duration = 0.4, ...props }, ref) => {
    const directions = {
      up: { y: 20, x: 0 },
      down: { y: -20, x: 0 },
      left: { x: 30, y: 0 },
      right: { x: -30, y: 0 },
      none: { x: 0, y: 0 },
    };
    
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, ...directions[direction] }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
FadeIn.displayName = "FadeIn";

// 滚动时淡入组件
interface ScrollFadeInProps extends ComponentPropsWithoutRef<typeof motion.div> {
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  threshold?: number;
}

export const ScrollFadeIn = forwardRef<HTMLDivElement, ScrollFadeInProps>(
  ({ children, delay = 0, direction = "up", threshold = 0.2, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { once: true, amount: threshold });
    
    const directions = {
      up: { y: 30, x: 0 },
      down: { y: -30, x: 0 },
      left: { x: 40, y: 0 },
      right: { x: -40, y: 0 },
      none: { x: 0, y: 0 },
    };
    
    return (
      <motion.div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        initial={{ opacity: 0, ...directions[direction] }}
        animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
        transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
ScrollFadeIn.displayName = "ScrollFadeIn";

// 悬停缩放组件
interface HoverScaleProps extends ComponentPropsWithoutRef<typeof motion.div> {
  scale?: number;
  lift?: boolean;
}

export const HoverScale = forwardRef<HTMLDivElement, HoverScaleProps>(
  ({ children, scale = 1.02, lift = false, ...props }, ref) => (
    <motion.div
      ref={ref}
      whileHover={{ 
        scale, 
        y: lift ? -4 : 0,
        boxShadow: lift ? "0 10px 30px -10px rgba(0, 0, 0, 0.2)" : undefined,
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
HoverScale.displayName = "HoverScale";

// 悬停发光组件
export const HoverGlow = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof motion.div> & { glowColor?: string }
>(({ children, glowColor = "rgba(168, 85, 247, 0.4)", ...props }, ref) => (
  <motion.div
    ref={ref}
    whileHover={{ 
      boxShadow: `0 0 30px ${glowColor}`,
      transition: { duration: 0.3 },
    }}
    {...props}
  >
    {children}
  </motion.div>
));
HoverGlow.displayName = "HoverGlow";

// 点击涟漪效果组件
export const ClickRipple = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof motion.div>
>(({ children, ...props }, ref) => (
  <motion.div
    ref={ref}
    whileTap={{ 
      scale: [1, 0.97, 1],
      transition: { duration: 0.3 },
    }}
    {...props}
  >
    {children}
  </motion.div>
));
ClickRipple.displayName = "ClickRipple";

// 页面包装组件
interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 平滑页面包装
export function SmoothPageWrapper({ children, className }: PageWrapperProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={smoothPageTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 交错列表组件
interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  fast?: boolean;
}

export function StaggerList({ children, className, fast = false }: StaggerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fast ? staggerContainerFast : staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// 网格交错组件
export function GridStagger({ children, className }: StaggerProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={gridStaggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function GridItem({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <motion.div variants={cardStaggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// 滚动触发的交错列表
interface ScrollStaggerProps extends StaggerProps {
  threshold?: number;
}

export function ScrollStaggerList({ children, className, threshold = 0.1 }: ScrollStaggerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: threshold });
  
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// 动画数字组件
interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedNumber({ value, duration = 1, className }: AnimatedNumberProps) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={className}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration }}
      >
        {value.toLocaleString()}
      </motion.span>
    </motion.span>
  );
}

// 打字机效果组件
interface TypewriterProps {
  text: string;
  delay?: number;
  className?: string;
}

export function Typewriter({ text, delay = 0.03, className }: TypewriterProps) {
  return (
    <motion.span className={className}>
      {text.split("").map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.05, delay: index * delay }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}

// 弹跳加载指示器
export function BouncingDots({ className }: { className?: string }) {
  return (
    <div className={`flex gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-primary rounded-full"
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// 脉冲指示器
export function PulseIndicator({ className, color = "bg-green-500" }: { className?: string; color?: string }) {
  return (
    <span className={`relative flex h-3 w-3 ${className}`}>
      <motion.span
        className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}
        animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${color}`} />
    </span>
  );
}

// 骨架屏动画
export function SkeletonPulse({ className }: { className?: string }) {
  return (
    <motion.div
      className={`bg-muted rounded ${className}`}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// 进入/离开动画容器
interface PresenceContainerProps {
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
}

export function PresenceContainer({ children, isVisible, className }: PresenceContainerProps) {
  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
