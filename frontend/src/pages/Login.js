import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Login.css'

const BG_ICONS = ['👕','👗','👖','🧥','👔','🥻','🧣','👒','👟','🧤'];

function Login() {

  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
    await login(username.trim(), password);
    navigate('/');
  } catch(err) {
    const msg = err.response?.data?.error || 'Login failed. Please try again.';
    setError(msg);
  } finally {
    setLoading(false);
  }
  }

  return (
    <div className="login-page">

      <div className="login-bg-icons">
        {BG_ICONS.map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="login-card">

        <div className="login-brand">
          <span className="login-brand-icon">👕</span>
          <div className="login-brand-name">TryOn</div>
          <div className="login-brand-tag">Virtual Try-On Platform</div>
        </div>

        <div className="login-divider" />

        <h2 className="login-title">Welcome back</h2>
        <p className="login-subtitle">
          Login to try on your favourite outfits
        </p>

        {error && (
          <div className="login-error">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="login-field">
            <label className="login-label">Username</label>
            <input
              type="text"
              className="login-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              type="password"
              className="login-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-btn-loading">
                <span className="spinner" />
                Logging in...
              </span>
            ) : (
              'Login →'
            )}
          </button>

        </form>

        <div className="login-switch">
          Don't have an account?{' '}
          <Link to="/register">Create one free</Link>
        </div>

      </div>

    </div>
  );
}
export default Login;