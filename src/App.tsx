import { useState, useEffect } from 'react'
import RoomSelect from './components/RoomSelect'
import Visualizer from './components/Visualizer'
import CustomUploadVisualizer from './components/CustomUploadVisualizer'
import AdminPanel from './components/AdminPanel'
import Login from './components/Login'
import Signup from './components/Signup'
import LandingPage from './components/LandingPage'

function App() {
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [currentRoute, setCurrentRoute] = useState('landing')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userName, setUserName] = useState<string>('')
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated')
    const storedName = localStorage.getItem('userName')
    if (auth === 'true') {
      setIsAuthenticated(true)
      if (storedName) setUserName(storedName)
    }
    setCurrentRoute('landing')
    setIsReady(true)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userName')
    setIsAuthenticated(false)
    setUserName('')
    setCurrentRoute('landing')
    setSelectedRoom(null)
  }

  const handleNavigate = (route: string) => {
    if (route === 'home' && !isAuthenticated) {
      setCurrentRoute('login')
    } else {
      setCurrentRoute(route)
    }
  }

  if (!isReady) return null

  if (currentRoute === 'landing') {
    return <LandingPage onNavigate={handleNavigate} />
  }

  if (currentRoute === 'login') {
    return <Login onLogin={() => { setIsAuthenticated(true); setUserName(localStorage.getItem('userName') || ''); setCurrentRoute('home') }} onSwitchToSignup={() => setCurrentRoute('signup')} />
  }

  if (currentRoute === 'signup') {
    return <Signup onSignup={() => { setIsAuthenticated(true); setUserName(localStorage.getItem('userName') || ''); setCurrentRoute('home') }} onSwitchToLogin={() => setCurrentRoute('login')} />
  }

  if (currentRoute === 'admin') {
    return <AdminPanel onBack={() => setCurrentRoute('home')} />
  }

  if (currentRoute === 'custom') {
    return <CustomUploadVisualizer onBack={() => setCurrentRoute('home')} onLogout={handleLogout} userName={userName} />
  }

  if (selectedRoom) {
    return <Visualizer room={selectedRoom} onBack={() => setSelectedRoom(null)} />
  }

  return <RoomSelect onSelect={setSelectedRoom} onCustomAI={() => setCurrentRoute('custom')} onAdmin={() => setCurrentRoute('admin')} onLogout={handleLogout} userName={userName} />
}

export default App
