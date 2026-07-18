import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Custom.css';
import axios from 'axios';

function CustomProductForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    image: '',
    price: '',
    gender: 'M',
    clothing: 'shirt',
    size: 'M',
    material: 'cotton',
    occasion: []
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e) => {
    const { value, checked } = e.target;
    setFormData((prev) => {
      const currentOccasions = [...prev.occasion];
      if (checked) {
        currentOccasions.push(value);
      } else {
        const index = currentOccasions.indexOf(value);
        if (index > -1) currentOccasions.splice(index, 1);
      }
      return { ...prev, occasion: currentOccasions };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.image) {
      alert("Please upload an image first.");
      return;
    }

    const token = localStorage.getItem('access_token'); 

    // ── THE ULTIMATE MATCH FOR YOUR VIEWS.PY EXTRACTION ──
    const payload = {
      name: formData.name,
      price: Number(formData.price) || 0,
      gender: formData.gender,
      size: formData.size,
      material: formData.material,
      
      // 1. views.py does: request.data.get('clothing', '')
      clothing: formData.clothing, 
      
      // 2. views.py does: request.data.get('image', '')
      image: formData.image,   
      
      // 3. views.py does: request.data.get('occasion', '') and maps arrays/strings smoothly
      occasion: formData.occasion 
    };

    const BACKEND_URL = 'https://tryon-backend-azbd.onrender.com';

    try {
      const response = await axios.post(`${BACKEND_URL}/products/`, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 201 || response.status === 200) {
        alert("Product added successfully to database!");
        navigate('/wardrobe'); 
      }
    } catch (error) {
      console.error("Error uploading custom product to MongoDB:", error);
      if (error.response && error.response.data) {
        console.error("Backend validation error details:", error.response.data);
      }
      alert("Failed to add product to database.");
    }
  };

  return (
    <div className="wardrobe-container">
      <h1 className="wardrobe-title">Add Custom Product</h1>
      
      <form onSubmit={handleSubmit} className="custom-form-layout">
        <div className="form-group">
          <label>Name of Product</label>
          <input required type="text" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Graphic Summer Tee" />
        </div>

        <div className="form-group">
          <label>Image URL</label>
          <input required type="text" name="image" value={formData.image} onChange={handleChange} placeholder="https://example.com/image.jpg" />
        </div>

        <div className="form-group">
          <label>Price (₹)</label>
          <input required type="number" name="price" value={formData.price} onChange={handleChange} placeholder="499" />
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
            <option value="shirt">shirt</option>
            <option value="t-shirt">t-shirt</option>
            <option value="jeans">jeans</option>
            <option value="pants">pants</option>
            <option value="dress">dress</option>
            <option value="jacket">jacket</option>
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
            <option value="cotton">cotton</option>
            <option value="polyester">polyester</option>
            <option value="denim">denim</option>
            <option value="linen">linen</option>
            <option value="silk">silk</option>
          </select>
        </div>

        <div className="form-group">
          <label>Occasions (Select all that apply)</label>
          <div className="checkbox-group">
            {['casual', 'formal', 'sport', 'party', 'outdoor'].map((occ) => (
              <label key={occ} className="checkbox-label">
                <input
                  type="checkbox"
                  value={occ}
                  checked={formData.occasion.includes(occ)}
                  onChange={handleCheckboxChange}
                />
                <span>{occ}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="submit-form-btn">ADD PRODUCT</button>
      </form>
    </div>
  );
}

export default CustomProductForm;