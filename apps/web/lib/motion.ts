/** True when the OS asks for reduced motion or the user turned on "Reduce animations" in Account settings. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.reduceMotion === "true"
  );
}

/** True unless the user turned off "Celebration effects" in Account settings. */
export function celebrationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.celebrations !== "off";
}
