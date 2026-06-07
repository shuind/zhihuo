export const PULL_REFRESH_THRESHOLD_PX = 72;
export const PULL_REFRESH_MAX_DISTANCE_PX = 112;

export function canStartGlobalPullRefresh(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  const scrollable = target.closest(
    "[data-track-scroll], [data-thinking-spaces], [data-life-detail], .overflow-y-auto, .overflow-auto"
  );
  if (!(scrollable instanceof HTMLElement)) return true;
  return scrollable.scrollTop <= 0;
}
