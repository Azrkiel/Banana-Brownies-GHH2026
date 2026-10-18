export function AstronomyArt({ className = '' }: { className?: string }) {
  return <img className={`astronomy-art ${className}`} src={`${import.meta.env.BASE_URL}notebook/astronomy.webp`} alt="" aria-hidden="true" width="1536" height="1024" />;
}
