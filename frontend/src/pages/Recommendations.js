import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // 1. Added axios import
import '../styles/Recommendations.css';

// 2. Cleaned up filterProducts to expect the dynamic product catalog array from the backend
function filterProducts(answers, productsCatalog) {
  if (!answers || !productsCatalog || productsCatalog.length === 0) return [];

  // 1. Force lowercase across all user answers for safety
  const ansGender = (answers.gender || '').toLowerCase();
  const ansClothing = (answers.clothing || '').toLowerCase().replace('-', ''); // matches 't-shirt' to 'tshirt'
  const ansSize = (answers.size || '').toLowerCase();
  const ansMaterial = (answers.material || '').toLowerCase();
  const ansOccasion = (answers.occasion || '').toLowerCase();

  let filtered = productsCatalog.filter(product => {
    // 2. Safely capture database keys and cast to lowercase strings
    const prodGender = (product.gender || '').toLowerCase();
    
    const rawCategory = product.category || product.clothing || '';
    const prodCategory = rawCategory.toLowerCase().replace('-', '');

    const prodMaterial = (product.material || '').toLowerCase();

    // 3. Handle Size checking (String vs Array safely)
    let matchSize = false;
    if (Array.isArray(product.size)) {
      matchSize = product.size.map(s => String(s).toLowerCase()).includes(ansSize);
    } else {
      matchSize = String(product.size || '').toLowerCase() === ansSize;
    }

    // 4. Handle Occasion tracking ("casual, party" vs ["casual", "party"])
    let matchOccasion = false;
    if (Array.isArray(product.occasion)) {
      matchOccasion = product.occasion.map(o => String(o).toLowerCase()).includes(ansOccasion);
    } else {
      // Safely check if the string contains the quiz value substring
      matchOccasion = String(product.occasion || '').toLowerCase().includes(ansOccasion);
    }

    // 5. Build match matrices
    const matchGender = prodGender === ansGender;
    const matchCategory = prodCategory === ansClothing;
    const matchMaterial = ansMaterial === 'any' || prodMaterial === ansMaterial;

    return matchGender && matchCategory && matchSize && matchMaterial && matchOccasion;
  });

  // --- Cascading Fallbacks If Filter Criteria is Too Tight ---
  
  // Fallback 1: Drop occasion/material constraint, retain core layout matching
  if (filtered.length === 0) {
    filtered = productsCatalog.filter(product => {
      const prodGender = (product.gender || '').toLowerCase();
      const prodCategory = (product.category || product.clothing || '').toLowerCase().replace('-', '');
      
      let matchSize = false;
      if (Array.isArray(product.size)) {
        matchSize = product.size.map(s => String(s).toLowerCase()).includes(ansSize);
      } else {
        matchSize = String(product.size || '').toLowerCase() === ansSize;
      }

      return prodGender === ansGender && prodCategory === ansClothing && matchSize;
    });
  }

  // Fallback 2: Drop everything except basic type categorization
  if (filtered.length === 0) {
    filtered = productsCatalog.filter(product => {
      const prodCategory = (product.category || product.clothing || '').toLowerCase().replace('-', '');
      return prodCategory === ansClothing;
    });
  }

  return filtered;
}

