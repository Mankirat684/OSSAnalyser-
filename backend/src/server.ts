import express from 'express'
import { requireAuth } from './middleware/auth.js'

const app = express()
app.use(express.json())
app.use(requireAuth)

app.listen(3000, () => {
  console.log('Server is running on port 3000')
});