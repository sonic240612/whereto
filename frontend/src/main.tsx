import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './liquid-glass.css'
import DesignProvider from './components/DesignProvider'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DesignProvider><App /></DesignProvider>
    </BrowserRouter>
  </StrictMode>,
)
