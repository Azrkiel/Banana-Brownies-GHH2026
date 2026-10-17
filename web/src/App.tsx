import { lazy, Suspense, useEffect, useState } from 'react'
import Bench from './pages/Bench'
import Recorder from './pages/Recorder'
import Call, { CallRoom } from './pages/Call'
import Stats from './pages/Stats'
import DesignKit from './pages/DesignKit'
import { Icon, type IconName } from './components/ui'
import './App.css'

const SpeechCheck = import.meta.env.DEV ? lazy(() => import('./pages/SpeechCheck')) : null

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [route, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const links: { route: string; label: string; icon: IconName }[] = [
    { route: '', label: 'Conversation', icon: 'video' },
    { route: 'bench', label: 'Camera check', icon: 'camera' },
    { route: 'record', label: 'Recorder', icon: 'record' },
    { route: 'stats', label: 'Stats', icon: 'chart' },
  ]
  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.querySelector('main')
      if (main) { main.tabIndex = -1; main.focus() }
    }}>Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#/" aria-label="SignLine home"><span className="brand-mark"><Icon name="captions" /></span>SignLine<span className="brand-period">.</span></a>
      <nav className="glass" aria-label="Main navigation">{links.map(link => <a key={link.route} href={`#/${link.route}`} aria-current={(link.route ? route === link.route : ['', 'room'].includes(route)) ? 'page' : undefined}><Icon name={link.icon} /><span>{link.label}</span></a>)}</nav>
      <a className="kit-link" href="#/design-kit" aria-current={route === 'design-kit' ? 'page' : undefined}><Icon name="sparkles" /><span>Design kit</span></a>
    </header>
    {route === 'speech-check' && SpeechCheck ? <Suspense fallback={<main><p>Opening speech check…</p></main>}><SpeechCheck /></Suspense> : route === 'design-kit' ? <DesignKit /> : route === 'stats' ? <Stats /> : route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : route === 'room' ? <CallRoom key={query} query={query} /> : <Call />}
  </>
}
