import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/recipes');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="48" height="48" aria-hidden="true">
              <rect x="12" y="18" width="8" height="11" rx="2" fill="#c8a064"/>
              <ellipse cx="16" cy="19.5" rx="12.5" ry="3.5" fill="#8b1a10"/>
              <path d="M3 19 A 13 17 0 0 1 29 19 Z" fill="#cc2b1a"/>
              <circle cx="11" cy="12" r="2.4" fill="white" opacity="0.92"/>
              <circle cx="20.5" cy="10.5" r="3" fill="white" opacity="0.92"/>
              <circle cx="16" cy="17" r="1.7" fill="white" opacity="0.92"/>
              <circle cx="6.5" cy="17" r="1.6" fill="white" opacity="0.92"/>
              <circle cx="25" cy="15.5" r="1.8" fill="white" opacity="0.92"/>
            </svg>
          </div>
          <h1 className="auth-title">Food of the Gods</h1>
          <p className="auth-subtitle">Sign in to your kitchen</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Enter your username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="auth-footer">
          Don't have an account? <Link to="/register">Request access</Link>
        </p>
      </div>
    </div>
  );
}
