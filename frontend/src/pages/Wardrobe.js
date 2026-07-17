import React, { useState, useEffect } from 'react';
import '../styles/Wardrobe.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Wardrobe() {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);
  
  // ── LIVE BACKEND URL DEFINITION ─────────────────────────────
  const BACKEND_URL = 'https://tryon-backend-azbd.onrender.com'; 

  useEffect(() => {
    const fetchCustomProducts = async () => {
      try {
        const token = localStorage.getItem('access_token'); 

        // FIX: Route updated to /api/products/ to match Django's URL routing prefix
        const response = await axios.get(`${BACKEND_URL}/api/products/`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const databaseItems = response.data.map(item => ({
          ...item,
          image: item.image_url || item.image 
        }));

        // Since the database safely stores both default seeds and custom items,
        // we can set state directly from the DB response to eliminate structural duplicates.
        setAllProducts(databaseItems);
      } catch (error) {
        console.error("Error fetching items from database:", error);
      }
    };

    fetchCustomProducts();
  }, []);

  const formatList = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(', ');
    return val.toString();
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Are you sure you want to remove this item?")) return;

    try {
      const token = localStorage.getItem('access_token');
      
      // FIX: URL path targeted to /api/products/ matching the updated API configuration
      await axios.delete(`${BACKEND_URL}/api/products/?id=${productId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // Update the UI state instantly without requiring a page reload
      setAllProducts(prev => prev.filter(p => p.id !== productId && p._id !== productId));
      alert("Product removed successfully!");
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Failed to delete product.");
    }
  };

  return (
    <div className="wardrobe-container">
      <h1 className="wardrobe-title">Wardrobe</h1>
      <div className='button-container'>
        <button className='add-custom-btn' onClick={() => navigate('/custom')}>Add Custom Products</button>
      </div>
      
      <div className="products-grid">
        {allProducts.map((product, index) => (
          <div key={product.id || product._id || `${product.name}-${index}`} className="product-card custom-product-card">

            {/* Structured container row keeping the button nested neatly inside the card */}
            {product && (
              <div className="delete-btn-container">
                <button 
                  onClick={() => handleDelete(product.id || product._id)}
                  className="delete-product-btn"
                  title="Remove product"
                >
                  🗑️
                </button>
              </div>
            )}

            <div className="product-image-wrapper">
              <img 
                src={product.image} 
                alt={product.name} 
                className="product-image" 
                onError={(e) => { e.target.src = 'https://via.placeholder.com/400x500?text=No+Image'; }}
              />
            </div>

            <div className="product-info">
              <div className="product-header">
                <h3 className="product-name">{product.name}</h3>
                <span className="product-price">₹{product.price}</span>
              </div>

              <div className="product-details-tags">
                <span className="detail-tag tag-gender">{product.gender}</span>
                <span className="detail-tag tag-type">{product.category || product.clothing}</span>
                <span className="detail-tag tag-size">Size: {formatList(product.size)}</span>
              </div>

              <div className="product-footer-details">
                <p>
                  <strong>Material:</strong> <span>{formatList(product.material)}</span>
                </p>
                <p>
                  <strong>Occasion:</strong> <span>{formatList(product.occasion)}</span>
                </p>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Wardrobe;