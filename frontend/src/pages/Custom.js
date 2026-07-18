import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Custom.css';
import API from '../api/axios';
// ↑ Use the central axios instance that already has
// the correct base URL and JWT token attached
// instead of raw axios with hardcoded localhost

function CustomProductForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name:     '',
    image:    '',
    price:    '',
    gender:   'M',
    clothing: 'shirt',
    size:     'M',
    material: 'cotton',
    occasion: []
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => {
      const occasions = [...prev.occasion];
      if (checked) {
        occasions.push(value);
      } else {
        const idx = occasions.indexOf(value);
        if (idx > -1) occasions.splice(idx, 1);
      }
      return { ...prev, occasion: occasions };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.image) {
      setError('Please provide an image URL.');
      return;
    }

    if (formData.occasion.length === 0) {
      setError('Please select at least one occasion.');
      return;
    }

    setLoading(true);

    // Build payload matching what backend expects
    const payload = {
      name:     formData.name.trim(),
      image:    formData.image.trim(),
      price:    Number(formData.price) || 0,
      gender:   formData.gender,
      clothing: formData.clothing,
      size:     formData.size,
      material: formData.material,
      occasion: formData.occasion,
      // ↑ Send as array — views.py handles both array and string
    };

    try {
      // ── Use API instance (not raw axios) ──────────────
      // API already has:
      // baseURL = REACT_APP_API_URL (production) or localhost:8000 (dev)
      // Authorization: Bearer <token> header attached automatically
      const response = await API.post('products/', payload);

      if (response.status === 201) {
        alert('Product added successfully!');
        navigate('/recommendations');
        // ↑ Go to recommendations so user can immediately try it on
        // instead of wardrobe which shows try-on history
      }

    } catch (err) {
      console.error('Error adding product:', err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Failed to add product. Please try again.';
      setError(msg);
      // ↑ Show specific error from backend instead of generic alert
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wardrobe-container">
      <h1 className="wardrobe-title">Add Custom Product</h1>

      {/* Error message */}
      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.1)',
          border:     '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px',
          padding:    '12px 16px',
          marginBottom: '20px',
          color:      '#f87171',
          fontSize:   '14px',
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="custom-form-layout">

        <div className="form-group">
          <label>Name of Product</label>
          <input
            required
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Graphic Summer Tee"
          />
        </div>

        <div className="form-group">
          <label>Image URL</label>
          <input
            required
            type="text"
            name="image"
            value={formData.image}
            onChange={handleChange}
            placeholder="https://example.com/product-image.jpg"
          />
          {/* Show preview if URL entered */}
          {formData.image && (
            <img
              src={formData.image}
              alt="preview"
              style={{
                marginTop:    '8px',
                width:        '80px',
                height:       '100px',
                objectFit:    'cover',
                borderRadius: '6px',
                border:       '1px solid rgba(255,255,255,0.1)',
              }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>

        <div className="form-group">
          <label>Price (₹)</label>
          <input
            required
            type="number"
            name="price"
            value={formData.price}
            onChange={handleChange}
            placeholder="499"
            min="0"
          />
        </div>

        <div className="form-group">
          <label>Gender</label>
          <select name="gender" value={formData.gender} onChange={handleChange}>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="O">O</option>
          </select>
        </div>

        <div className="form-group">
          <label>Clothing (Category)</label>
          <select name="clothing" value={formData.clothing} onChange={handleChange}>
            <option value="tshirt">T-Shirt</option>
            <option value="shirt">Shirt</option>
            <option value="jeans">Jeans</option>
            <option value="pants">Pants</option>
            <option value="dress">Dress</option>
            <option value="jacket">Jacket</option>
          </select>
        </div>

        <div className="form-group">
          <label>Size</label>
          <select name="size" value={formData.size} onChange={handleChange}>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
          </select>
        </div>

        <div className="form-group">
          <label>Material</label>
          <select name="material" value={formData.material} onChange={handleChange}>
            <option value="cotton">Cotton</option>
            <option value="polyester">Polyester</option>
            <option value="denim">Denim</option>
            <option value="linen">Linen</option>
            <option value="silk">Silk</option>
            <option value="any">Any</option>
          </select>
        </div>

        <div className="form-group">
          <label>Occasions (Select all that apply)</label>
          <div className="checkbox-group">
            {['casual', 'formal', 'sport', 'party', 'outdoor'].map(occ => (
              <label key={occ} className="checkbox-label">
                <input
                  type="checkbox"
                  value={occ}
                  checked={formData.occasion.includes(occ)}
                  onChange={handleCheckboxChange}
                />
                <span>{occ.charAt(0).toUpperCase() + occ.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="submit-form-btn"
          disabled={loading}
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Adding...' : 'ADD PRODUCT'}
        </button>

      </form>
    </div>
  );
}

export default CustomProductForm;