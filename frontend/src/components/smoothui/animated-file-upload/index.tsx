"use client";

/**
 * 改寫自 SmoothUI animated-file-upload：這個工作台一次只開一個 .md、畫面不能有檔案列表，
 * 所以只保留中央入口（#choose）：idle 虛線框、按下 scale .97。
 * 內建 <input type=file> 與檔案清單已移除（由 #file-input 與 window 層拖曳監聽負責）。
 */

import { cn } from "@/lib/utils";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

export function DropZoneButton({ className, children, ...props }: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion();
  return (
    <motion.button whileTap={reduced ? undefined : { scale: 0.97 }} className={cn("drop-prompt", className)} {...props}>
      {children}
    </motion.button>
  );
}
