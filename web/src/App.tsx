import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import Intro from './pages/Intro'
import { BirdLoading } from './components/BirdLoading'
import './App.css'

const SpeechCheck = lazy(() => import('./pages/SpeechCheck'))
const Bench = lazy(() => import('./pages/Bench'))
const Recorder = lazy(() => import('./pages/Recorder'))
const Call = lazy(() => import('./pages/Call'))
const CallRoom = lazy(() => import('./pages/Call').then(module => ({ default: module.CallRoom })))
const Stats = lazy(() => import('./pages/Stats'))
const DesignKit = lazy(() => import('./pages/DesignKit'))
const PersonalSigns = lazy(() => import('./pages/PersonalSigns'))
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
  const [hash, setHash] = useState(new URLSearchParams(window.location.search).has('auth_callback') ? '#/training' : window.location.hash)
  const [welcomeFlight, setWelcomeFlight] = useState(false)
  const finishLanding = useCallback(() => setWelcomeFlight(false), [])
  useEffect(() => {
    const update = () => {
      if (!/^#\/?conversation(?:\?|$)/.test(window.location.hash)) setWelcomeFlight(false)
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [route, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const isIntro = route === '' || route === 'welcome'
  useLayoutEffect(() => {
    if (isIntro) return
    document.title = 'SignLine'
  }, [route, isIntro])
  const links = [
    { route: 'conversation', label: 'Call' },
    { route: 'bench', label: 'Camera' },
    { route: 'speech-check', label: 'Speech' },
    { route: 'record', label: 'Record' },
    { route: 'training', label: 'My signs' },
    { route: 'stats', label: 'Stats' },
  ]
  if (isIntro) return <Intro key={hash} onDepart={setWelcomeFlight} />
  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      const main = document.querySelector('main')
      if (main) { main.tabIndex = -1; main.focus() }
    }}>Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#/welcome">SignLine</a>
      <nav aria-label="Main navigation">{links.map(link => <a key={link.route} href={`#/${link.route}`} aria-current={(link.route === 'conversation' ? ['conversation', 'room'].includes(route) : route === link.route) ? 'page' : undefined}>{link.label}</a>)}</nav>
    </header>
    <Suspense fallback={<BirdLoading />}>
      <PageContent key={`${route}?${query}`}>
        {route === 'training' ? <PersonalSigns /> : route === 'speech-check' ? <SpeechCheck /> : route === 'design-kit' ? <DesignKit /> : route === 'stats' ? <Stats /> : route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : route === 'room' ? <CallRoom key={query} query={query} /> : <Call welcomeFlight={welcomeFlight} onLanded={finishLanding} />}
      </PageContent>
    </Suspense>
  </>
}
