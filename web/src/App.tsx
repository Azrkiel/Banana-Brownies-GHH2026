import { LETTERS, SIGNS_TIER1 } from './vocab'
import './App.css'

export default function App() {
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
