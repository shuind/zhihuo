import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type SubmitEnterOptions = {
  allowShift?: boolean;
  requireModifier?: boolean;
};

export function isComposingInput(event: ReactKeyboardEvent<Element>) {
  return event.nativeEvent.isComposing || event.keyCode === 229 || event.nativeEvent.keyCode === 229;
}

export function shouldSubmitOnEnter(event: ReactKeyboardEvent<Element>, options: SubmitEnterOptions = {}) {
  if (event.key !== "Enter") return false;
  if (isComposingInput(event)) return false;
  if (!options.allowShift && event.shiftKey) return false;
  if (options.requireModifier && !event.metaKey && !event.ctrlKey) return false;
  return true;
}

export function onSubmitEnter<T extends Element>(
  submit: () => void | Promise<void>,
  options?: SubmitEnterOptions
) {
  return (event: ReactKeyboardEvent<T>) => {
    if (!shouldSubmitOnEnter(event, options)) return;
    event.preventDefault();
    void submit();
  };
}
