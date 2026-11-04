"use client";

import { useEffect, useState } from "react";

export interface SectionLink {
  id: string;
  label: string;
}

const READING_LINE = 0.3;

export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    function update() {
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      let current = sections[0]?.id;
      for (const { id } of sections) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= window.innerHeight * READING_LINE) current = id;
      }
      setActive(atBottom ? sections[sections.length - 1]?.id : current);
    }

    const first = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  return (
    <>
      {sections.map(({ id, label }) => (
        <a key={id} href={`#${id}`} className={id === active ? "nav-link is-active" : "nav-link"}>
          {label}
        </a>
      ))}
    </>
  );
}
