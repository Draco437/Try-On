import React, { createContext, useState, useContext, useEffect } from "react";
import API from '../api/axios';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── On app start — check if already logged in ─────────────

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
            setUser(JSON.parse(savedUser));
            // ↑ User refreshed the page
            // Token exists → restore their session
            // No need to call API again
        }
        setLoading(false);
    }, []);

    // ── Register ──────────────────────────────────────────────
  const register = async (username, email, password) => {
    const res = await API.post('auth/register/', {
      username,
      email,
      password,
    });
    // ↑ Calls POST http://localhost:8000/api/auth/register/

    // Save tokens + user to localStorage
    localStorage.setItem('access_token',  res.data.tokens.access);
    localStorage.setItem('refresh_token', res.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(res.data.user));

    setUser(res.data.user);
    // ↑ Update global state → all components know user is logged in

    return res.data;
  };

  // ── Login ─────────────────────────────────────────────────
  const login = async (username, password) => {
    const res = await API.post('auth/login/', {
      username,
      password,
    });

    localStorage.setItem('access_token',  res.data.tokens.access);
    localStorage.setItem('refresh_token', res.data.tokens.refresh);
    localStorage.setItem('user', JSON.stringify(res.data.user));

    setUser(res.data.user);
    return res.data;
  };

  // ── Logout ────────────────────────────────────────────────
  const logout = async () => {
    try {
      const refresh = localStorage.getItem('refresh_token');
      await API.post('auth/logout/', { refresh });
      // ↑ Tell Django to blacklist this refresh token
    } catch (err) {
      // Even if API call fails, still log out locally
    }

    localStorage.clear();
    // ↑ Remove all tokens and user data from browser

    setUser(null);
    // ↑ Update global state → all components know user is logged out
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
      {/* 
        ↑ Everything inside <AuthProvider> can now access:
        - user       → current logged in user (or null)
        - loading    → is auth state being determined
        - register() → call to register
        - login()    → call to login
        - logout()   → call to logout
      */}
    </AuthContext.Provider>
  );
}

// Custom hook — use this in any component
export function useAuth() {
  return useContext(AuthContext);
  // ↑ Instead of:
  // import AuthContext from '...'
  // const auth = useContext(AuthContext)
  //
  // You just write:
  // const { user, login, logout } = useAuth()
}

export default AuthContext;