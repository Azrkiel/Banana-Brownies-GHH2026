import { useLayoutEffect, useRef } from 'react';
import './CallBranch.css';

/** Extend the existing perch sideways, beneath the opaque join card. */
export function CallBranch() {
  const drawing = useRef<SVGSVGElement>(null);
  const left = useRef<SVGSVGElement>(null);
  const right = useRef<SVGSVGElement>(null);
  const mirrored = useRef<SVGGElement>(null);
  const image = `${import.meta.env.BASE_URL}notebook/branch-extension.webp`;
  useLayoutEffect(() => {
    const svg = drawing.current;
    const page = svg?.closest('main');
    const perch = page?.querySelector<HTMLElement>('.home-illustration');
    if (!svg || !page || !perch || !left.current || !right.current || !mirrored.current) return;
    const draw = () => {
      const base = page.getBoundingClientRect();
      const bird = perch.getBoundingClientRect();
      if (!bird.width) return;
      const scale = bird.width / 1536;
      const height = 424 * scale;
      const startX = bird.left - base.left + bird.width * .02;
      const startY = bird.top - base.top + bird.height * .635;
      const endX = bird.left - base.left + bird.width * .98;
      const endY = bird.top - base.top + bird.height * .805;
      svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
      const position = (element: SVGSVGElement, x: number, y: number, width: number) => {
        // Keep the bark at the perch's scale; allow a wider crop on large screens.
        const sourceWidth = Math.min(1536, width / scale);
        element.setAttribute('x', String(x));
        element.setAttribute('y', String(y - 140 * scale));
        element.setAttribute('width', String(width));
        element.setAttribute('height', String(height));
        element.setAttribute('viewBox', `0 600 ${sourceWidth} 424`);
        return sourceWidth;
      };
      const sourceWidth = position(left.current!, 0, startY, startX + 3);
      mirrored.current!.setAttribute('transform', `translate(${sourceWidth} 0) scale(-1 1)`);
      position(right.current!, endX - 3, endY, base.width - endX + 3);
    };
    draw();
    const observer = new ResizeObserver(draw);
    [page, perch].forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <svg ref={drawing} className="call-branch" aria-hidden="true" focusable="false" preserveAspectRatio="none">
    <svg ref={left} className="call-branch__left" preserveAspectRatio="none">
      <g ref={mirrored}><image href={image} width="1536" height="1024" /></g>
    </svg>
    <svg ref={right} className="call-branch__right" preserveAspectRatio="none">
      <image href={image} width="1536" height="1024" />
    </svg>
  </svg>;
}
