import { useId, useLayoutEffect, useRef } from 'react';
import './HomeBranch.css';

/** Continue the birds' perch into a full-width branch at the foot of the page. */
export function HomeBranch() {
  const floor = useRef<HTMLDivElement>(null);
  const connector = useRef<SVGSVGElement>(null);
  const grain = useId();
  const image = `${import.meta.env.BASE_URL}notebook/branch-floor.webp`;
  useLayoutEffect(() => {
    const footer = floor.current;
    const svg = connector.current;
    const page = footer?.closest('main');
    const perch = page?.querySelector<HTMLElement>('.home-illustration');
    if (!footer || !svg || !page || !perch) return;
    const draw = () => {
      const base = page.getBoundingClientRect();
      const bird = perch.getBoundingClientRect();
      const bottom = footer.getBoundingClientRect();
      if (!bird.width || !bottom.height) {
        svg.querySelectorAll('path').forEach(path => path.setAttribute('d', ''));
        return;
      }
      // Match the bare fork in the displayed lower strip of the illustration.
      const endX = bottom.left - base.left + bottom.width * 873 / 1536;
      const endY = bottom.top - base.top + bottom.height * 90 / 424;
      const startX = bird.left - base.left + bird.width * .98;
      const startY = bird.top - base.top + bird.height * .805;
      // On a phone, keep the connecting stem in the outer gutter beside the form.
      const side = base.width <= 760 ? base.width - 8 : Math.min(base.width - 8, startX + 24);
      const firstBend = startY + Math.min(50, (endY - startY) * .4);
      const lastBend = Math.max(firstBend, base.width <= 760 ? bottom.top - base.top + 4 : endY - 70);
      const middle = (firstBend + lastBend) / 2;
      const path = `M ${startX} ${startY} C ${Math.min(side, startX + 14)} ${startY + 10}, ${side} ${startY + 24}, ${side} ${firstBend} C ${side + 1} ${middle}, ${side - 5} ${middle}, ${side - 4} ${lastBend} C ${side - 4} ${endY - 24}, ${endX} ${endY - 24}, ${endX} ${endY}`;
      svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
      svg.style.setProperty('--branch-width', `${Math.max(3, bird.width * .014)}px`);
      svg.querySelectorAll('path').forEach(element => element.setAttribute('d', path));
    };
    draw();
    const observer = new ResizeObserver(draw);
    [page, perch, footer].forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <div ref={floor} className="home-branch-floor" aria-hidden="true">
    <svg ref={connector} className="home-branch-connector" focusable="false" preserveAspectRatio="none">
      <defs><filter id={grain} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".18 .65" numOctaves="3" seed="7" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.5" />
      </filter><pattern id={`${grain}-bark`} patternUnits="userSpaceOnUse" width="24" height="24">
        <rect width="24" height="24" fill="#a39174" />
        <svg width="24" height="24" viewBox="580 790 32 32" preserveAspectRatio="none">
          <image href={image} width="1536" height="1024" />
        </svg>
      </pattern></defs>
      <g fill="none" strokeLinecap="round" filter={`url(#${grain})`}>
        <path className="home-branch-bark" stroke={`url(#${grain}-bark)`} />
      </g>
    </svg>
    <svg className="home-branch-art" viewBox="0 600 1536 424" preserveAspectRatio="none" focusable="false">
      <image href={image} width="1536" height="1024" />
    </svg>
  </div>;
}
