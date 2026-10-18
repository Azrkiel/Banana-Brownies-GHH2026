import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Direct loads of /welcome (no hash) open the app's welcome route.
if (window.location.pathname === '/welcome') window.history.replaceState(null, '', '/' + window.location.search + '#/welcome')

// Camera effects must have one owner; do not mount a second tracker in development.
createRoot(document.getElementById('root')!).render(<App />)
