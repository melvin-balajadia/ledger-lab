import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SITE_NAME } from './site.config'

document.title = `LedgerLab — ${SITE_NAME}`

// After any successful save, refresh every query: a replenishment, PO or
// payroll edit can move figures on screens other than its own -- the
// sidebar's Needs review count, the PO page's retention tile, the Overview.
// Each mutation used to refresh only its own list, and anything that stays
// on screen (the sidebar never unmounts) kept showing the old figure until a
// page reload. One rule here covers every save, present and future; on-screen
// queries refetch now, the rest the next time they're shown. Saves that
// change no ledger data opt out with meta.refreshesData = false.
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.refreshesData === false) return
      return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    },
  }),
})

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
