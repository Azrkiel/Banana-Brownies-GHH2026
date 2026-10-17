import { useEffect } from 'react';
import { ConnectionPlate } from '../components/ConnectionPlate';
import { Icon } from '../components/ui';
import './Intro.css';

export default function Intro() {
  useEffect(() => { document.title = 'A little closer · SignLine'; }, []);
  return <main className="intro-screen" id="main-content" aria-labelledby="intro-title">
    <header className="intro-header">
      <a className="brand" href="#/welcome" aria-label="SignLine welcome"><span className="brand-mark"><Icon name="captions" /></span>SignLine</a>
      <a className="intro-skip" href="#/conversation">Skip intro <Icon name="arrow" /></a>
    </header>
    <section className="intro-editorial" aria-label="Welcome">
      <div className="intro-copy">
        <p className="eyebrow">A DIFFERENT PERSPECTIVE / 01</p>
        <h1 id="intro-title">A world<br />within reach.</h1>
        <p className="intro-description">Different ways to speak.<br />One place to connect.</p>
        <a className="ui-button ui-button--primary intro-begin" href="#/conversation">Begin <Icon name="arrow" /></a>
        <p className="intro-note">A shared space for two people,<br />at your pace, in your words.</p>
      </div>
      <figure className="intro-plate">
        <div className="intro-plate__heading"><span>FIELD NOTES ON CONNECTION</span><span>FIG. 01</span></div>
        <ConnectionPlate />
        <figcaption><span>Different perspectives. Common ground.</span><span>SignLine</span></figcaption>
      </figure>
    </section>
    <footer className="intro-footer"><p>A little closer. Even from here.</p><a href="#/conversation">Explore the conversation <Icon name="arrow" /></a></footer>
  </main>;
}
