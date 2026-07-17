import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import '../styles/Upload.css';

function Upload() {

  const navigate = useNavigate();

  const [files, setFiles] = useState({
    front: null,
    back: null,
    side: null,
  });

  const [previews, setPreviews] = useState({
    front: null,
    back: null,
    side: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = (view, file) => {
    if (!file) return;

    setFiles(prev => ({
      ...prev,
      [view]: file,
    }));

    const previewURL = URL.createObjectURL(file);

    setPreviews(prev => ({
      ...prev,
      [view]: previewURL,
    }));
  }

  // ── Change: Only front image is strictly compulsory to proceed ──
  const allSelected = files.front !== null;

  const handleUpload = async () => {
    if (!allSelected) return;

    setError('');
    setLoading(true);

    try {
      // ── Build FormData ──
      const formData = new FormData();
      
      // Front is guaranteed to be there
      formData.append('front', files.front);
      
      // ── Change: Only append back and side views if they were chosen ──
      if (files.back) {
        formData.append('back', files.back);
      }
      if (files.side) {
        formData.append('side', files.side);
      }

      // ── Send to Django ──
      const res = await API.post('body/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // ── Save body_upload_id ──
      localStorage.setItem('body_upload_id', res.data.id);

      navigate('/quiz');

    } catch (err) {
      setError(
        err.response?.data?.error || 'Upload failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const VIEWS = [
    {
      key:   'front',
      label: 'Front View (Required)',
      icon:  '🧍',
      hint:  'Stand straight, face the camera',
    },
    {
      key:   'back',
      label: 'Back View (Optional)',
      icon:  '🧍‍♂️',
      hint:  'Turn around, stand straight',
    },
    {
      key:   'side',
      label: 'Side View (Optional)',
      icon:  '🚶',
      hint:  'Turn side ways, arms slightly out',
    },
  ];

  return (
    <div className="upload-page">

      {/* ── Floating background icons ── */}
      <div className="upload-bg-icons">
        {['👕','👗','👖','🧥','👔','🥻','🧣','👟'].map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="upload-container">

        {/* ── Header ── */}
        <div className="upload-header">
          <div className="upload-step-badge">Step 1 of 5</div>
          <h1 className="upload-title">Upload Your Photos</h1>
          <p className="upload-subtitle">
            Upload your front full-body photo. Side and back views are completely 
            optional but recommended for complete 360° mapping.
          </p>
        </div>

        {/* ── Tips bar ── */}
        <div className="upload-tips">
          <div className="upload-tip"><span>💡</span> Full body visible</div>
          <div className="upload-tip"><span>🌟</span> Good lighting</div>
          <div className="upload-tip"><span>👕</span> Fitted clothing</div>
          <div className="upload-tip"><span>📏</span> Stand straight</div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="upload-error">⚠️ {error}</div>
        )}

        {/* ── 3 Upload zones grid ── */}
        <div className="upload-grid">
          {VIEWS.map((view) => (
            <div
              key={view.key}
              className={`upload-zone ${files[view.key] ? 'filled' : ''}`}
              onClick={() =>
                document.getElementById(`input-${view.key}`).click()
              }
            >
              {/* Hidden file input */}
              <input
                type="file"
                id={`input-${view.key}`}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) =>
                  handleFileSelect(view.key, e.target.files[0])
                }
              />

              {/* Preview or placeholder */}
              {previews[view.key] ? (
                <div className="upload-preview">
                  <img
                    src={previews[view.key]}
                    alt={view.label}
                    className="upload-preview-img"
                  />
                  <div className="upload-preview-overlay">
                    <span>✓ Selected</span>
                    <small>Click to change</small>
                  </div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-zone-icon">{view.icon}</div>
                  <div className="upload-zone-label">{view.label}</div>
                  <div className="upload-zone-hint">{view.hint}</div>
                  <div className="upload-zone-btn">Choose Photo</div>
                </div>
              )}

            </div>
          ))}
        </div>

        {/* ── Progress indicator ── */}
        <div className="upload-progress">
          <div className="upload-progress-text">
            {files.front ? '✅ Front view ready' : '❌ Front view missing'} 
            {files.back && ' | ✓ Back view attached'} 
            {files.side && ' | ✓ Side view attached'}
          </div>
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{
                width: files.front ? `${(Object.values(files).filter(f => f !== null).length / 3) * 100}%` : '0%'
              }}
            />
          </div>
        </div>

        {/* ── Continue button ── */}
        <button
          className="upload-btn"
          onClick={handleUpload}
          disabled={!allSelected || loading}
        >
          {loading ? (
            <span className="upload-btn-loading">
              <span className="spinner" /> Uploading...
            </span>
          ) : (
            allSelected
              ? 'Share your Preferences →'
              : 'Upload a Front Photo to continue'
          )}
        </button>

      </div>
    </div>
  );
}

export default Upload;