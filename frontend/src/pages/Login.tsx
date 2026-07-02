import { useState } from 'react'
//import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
    const { signIn } = useAuth()
    const [email, setEmail] = useState('')
    const[sent,setSent] = useState(false)
    //const navigate = useNavigate()
    const[error,setError] = useState('')
    const [loading,setLoading] = useState(false)

    const handleSubmit = async () => {
        if(!email) return;
        setLoading(true);
        
        const{ error } = await signIn(email);
        if(error){
            setError(error.message);
            setLoading(false);
            return
        }
        setSent(true);
        setLoading(false)
    }
     if (sent) {
    return (
      <div>
        <h2>Check your email</h2>
        <p>We sent a magic link to {email}</p>
        <p>Click the link to sign in — no password needed.</p>
      </div>
    )
  }
   return (
    <div>
      <h1>ossAnalyser</h1>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
      />
      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Sending...' : 'Send magic link'}
      </button>
      {error && <p>{error}</p>}
    </div>
  )
    
}