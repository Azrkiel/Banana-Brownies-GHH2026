import { useEffect, useRef } from 'react';

type Star = { angle: number; distance: number; scatter: number; size: number; brightness: number; color: number; phase: number };

// Fixed seeds keep the composition stable when resizing or pausing the scene.
function stars(count: number, seed: number): Star[] {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    distance: random(), scatter: random() - .5,
    size: random(), brightness: .3 + random() * .7,
    color: random(), phase: random() * Math.PI * 2,
  }));
}

function makeGlow(color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const context = sprite.getContext('2d');
  if (!context) return sprite;
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, '#fff');
  glow.addColorStop(.12, color);
  glow.addColorStop(.3, `${color}a0`);
  glow.addColorStop(1, `${color}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 32, 32);
  return sprite;
}

/** Original orbital particle motion; no video, WebGL dependency, or media access. */
export default function OrbitalStars({ paused, reducedMotion, departing }: {
  paused: boolean; reducedMotion: boolean; departing: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const background = stars(260, 4371);
    const orbit = stars(1100, 90817);
    const glows = ['#ffffff', '#b5d7ff', '#e8c89b'].map(makeGlow);
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrame = 0;
    let disposed = false;

    const draw = () => {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';
      const time = clock.current;
      const narrow = width <= 600;
      // These anchors match the photographic asset's object-position, including the mobile crop.
      const sceneHeight = height * (narrow ? .82 : 1);
      const imageHeight = Math.max(sceneHeight, width / (16 / 9));
      const imageWidth = imageHeight * (16 / 9);
      const earthX = imageWidth * .659 + (width - imageWidth) * (narrow ? .71 : .65);
      const earthY = imageHeight * .441 + (sceneHeight - imageHeight) * .42 - (narrow ? height * .05 : 0);
      const earthRadius = imageHeight * .247;
      const horizon = height * (narrow ? .62 : .78);
      const paint = (x: number, y: number, size: number, alpha: number, color: number) => {
        const fade = Math.max(0, Math.min(1, (horizon - y) / (height * .12)));
        if (!fade || x < -10 || x > width + 10 || y < -10 || y > height + 10) return;
        context.globalAlpha = Math.max(0, Math.min(1, alpha * fade));
        const sprite = glows[color > .95 ? 2 : color > .78 ? 1 : 0];
        context.drawImage(sprite, x - size * 3, y - size * 3, size * 6, size * 6);
      };
      for (let index = 0; index < (narrow ? 130 : background.length); index++) {
        const star = background[index];
        const x = star.angle / (Math.PI * 2) * width;
        const y = star.distance * height * .79;
        if ((x - earthX) ** 2 + (y - earthY) ** 2 < earthRadius ** 2) continue;
        paint(x, y, .35 + star.size * .8, star.brightness * (.35 + .15 * Math.sin(time * .45 + star.phase)), star.color);
      }
      const tilt = -.5;
      for (let index = 0; index < (narrow ? 650 : orbit.length); index++) {
        const star = orbit[index];
        const radius = 1.12 + star.distance ** .78 * 1.8;
        const arm = index % 3 * Math.PI * 2 / 3;
        const angle = arm + radius * 2.7 + star.scatter * .42 + time * (.105 + .018 / radius);
        const spread = star.scatter * earthRadius * .13;
        const x = Math.cos(angle) * radius * earthRadius;
        const y = Math.sin(angle) * radius * earthRadius * .48 + spread;
        const projectedX = x * Math.cos(tilt) - y * Math.sin(tilt);
        const projectedY = x * Math.sin(tilt) + y * Math.cos(tilt);
        const depth = Math.sin(angle);
        if (depth < 0 && projectedX ** 2 + projectedY ** 2 < (earthRadius * 1.04) ** 2) continue;
        const brightness = (.38 + .25 * Math.sin(time * .6 + star.phase)) * star.brightness;
        paint(earthX + projectedX, earthY + projectedY, .38 + star.size ** 5 * 1.9, brightness * (depth > 0 ? 1 : .6), star.color);
      }
      context.globalAlpha = 1;
    };

    const tick = (now: number) => {
      if (disposed || document.hidden) return;
      frame = requestAnimationFrame(tick);
      if (now - lastFrame < 1000 / 30) return;
      if (lastFrame) clock.current += Math.min((now - lastFrame) / 1000, .08) * (departing ? 2.4 : 1);
      lastFrame = now;
      draw();
    };
    const start = () => {
      cancelAnimationFrame(frame);
      lastFrame = 0;
      if (!paused && !reducedMotion && !document.hidden && width > 0 && height > 0) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
      start();
    };
    const visibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else { draw(); start(); }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    document.addEventListener('visibilitychange', visibility);
    resize();
    start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [paused, reducedMotion, departing]);

  return <canvas className="intro-stars" ref={canvas} aria-hidden="true" />;
}
