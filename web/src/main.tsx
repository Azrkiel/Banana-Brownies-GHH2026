import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Camera effects must have one owner; do not mount a second tracker in development.
createRoot(document.getElementById('root')!).render(<App />)
