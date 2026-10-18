import './BirdScene.css';

type Scene = 'flight' | 'singing' | 'nest' | 'preening';

/** Separate notebook vignettes, registered in a two-by-two transparent sheet. */
export function BirdScene({ scene, className = '' }: { scene: Scene; className?: string }) {
  return <div className={`bird-scene bird-scene--${scene} ${className}`} data-bird-scene={scene} aria-hidden="true"
    style={{ backgroundImage: `url("${import.meta.env.BASE_URL}notebook/page-birds.webp")` }} />;
}
