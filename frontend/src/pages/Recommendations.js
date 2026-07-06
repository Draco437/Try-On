import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Recommendations.css';
import products from '../data/products.json';

function filterProducts(answers) {

  if (!answers) return [];

  let filtered = products.filter(product => {

    const matchGender = product.gender === answers.gender;
    const matchCategory = product.category === answers.clothing;
    const matchSize = product.size.includes(answers.size);
    const matchMaterial =
      answers.material === 'any' ||
      product.material === answers.material;
    const matchOccasion = product.occasion.includes(answers.occasion);

    return matchGender && matchCategory && matchSize && matchMaterial && matchOccasion;
  });

  if (filtered.length === 0) {
    filtered = products.filter(product => 
      product.gender   === answers.gender &&
      product.category === answers.clothing
    );
  }

  if (filtered.length === 0) {
    filtered = products.filter(product =>
      product.category === answers.clothing
    );
  }

  return filtered;
}

function Recommendations() {

  const navigate = useNavigate();

  const [answers, setAnswers] = useState(null);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [noResults, setNoResults] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('quiz_answers');

    if (!saved) {
      navigate('/quiz');
      return;
    }

    const parsed = JSON.parse(saved);
    setAnswers(parsed);

    const results = filterProducts(parsed);
    setFiltered(results);

    if (results.length === 0) setNoResults(true);

  }, [navigate]);

  const handleSelect = (product) => {
    setSelected(product.id);
  }

  const removeSelect = () => {
    setSelected(null);
  }

  const handleTryOn = () => {
    if (!selected) return;

    const product = filtered.find(p => p.id === selected);
    localStorage.setItem('selected_product', JSON.stringify(product));
    navigate('/tryon');
  }

  const handleRetakeQuiz = () => {
    localStorage.removeItem('quiz_answers');
    navigate('/quiz');
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
              <span className="rec-filter-tag">{answers.gender === 'M' ? '👨 Male' : answers.gender === 'F' ? '👩 Female' : '🧑 Other'}</span>
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
                  key={product.id}
                  className={`rec-card ${selected === product.id ? 'selected' : ''}`}
                  onClick={() => handleSelect(product)}
                >
                  {/* ── Selected checkmark ── */}
                  {selected === product.id && (
                    <div className="rec-card-check">✓</div>
                  )}

                  {/* ── Product image ── */}
                  <div className="rec-card-img-wrap">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="rec-card-img"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x500?text=No+Image';
                        // ↑ Fallback if image fails to load
                      }}
                    />
                  </div>

                  {/* ── Product info ── */}
                  <div className="rec-card-info">
                    <div className="rec-card-name">{product.name}</div>

                    <div className="rec-card-tags">
                      <span className="rec-tag">{product.material}</span>
                      <span className="rec-tag">{product.color}</span>
                    </div>

                    <div className="rec-card-bottom">
                      <div className="rec-card-price">
                        ₹{product.price.toLocaleString()}
                      </div>
                      <div className="rec-card-rating">
                        ⭐ {product.rating}
                      </div>
                    </div>
                  </div>

                </div>
              ))}
            </div>

            {/* ── Try On button ── */}
            <div className="rec-action">
              <button className="rec-btn-tryon" onClick={handleTryOn} disabled={!selected}>
                {selected
                  ? '✨ Try This On →'
                  : 'Select a product to try on'}
              </button>
            </div>
            <div className="rec-action1">
              <button className="rec-btn-tryon1" onClick={removeSelect} disabled={!selected}>
                {selected
                  ? 'Unselect →'
                  : 'Nothing selected yet'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default Recommendations;