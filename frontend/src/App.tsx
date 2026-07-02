import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'

//import ProtectedRoute from './components/protectedRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes — wrapped individually */}
        {/* <Route path="/" element={
          <ProtectedRoute >
          </ProtectedRoute>
        }/> */}
        {/* <Route path="/graph/:repoId" element={
          <ProtectedRoute>
            <Graph />
          </ProtectedRoute>
        }/> */}
        {/* <Route path="/pr/:repoId" element={
          <ProtectedRoute>
            <PRHunter />
          </ProtectedRoute>
        }/> */}
      </Routes>
    </BrowserRouter>
  )
}