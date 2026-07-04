import './App.css';
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login';
import Register from './pages/Register';
import Upload from './pages/Upload';
import Quiz from './pages/Quiz';
import Recommendations from './pages/Recommendations';
import TryOn from './pages/TryOn';
import Wardrobe from './pages/Wardrobe';

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='/upload' element={<Upload />} />
        <Route path='/quiz' element={<Quiz />} />
        <Route path='/recommendations' element={<Recommendations />} />
        <Route path='/tryon' element={<TryOn />} />
        <Route path='/wardrobe' element={<Wardrobe />} />
      </Routes>
    </Router>
  );
}

export default App;
