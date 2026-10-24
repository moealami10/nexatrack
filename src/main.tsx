import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.tsx'

// Baseline matches the Vite base so the GitHub Pages sub-path
// (moealami10.github.io/nexatrack/) routes correctly; Vite's dev server
// and vite preview both keep '/' or '/nexatrack/' in sync with the config.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
