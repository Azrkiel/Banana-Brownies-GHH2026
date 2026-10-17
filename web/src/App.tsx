import { useEffect, useState } from 'react'
import Bench from './pages/Bench'
import Recorder from './pages/Recorder'
import Call from './pages/Call'
import './App.css'

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const route = hash.replace(/^#\/?/, '')
  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.querySelector('main')
      if (main) { main.tabIndex = -1; main.focus() }
    }}>Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#/" aria-label="SignLine home"><span className="brand-mark" aria-hidden="true">s<span>·</span></span>SignLine<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation"><a href="#/" aria-current={!['bench', 'record'].includes(route) ? 'page' : undefined}>Conversation</a><a href="#/bench" aria-current={route === 'bench' ? 'page' : undefined}>Camera check</a><a href="#/record" aria-current={route === 'record' ? 'page' : undefined}>Recorder</a></nav>
      <span className="build-badge">IN DEVELOPMENT</span>
    </header>
    {route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : <Call />}
  </>
}
