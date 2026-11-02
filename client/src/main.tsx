import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
// Bundled with the app, not loaded from Google Fonts: the PCs this runs on
// can't assume internet, and a missing font fell back to Georgia (Royale DS).
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { SITE_NAME } from './site.config'

document.title = `LedgerLab — ${SITE_NAME}`

const queryClient = new QueryClient()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
