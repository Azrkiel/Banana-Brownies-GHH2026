import { BirdScene } from '../components/BirdScene';
import { PageHeader, Surface } from '../components/ui';
import './NotFound.css';

export default function NotFound() {
  return <main id="main-content" className="not-found">
    <PageHeader title="Page not found" />
    <Surface className="not-found__card">
      <BirdScene scene="singing" className="not-found__bird" />
      <div><p>That page does not exist. It may have moved, or the link may be mistyped.</p>
        <nav className="not-found__links" aria-label="Where to go">
          <a href="#/call">Go to Call</a><a href="#/welcome">Home</a><a href="#/speech-check">Speech check</a><a href="#/training">My signs</a>
        </nav>
      </div>
    </Surface>
  </main>;
}
