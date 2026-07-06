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

  const allSelected = Object.values(files).every(f => f !== null);

  const handleUpload = async () => {
    if (!allSelected) return;

    setError('');
    setLoading(true);

    try {
      // ── Build FormData ──
      const formData = new FormData();
      formData.append('front', files.front);
      formData.append('back',  files.back);
      formData.append('side',  files.side);
      // ↑ FormData is how you send files via HTTP
      // regular JSON can't carry binary file data
      // Django reads these with request.FILES['front'] etc

      // ── Send to Django ──
      const res = await API.post('body/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // ↑ Must tell axios this is a file upload
        // not regular JSON
      });

      // ── Save body_upload_id ──
      localStorage.setItem('body_upload_id', res.data.id);
      // ↑ We need this ID later when starting the try-on job
      // TryOnStartView needs: body_upload_id + clothing_item_id

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
      label: 'Front View',
      icon:  '🧍',
      hint:  'Stand straight, face the camera',
    },
    {
      key:   'back',
      label: 'Back View',
      icon:  '🧍‍♂️',
      hint:  'Turn around, stand straight',
    },
    {
      key:   'side',
      label: 'Side View',
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
            Upload full-body photos from all 3 angles for
            accurate body mapping. Good lighting recommended.
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

        {/* ── 4 Upload zones grid ── */}
        <div className="upload-grid">
          {VIEWS.map((view) => (
            <div
              key={view.key}
              className={`upload-zone ${files[view.key] ? 'filled' : ''}`}
              onClick={() =>
                document.getElementById(`input-${view.key}`).click()
              }
              // ↑ Clicking the whole zone triggers
              // the hidden file input
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
                // ── Image selected — show preview ──
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
                // ── No image — show placeholder ──
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
            {Object.values(files).filter(f => f !== null).length} of 3 photos selected
          </div>
          {/* ↑ counts how many files are not null */}
          <div className="upload-progress-bar">
            <div
              className="upload-progress-fill"
              style={{
                width: `${(Object.values(files).filter(f => f !== null).length / 3) * 100}%`
              }}
            />
          </div>
        </div>

        {/* ── Continue button ── */}
        <button
          className="upload-btn"
          onClick={handleUpload}
          disabled={!allSelected || loading}
          // ↑ disabled if not all 4 selected OR if loading
        >
          {loading ? (
            <span className="upload-btn-loading">
              <span className="spinner" /> Uploading...
            </span>
          ) : (
            allSelected
              ? 'Continue to Quiz →'
              : 'Select all 3 photos to continue'
          )}
          {/* ↑ Button text changes based on state:
              not all selected → tells user what to do
              all selected     → shows next step
              loading          → shows spinner
          */}
        </button>

      </div>
    </div>
  );
}

export default Upload;