import express from 'express'
import cors from 'cors'
import visitsRouter from './routes/visits'
import sharesRouter from './routes/shares'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/visits', visitsRouter)
app.use('/api/shares', sharesRouter)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