function Recommendations() {
  const navigate = useNavigate();

  const [answers, setAnswers] = useState(null);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [noResults, setNoResults] = useState(false);
  const [loading, setLoading] = useState(true); // 3. Added loading state

  useEffect(() => {
    const fetchCatalogAndFilter = async () => {
      // Check for saved quiz parameters
      const saved = localStorage.getItem('quiz_answers');
      if (!saved) {
        navigate('/quiz');
        return;
      }

      const parsedAnswers = JSON.parse(saved);
      setAnswers(parsedAnswers);

      try {
        // 4. Hit the new endpoint we added to Django backend!
        const token = localStorage.getItem('access_token'); // Ensure your token matches your auth key name
        const response = await axios.get('http://localhost:8000/api/products/', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const productsCatalog = response.data; // Expecting the array from ProductCreateListView
        
        // 5. Pass database values through the filter logic
        const results = filterProducts(parsedAnswers, productsCatalog);
        setFiltered(results);

        if (results.length === 0) {
          setNoResults(true);
        } else {
          setNoResults(false);
        }
      } catch (error) {
        console.error("Error connecting to catalog service:", error);
        // Fallback banner if backend is unreachable during your tests
        setNoResults(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCatalogAndFilter();
  }, [navigate]);

  const handleSelect = (product) => {
    // Fall back to MongoDB _id if standard id is missing
    setSelected(product.id || product._id);
  };

  const removeSelect = () => {
    setSelected(null);
  };

  const handleTryOn = () => {
    if (!selected) return;

    // Check both unique identifier names
    const product = filtered.find(p => (p.id === selected || p._id === selected));
    localStorage.setItem('selected_product', JSON.stringify(product));
    navigate('/tryon');
  };

  const handleRetakeQuiz = () => {
    localStorage.removeItem('quiz_answers');
    navigate('/quiz');
  };

  // Render full screen loader while backend serves the dataset
  if (loading) {
    return (
      <div className="rec-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#fff' }}>
        <h3>Loading your custom recommendations...</h3>
      </div>
    );
  }

  return (
    <div className="rec-page">
      {/* ── Background icons ── */}
      <div className="rec-bg-icons">
        {['👕','👗','👖','🧥','👔','🥻','🧣','👟'].map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="rec-container">
        {/* ── Header ── */}
        <div className="rec-header">
          <div className="rec-step-badge">Step 3 of 5</div>
          <h1 className="rec-title">Your Recommendations</h1>
          <p className="rec-subtitle">
            Based on your preferences — select one to try on
          </p>

          {/* ── Active filters shown to user ── */}
          {answers && (
            <div className="rec-filters">
              <span className="rec-filter-tag">
                {answers.gender === 'M' ? '👨 Male' : answers.gender === 'F' ? '👩 Female' : '🧑 Other'}
              </span>
              <span className="rec-filter-tag">👕 {answers.clothing}</span>
              <span className="rec-filter-tag">📏 {answers.size}</span>
              <span className="rec-filter-tag">🌿 {answers.material}</span>
              <span className="rec-filter-tag">😊 {answers.occasion}</span>
              <button className="rec-retake" onClick={handleRetakeQuiz}>
                ↩ Retake Quiz
              </button>
            </div>
          )}
        </div>

        {/* ── No results state ── */}
        {noResults ? (
          <div className="rec-empty">
            <div className="rec-empty-icon">🔍</div>
            <h3>No exact matches found</h3>
            <p>Try changing your size or material preference</p>
            <button className="rec-btn-retake" onClick={handleRetakeQuiz}>
              Retake Quiz
            </button>
          </div>
        ) : (
          <>
            {/* ── Results count ── */}
            <p className="rec-count">
              {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
            </p>

            {/* ── Products grid ── */}
            <div className="rec-grid">
              {filtered.map(product => (
                <div
                  key={product.id || product._id}
                  className={`rec-card ${selected === (product.id || product._id) ? 'selected' : ''}`}
                  onClick={() => handleSelect(product)}
                >
                  {/* ── Selected checkmark ── */}
                  {selected === (product.id || product._id) && (
                    <div className="rec-card-check">✓</div>
                  )}

                  {/* ── Product image ── */}
                  <div className="rec-card-img-wrap">
                    <img
                      src={product.image_url || product.image} // Fallback support for database image schemas
                      alt={product.name}
                      className="rec-card-img"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x500?text=No+Image';
                      }}
                    />
                  </div>

                  {/* ── Product info ── */}
                  <div className="rec-card-info">
                    <div className="rec-card-name">{product.name}</div>

                    <div className="rec-card-tags">
                      <span className="rec-tag">{product.material || 'Standard'}</span>
                      <span className="rec-tag">{product.color || 'Multi'}</span>
                    </div>

                    <div className="rec-card-bottom">
                      <div className="rec-card-price">
                        ₹{(product.price || 0).toLocaleString()}
                      </div>
                      <div className="rec-card-rating">
                        ⭐ {product.rating || '4.5'}
                      </div>
                    </div>
                  </div>

                </div>
              ))}
            </div>

            {/* ── Try On buttons ── */}
            <div className="rec-action">
              <button className="rec-btn-tryon" onClick={handleTryOn} disabled={!selected}>
                {selected ? '✨ Try This On →' : 'Select a product to try on'}
              </button>
            </div>
            <div className="rec-action1">
              <button className="rec-btn-tryon1" onClick={removeSelect} disabled={!selected}>
                {selected ? 'Unselect →' : 'Nothing selected yet'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default Recommendations;