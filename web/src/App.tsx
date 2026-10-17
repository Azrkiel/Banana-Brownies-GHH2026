import { useEffect, useState } from 'react'
import { LETTERS, SIGNS_TIER1 } from './vocab'
import Bench from './pages/Bench'
import Recorder from './pages/Recorder'
import './App.css'

function Home() {
  return (
    <main>
      <p className="eyebrow">SignLine · Development scaffold</p>
      <h1>A conversation starts here.</h1>
      <p>A planned two-person video call with confirmed English captions and voice
        for a small vocabulary of isolated signs.</p>
      <section aria-labelledby="status">
        <h2 id="status">Phase 0: Setup</h2>
        <p>The frontend scaffold is running. Calls, camera tracking, recognition,
          captions, and voice are coming in later phases.</p>
      </section>
      <section aria-labelledby="vocabulary">
        <h2 id="vocabulary">Planned recording vocabulary</h2>
        <p>Sign forms still need team verification before recording.</p>
        <ul>{SIGNS_TIER1.map(sign => <li key={sign}>{sign}</li>)}</ul>
        <p>Default demo name: LIV · Letters: {LETTERS.join(', ')}</p>
      </section>
      <p className="note">Limited to isolated signs from a small vocabulary.
        Not for medical, legal, or emergency use.</p>
    </main>
  )
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return <>
    <nav aria-label="Development pages"><a href="#/">Home</a> · <a href="#/bench">Camera benchmark</a> · <a href="#/record">Record landmarks</a></nav>
    {hash.replace(/^#\/?/, '') === 'record' ? <Recorder /> : hash.replace(/^#\/?/, '') === 'bench' ? <Bench /> : <Home />}
  </>;
}
