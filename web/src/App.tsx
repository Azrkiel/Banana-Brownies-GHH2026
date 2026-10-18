import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import Intro from './pages/Intro'
import { BirdLoading } from './components/BirdLoading'
import './App.css'

// Auth pulls in supabase (~200 KB); only working pages need it, so the landing page skips it.
const loadAuth = () => import('./components/AuthProvider').then(module => ({ default: module.AuthProvider }))
const AuthProvider = lazy(loadAuth)
if (!/^#\/?(welcome)?$/.test(window.location.hash)) void loadAuth()
const SpeechCheck = lazy(() => import('./pages/SpeechCheck'))
const Bench = lazy(() => import('./pages/Bench'))
const Recorder = lazy(() => import('./pages/Recorder'))
const Call = lazy(() => import('./pages/Call'))
const CallRoom = lazy(() => import('./pages/Call').then(module => ({ default: module.CallRoom })))
const DesignKit = lazy(() => import('./pages/DesignKit'))
const PersonalSigns = lazy(() => import('./pages/PersonalSigns'))
const DEV = import.meta.env.DEV
const KNOWN_ROUTES = new Set(['', 'welcome', 'conversation', 'room', 'bench', 'speech-check', 'record', 'training'])
const TITLES: Record<string, string> = { conversation: 'Call', room: 'Call', 'speech-check': 'Speech check', record: 'Record', training: 'My signs', bench: 'Camera check', 'design-kit': 'Design kit' }
function NotFound() {
  return <main id="main-content" className="not-found"><h1>Page not found</h1><p>That page does not exist. <a href="#/conversation">Back to Call</a></p></main>
}
// This commits only after a lazy screen is ready, so focus never lands in a discarded fallback.
function PageContent({ children, title }: { children: ReactNode; title: string }) {
  // Passive, so a previous page's cleanup (e.g. restoring its old title) runs first.
  useEffect(() => { document.title = title }, [title])
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
  const known = KNOWN_ROUTES.has(route) || (DEV && route === 'design-kit')
  const title = `${known ? TITLES[route] ?? 'Call' : 'Not found'} · SignLine`
  // Camera check (#/bench) and Record (#/record) are developer tools: reachable by URL, not listed.
  const links = [
    { route: 'conversation', label: 'Call' },
    { route: 'speech-check', label: 'Speech check' },
    { route: 'training', label: 'My signs' },
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
      <AuthProvider>
      <PageContent key={`${route}?${query}`} title={title}>
        {!known ? <NotFound /> : route === 'training' ? <PersonalSigns /> : route === 'speech-check' ? <SpeechCheck /> : route === 'design-kit' ? <DesignKit /> : route === 'record' ? <Recorder /> : route === 'bench' ? <Bench /> : route === 'room' ? <CallRoom key={query} query={query} /> : <Call welcomeFlight={welcomeFlight} onLanded={finishLanding} />}
      </PageContent>
      </AuthProvider>
    </Suspense>
  </>
}
