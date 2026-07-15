import React from 'react';
import '../styles/Wardrobe.css';
import products from '../data/products.json';

function Wardrobe() {
  // Helper function to safely format fields that might be arrays or mashed strings
  const formatList = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(', ');
    
    // If it's a string like "casualoutdoor", split it by common keywords or let it be
    // Best practice: ensure your JSON uses spaces like "casual, outdoor" 
    return val.toString();
  };

  return (
    <div className="wardrobe-container">
      <h1 className="wardrobe-title">Wardrobe</h1>
      
      <div className="products-grid">
        {products.map((product) => (
          <div key={product.id || product.name} className="product-card">
            
            {/* Image */}
            <div className="product-image-wrapper">
              <img 
                src={product.image} 
                alt={product.name} 
                className="product-image" 
              />
            </div>

            {/* Details */}
            <div className="product-info">
              <div className="product-header">
                <h3 className="product-name">{product.name}</h3>
                <span className="product-price">${product.price}</span>
              </div>

              {/* Badges Layout with better contrast */}
              <div className="product-details-tags">
                <span className="detail-tag tag-gender">{product.gender}</span>
                <span className="detail-tag tag-type">{product.category}</span>
                <span className="detail-tag tag-size">Size: {formatList(product.size)}</span>
              </div>

              {/* Footnotes with clean spacings */}
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