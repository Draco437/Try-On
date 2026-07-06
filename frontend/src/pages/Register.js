import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Register.css';

const BG_ICONS = ['👗','👕','👖','🧥','👔','🥻','🧣','👒','👟','🧤'];

function getPasswordStrength(password) {
  // Returns: { level: 0/1/2/3, label: string }
  // 0 = empty, 1 = weak, 2 = medium, 3 = strong

  if (!password) return { level: 0, label: '' };

  let score = 0;
  if (password.length >= 8)               score++;
  // ↑ At least 8 characters
  if (/[A-Z]/.test(password))             score++;
  // ↑ Has uppercase letter
  if (/[0-9]/.test(password))             score++;
  // ↑ Has a number
  if (/[^A-Za-z0-9]/.test(password))      score++;
  // ↑ Has special character

  if (score <= 1) return { level: 1, label: 'Weak' };
  if (score === 2) return { level: 2, label: 'Medium' };
  return { level: 3, label: 'Strong' };
}

function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();

  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !email.trim() || !password || !confirm) {
      setError('Please fill in all fields');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
      // ↑ Basic email format check
      // \S+ = one or more non-whitespace chars
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await register(username.trim(), email.trim(), password);
      navigate('/upload');

    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.username?.[0] ||
        err.response?.data?.email?.[0] ||
        'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderStrengthBars = () => {
    const bars = [1, 2, 3];
    const classMap = { 1: 'weak', 2: 'medium', 3: 'strong' };

    return bars.map((bar) => (
      <div
        key={bar}
        className={`strength-bar ${
          strength.level >= bar ? classMap[strength.level] : ''
        }`}
      />
    ));
  };

  return (
    <div className="register-page">

      <div className="register-bg-icons">
        {BG_ICONS.map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="register-card">

        {/* Brand */}
        <div className="register-brand">
          <span className="register-brand-icon">👖</span>
          <div className="register-brand-name">TryOn</div>
          <div className="register-brand-tag">Virtual Try-On Platform</div>
        </div>

        <div className="register-divider" />

        <h2 className="register-title">Create your account</h2>
        <p className="register-subtitle">
          Start trying on outfits with AI in seconds
        </p>

        {/* Error */}
        {error && (
          <div className="register-error">
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>

          {/* Username */}
          <div className="register-field">
            <label className="register-label">Username</label>
            <input
              type="text"
              className="register-input"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          {/* Email */}
          <div className="register-field">
            <label className="register-label">Email</label>
            <input
              type="email"
              className="register-input"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="register-field">
            <label className="register-label">Password</label>
            <input
              type="password"
              className="register-input"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            {/* Password strength indicator */}
            {password && (
              <>
                <div className="password-strength">
                  {renderStrengthBars()}
                </div>
                <div className="strength-label">
                  {strength.label} password
                </div>
              </>
            )}
          </div>

          {/* Confirm password */}
          <div className="register-field">
            <label className="register-label">Confirm Password</label>
            <input
              type="password"
              className="register-input"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={{
                borderColor: confirm && confirm !== password
                  ? 'rgba(248,113,113,0.5)'
                  : undefined,
                // ↑ Red border if passwords don't match yet
              }}
            />
          </div>

          <button
            type="submit"
            className="register-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Creating account...
              </>
            ) : (
              'Create Account →'
            )}
          </button>

        </form>

        {/* Switch to login */}
        <div className="register-switch">
          Already have an account?{' '}
          <Link to="/login">Login here</Link>
        </div>

      </div>
    </div>
  );
}

export default Register;