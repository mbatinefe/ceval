import { useEffect, useRef, useState } from "react";

export const PORTRAIT_QUERY = "(max-width: 700px), (max-aspect-ratio: 1/1)";
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function useStoryScroll() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const focusChapter = useRef<number | null>(null);
  const [chapter, setChapter] = useState(0);
  const [portrait, setPortrait] = useState(
    () => matchMedia(PORTRAIT_QUERY).matches,
  );
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const root = section.current,
      viewport = stage.current;
    if (!root || !viewport) return;
    const portraitMedia = matchMedia(PORTRAIT_QUERY);
    const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const height = viewport.clientHeight,
        width = viewport.clientWidth;
      const progress = clamp(-rect.top / Math.max(1, rect.height - height));
      const phase = progress >= 0.62 ? 2 : progress >= 0.24 ? 1 : 0;
      const isPortrait = portraitMedia.matches;
      const reduce = motionMedia.matches;
      const aspect = isPortrait ? 941 / 1672 : 1672 / 941;
      const imageWidth = Math.max(width, height * aspect);
      const imageHeight = imageWidth / aspect;
      const fit = Math.min(
        (width - (isPortrait ? 32 : 100)) / imageWidth,
        Math.max(220, height - (height < 520 ? 120 : 205)) / imageHeight,
      );
      const t = reduce ? Number(phase > 0) : clamp((progress - 0.04) / 0.2);
      const ease = t * t * (3 - 2 * t);
      root.style.setProperty("--scene-width", `${imageWidth}px`);
      root.style.setProperty("--scene-height", `${imageHeight}px`);
      root.style.setProperty(
        "--scene-scale",
        String(1.04 + (fit - 1.04) * ease),
      );
      root.style.setProperty("--story-progress", String(progress));
      root.style.setProperty(
        "--intro-opacity",
        String(
          reduce ? Number(phase === 0) : 1 - clamp((progress - 0.03) / 0.21),
        ),
      );
      setChapter(phase);
      setPortrait(isPortrait);
      setReduced(reduce);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    portraitMedia.addEventListener("change", schedule);
    motionMedia.addEventListener("change", schedule);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      portraitMedia.removeEventListener("change", schedule);
      motionMedia.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (focusChapter.current !== chapter) return;
    focusChapter.current = null;
    const selector = [".cinema-explore", ".cinema-detection", ".cinema-offer"][
      chapter
    ];
    section.current
      ?.querySelector<HTMLElement>(selector)
      ?.focus({ preventScroll: true });
  }, [chapter]);
  const go = (next: number, moveFocus = false) => {
    const root = section.current,
      viewport = stage.current;
    if (!root || !viewport) return;
    focusChapter.current = moveFocus ? next : null;
    const position = [0, 0.41, 0.82][next] ?? 0;
    window.scrollTo({
      top:
        window.scrollY +
        root.getBoundingClientRect().top +
        (root.offsetHeight - viewport.clientHeight) * position,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return { section, stage, chapter, portrait, reduced, go };
}
