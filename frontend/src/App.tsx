import { Routes, Route } from 'react-router-dom'
import Home from './routes/Home'
import Result from './routes/Result'
import Gallery from './routes/Gallery'
import Share from './routes/Share'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/result" element={<Result />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/share" element={<Share />} />
    </Routes>
  )
}

export default App
