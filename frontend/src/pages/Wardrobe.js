import React, { useState, useEffect } from 'react';
import '../styles/Wardrobe.css';
import initialProducts from '../data/products.json';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Wardrobe() {
  const navigate = useNavigate();
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    const fetchCustomProducts = async () => {
      try {
        // 1. Get the JWT authentication token from storage
        const token = localStorage.getItem('access_token'); 

        // 2. Fetch the custom uploaded items from your Django database
        const response = await axios.get('http://localhost:8000/api/products/', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        // 3. Merge your local static JSON catalog with your active database records
        const customItems = response.data.map(item => ({
          ...item,
          image: item.image_url || item.image 
        }));

        setAllProducts([...initialProducts, ...customItems]);
      } catch (error) {
        console.error("Error fetching items from database:", error);
        setAllProducts(initialProducts);
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
      
      await axios.delete(`http://localhost:8000/api/products/?id=${productId}`, {
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