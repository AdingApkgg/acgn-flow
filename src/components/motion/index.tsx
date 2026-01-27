"use client";

import { motion, type Variants } from "framer-motion";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

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

// 从左侧滑入
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

// 从右侧滑入
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

// 缩放淡入
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
};

// 交错动画容器
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

// 交错子元素
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// 页面过渡
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.4, ease: "easeOut" } 
  },
  exit: { 
    opacity: 0, 
    y: -10, 
    transition: { duration: 0.2 } 
  },
};

// MotionDiv 组件
export const MotionDiv = motion.div;
export const MotionSection = motion.section;
export const MotionUl = motion.ul;
export const MotionLi = motion.li;

// 淡入容器组件
interface FadeInProps extends ComponentPropsWithoutRef<typeof motion.div> {
  delay?: number;
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(
  ({ children, delay = 0, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
FadeIn.displayName = "FadeIn";

// 悬停缩放组件
export const HoverScale = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof motion.div>
>(({ children, ...props }, ref) => (
  <motion.div
    ref={ref}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    transition={{ duration: 0.2 }}
    {...props}
  >
    {children}
  </motion.div>
));
HoverScale.displayName = "HoverScale";

// 页面包装组件
export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageTransition}
    >
      {children}
    </motion.div>
  );
}

// 交错列表组件
export function StaggerList({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
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
