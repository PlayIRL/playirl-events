"use client";
import { useEffect, useRef, useState } from "react";

export function useStickySentinel(rootMargin = "0px") {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinel can be off-screen for two reasons: scrolled past (above
        // viewport → element is pinned) or not yet reached (below viewport
        // → element is in its natural slot). Without distinguishing, every
        // card below the fold reports stuck=true, then flips to false the
        // moment it scrolls into view — visible as a height jump.
        setIsStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { sentinelRef, isStuck };
}
