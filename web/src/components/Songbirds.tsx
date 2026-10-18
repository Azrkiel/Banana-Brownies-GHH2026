/** The two participants share a branch throughout the call screens. */
export function Songbirds({ className = '' }: { className?: string }) {
  return <img className={`songbirds ${className}`} src={`${import.meta.env.BASE_URL}notebook/songbirds.webp`} alt="" width="1536" height="1024" draggable="false" />;
}
