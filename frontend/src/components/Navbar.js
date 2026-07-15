import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

function Navbar() {

    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation;

    const isActive = (path) => location.pathname === path;

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <nav className="navbar-container">
      <Link to="/" className="navbar-brand">
         TryOn
      </Link>

      <div className="navbar-links">
        {user ? (
          <>
            <Link 
              to="/upload" 
              className={`nav-link ${isActive('/upload') ? 'active' : ''}`}
            >
              Upload
            </Link>
            <Link 
              to="/wardrobe" 
              className={`nav-link ${isActive('/wardrobe') ? 'active' : ''}`}
            >
              Wardrobe
            </Link>
            <span className="navbar-username">
              Hi, {user.username}
            </span>
            <button onClick={handleLogout} className="btn-danger">
              Logout
            </button>
          </>
        ) : (
          <>
            {/* <Link 
              to="/login" 
              className={`nav-link ${isActive('/login') ? 'active' : ''}`}
            >
              Login
            </Link>
            <Link to="/register" className="btn-primary">
              Sign Up
            </Link> */}
          </>
        )}
      </div>
    </nav>
    )
}

export default Navbar;