// src/components/ProtectedRoute.js
// ─────────────────────────────────────────────────────────────
// Wraps pages that require login
// If not logged in → redirects to /login
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    // ↑ Auth state still being determined
    // Show nothing to prevent flash
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '14px'
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
    // ↑ Not logged in → redirect to login page
    // replace = don't add to browser history
    // so back button doesn't bring them back here
  }

  return children;
  // ↑ Logged in → show the actual page
}

export default ProtectedRoute;