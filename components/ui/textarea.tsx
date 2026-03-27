import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
  maxAutoHeight?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, autoResize = false, maxAutoHeight, onInput, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) ref.current = node;
    },
    [ref]
  );

  const resize = React.useCallback(() => {
    if (!autoResize || !innerRef.current) return;
    const node = innerRef.current;
    node.style.height = "auto";
    const scrollHeight = node.scrollHeight;
    const maxHeight = typeof maxAutoHeight === "number" && maxAutoHeight > 0 ? maxAutoHeight : Number.POSITIVE_INFINITY;
    const nextHeight = Math.min(scrollHeight, maxHeight);
    node.style.height = `${nextHeight}px`;
    node.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
  }, [autoResize, maxAutoHeight]);

  React.useLayoutEffect(() => {
    resize();
  }, [resize, props.value]);

  React.useEffect(() => {
    resize();
  }, [resize]);

  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        autoResize && "resize-none",
        className
      )}
      ref={setRefs}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
