import { useState } from 'react'
import { API_BASE_URL } from '../config'

export default function AdminSignup({ onSignup, onSwitchToLogin }: { onSignup: (user: any) => void, onSwitchToLogin: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { name, mobile, email, password, confirmPassword } = formData

    if (!name || !mobile || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Registration failed')
      
      onSignup(data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-extrabold text-slate-900">Create Admin Account</h2>
        <p className="mt-2 text-center text-sm text-slate-600">Register to manage your wall catalog</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-2xl border border-slate-100 sm:px-10">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100">{error}</div>}
            
            <div>
              <label className="block text-sm font-medium text-slate-700">Full Name</label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Mobile Number</label>
              <input type="tel" required value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address</label>
              <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input type="password" required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
              <input type="password" required value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="mt-1 block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

            <button type="submit" disabled={loading} className="w-full py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all">
              {loading ? 'Creating...' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account? <button onClick={onSwitchToLogin} className="font-bold text-indigo-600 hover:underline">Log in</button>
          </p>
        </div>
      </div>
    </div>
  )
}
