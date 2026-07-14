import './App.css';
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login';
import Register from './pages/Register';
import Upload from './pages/Upload';
import Quiz from './pages/Quiz';
import Recommendations from './pages/Recommendations';
import TryOn from './pages/TryOn';

function App() {
  return (
    <AuthProvider>
      
      {/* 
        ↑ Wraps entire app so every page
        can call useAuth() to get user/login/logout
      */}

    <Router>
      <Navbar />
      <Routes>
        {/* Public routes — anyone can visit */}
        <Route path='/' element={<Home />} />
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />

        {/* Protected routes — must be logged in */}
        <Route path='/upload' element={<ProtectedRoute><Upload /></ProtectedRoute>} />
        <Route path='/quiz' element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
        <Route path='/recommendations' element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
        <Route path='/tryon' element={<ProtectedRoute><TryOn /></ProtectedRoute>} />
      </Routes>
    </Router>
    </AuthProvider>
  );
}

export default App;
