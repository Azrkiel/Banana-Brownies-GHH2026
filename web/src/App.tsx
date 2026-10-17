import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Bench from './pages/Bench'
import Recorder from './pages/Recorder'
import Call, { CallRoom } from './pages/Call'
import Stats from './pages/Stats'
import DesignKit from './pages/DesignKit'
import { Icon, type IconName } from './components/ui'
import './App.css'

const SpeechCheck = lazy(() => import('./pages/SpeechCheck'))
type Appearance = 'system' | 'light' | 'dark'

function savedAppearance(): Appearance {
  try {
    const value = localStorage.getItem('signline-appearance')
    if (value === 'light' || value === 'dark') return value
  } catch { /* Storage is optional in private browsing. */ }
  return 'system'
}

export default function App() {
  const [appearance, setAppearance] = useState<Appearance>(savedAppearance)
  const navigation = useRef<HTMLElement>(null)
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance
    try { localStorage.setItem('signline-appearance', appearance) } catch { /* Keep the in-memory preference. */ }
  }, [appearance])
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [route, query = ''] = hash.replace(/^#\/?/, '').split('?')
  useLayoutEffect(() => {
    const nav = navigation.current
    if (!nav) return
    const measure = () => {
      const selected = nav.querySelector<HTMLElement>('a[aria-current]')
      nav.style.setProperty('--selection-visible', selected ? '1' : '0')
      if (!selected) {
        nav.style.setProperty('--selection-x', '0px')
        nav.style.setProperty('--selection-y', '0px')
        nav.style.setProperty('--selection-width', '0px')
        nav.style.setProperty('--selection-height', '0px')
        return
      }
      nav.style.setProperty('--selection-x', `${selected.offsetLeft}px`)
      nav.style.setProperty('--selection-y', `${selected.offsetTop}px`)
      nav.style.setProperty('--selection-width', `${selected.offsetWidth}px`)
      nav.style.setProperty('--selection-height', `${selected.offsetHeight}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [route])
  const links: { route: string; label: string; short: string; icon: IconName }[] = [
    { route: '', label: 'Conversation', short: 'Call', icon: 'video' },
    { route: 'bench', label: 'Camera check', short: 'Camera', icon: 'camera' },
    { route: 'speech-check', label: 'Speech check', short: 'Speech', icon: 'captions' },
    { route: 'record', label: 'Recorder', short: 'Record', icon: 'record' },
    { route: 'stats', label: 'Stats', short: 'Stats', icon: 'chart' },
  ]
  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.querySelector('main')
      if (main) { main.tabIndex = -1; main.focus() }
    }}>Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#/" aria-label="SignLine home"><span className="brand-mark"><Icon name="captions" /></span>SignLine<span className="brand-period">.</span></a>
      <nav ref={navigation} className="glass" aria-label="Main navigation"><span className="nav-selection" aria-hidden="true" />{links.map(link => <a key={link.route} href={`#/${link.route}`} aria-label={link.label} aria-current={(link.route ? route === link.route : ['', 'room'].includes(route)) ? 'page' : undefined}><Icon name={link.icon} /><span className="nav-label">{link.label}</span><span className="nav-short" aria-hidden="true">{link.short}</span></a>)}</nav>
      <div className="header-tools glass" role="group" aria-label="Display and design tools">
        <button className="appearance-button" type="button" aria-label={`Appearance: ${appearance}. Switch to ${appearance === 'system' ? 'light' : appearance === 'light' ? 'dark' : 'system'}.`} onClick={() => setAppearance(appearance === 'system' ? 'light' : appearance === 'light' ? 'dark' : 'system')}><Icon name={appearance === 'system' ? 'display' : appearance === 'light' ? 'sun' : 'moon'} /><span>{appearance === 'system' ? 'Auto' : appearance === 'light' ? 'Light' : 'Dark'}</span></button>
        <a className="kit-link" href="#/design-kit" aria-current={route === 'design-kit' ? 'page' : undefined}><Icon name="sparkles" /><span>Design kit</span></a>
      </div>
    </header>
    {route === 'speech-check' ? <Suspense fallback={<main id="main-content"><p className="note" role="status">Opening speech check…</p></main>}><SpeechCheck /></Suspense> : route === 'design-kit' ? <DesignKit /> : route === 'stats' ? <Stats /> : route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : route === 'room' ? <CallRoom key={query} query={query} /> : <Call />}
  </>
}
