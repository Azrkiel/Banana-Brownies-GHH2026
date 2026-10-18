import { useEffect } from 'react';
import { AstronomyArt } from '../components/AstronomyArt';
import { Icon } from '../components/ui';
import './Intro.css';

export default function Intro() {
  useEffect(() => { document.title = 'SignLine'; }, []);
  return <main className="intro-screen" id="main-content" aria-labelledby="intro-title">
    <h1 id="intro-title">SignLine</h1>
    <AstronomyArt className="intro-astronomy" />
    <a className="intro-begin" href="#/conversation">Begin <Icon name="arrow" /></a>
  </main>;
}
