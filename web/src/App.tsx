import { lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import Intro from './pages/Intro'
import { Icon, type IconName } from './components/ui'
import './App.css'

const SpeechCheck = lazy(() => import('./pages/SpeechCheck'))
const Bench = lazy(() => import('./pages/Bench'))
const Recorder = lazy(() => import('./pages/Recorder'))
const Call = lazy(() => import('./pages/Call'))
const CallRoom = lazy(() => import('./pages/Call').then(module => ({ default: module.CallRoom })))
const Stats = lazy(() => import('./pages/Stats'))
const DesignKit = lazy(() => import('./pages/DesignKit'))
// This commits only after a lazy screen is ready, so focus never lands in a discarded fallback.
function PageContent({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>('main')
    if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }) }
    window.scrollTo(0, 0)
  }, [])
  return children
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [route, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const isIntro = route === '' || route === 'welcome'
  useLayoutEffect(() => {
    if (isIntro) return
    document.title = 'SignLine'
  }, [route, isIntro])
  const links: { route: string; label: string; short: string; icon: IconName }[] = [
    { route: 'conversation', label: 'Conversation', short: 'Call', icon: 'video' },
    { route: 'bench', label: 'Camera check', short: 'Camera', icon: 'camera' },
    { route: 'speech-check', label: 'Speech check', short: 'Speech', icon: 'captions' },
    { route: 'record', label: 'Recorder', short: 'Record', icon: 'record' },
    { route: 'stats', label: 'Stats', short: 'Stats', icon: 'chart' },
  ]
  if (isIntro) return <Intro />
  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.querySelector('main')
      if (main) { main.tabIndex = -1; main.focus() }
    }}>Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#/conversation" aria-label="SignLine home"><span className="brand-mark"><Icon name="captions" /></span>SignLine<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation">{links.map(link => <a key={link.route} href={`#/${link.route}`} aria-label={link.label} aria-current={(link.route === 'conversation' ? ['conversation', 'room'].includes(route) : route === link.route) ? 'page' : undefined}><Icon name={link.icon} /><span className="nav-label">{link.label}</span><span className="nav-short" aria-hidden="true">{link.short}</span></a>)}</nav>
      <div className="header-tools">
        <a className="kit-link" href="#/design-kit" aria-current={route === 'design-kit' ? 'page' : undefined}><Icon name="sparkles" /><span>Design kit</span></a>
      </div>
    </header>
    <Suspense fallback={<main id="main-content"><p className="note" role="status">Opening {route === 'speech-check' ? 'speech check' : 'your space'}…</p></main>}>
      <PageContent key={`${route}?${query}`}>
        {route === 'speech-check' ? <SpeechCheck /> : route === 'design-kit' ? <DesignKit /> : route === 'stats' ? <Stats /> : route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : route === 'room' ? <CallRoom key={query} query={query} /> : <Call />}
      </PageContent>
    </Suspense>
  </>
}
