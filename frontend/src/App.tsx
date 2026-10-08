import { Routes, Route, Link } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import HomeLink from './components/HomeLink'
import DesignSettings from './components/DesignSettings'
import Home from './routes/Home'
import Result from './routes/Result'
import Gallery from './routes/Gallery'
import Share from './routes/Share'

function App() {
  return (
    <><div className="app-home-link"><HomeLink /><DesignSettings /></div><ErrorBoundary><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/result" element={<Result />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/share" element={<Share />} />
      <Route path="*" element={<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6"><h1 className="text-xl font-bold">페이지를 찾을 수 없습니다</h1><Link to="/" className="text-primary underline">처음으로</Link></main>} />
    </Routes></ErrorBoundary></>
  )
}

export default App
