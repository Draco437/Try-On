import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import '../styles/TryOn.css';

function TryOn() {
  const navigate  = useNavigate();
  const pollRef   = useRef(null);

  const [product,      setProduct]      = useState(null);
  const [bodyUploadId, setBodyUploadId] = useState(null);

  const [,    setJobId]   = useState(null);
  const [status,      setStatus]      = useState('idle');
  const [activeStage, setActiveStage] = useState(-1);

  const [results,      setResults]      = useState(null);
  const [currentView,  setCurrentView]  = useState('front');
  const [error, setError] = useState('');

  useEffect(() => {
    const savedProduct = localStorage.getItem('selected_product');
    const savedBodyId = localStorage.getItem('body_upload_id');

    if (!savedProduct) {
      navigate('/recommendations');
      return;
    }

    if (!savedBodyId) {
      navigate('/upload');
      return;
    }

    localStorage.removeItem('tryon_job_id');

    setProduct(JSON.parse(savedProduct));
    setBodyUploadId(savedBodyId);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [navigate]);

  const STAGES = [
    {
      key:   'segment',
      icon:  '✂️',
      label: 'Body Segmentation',
      desc:  'SAM isolating body from background',
    },
    {
      key:   'pose',
      icon:  '🦴',
      label: 'Pose Estimation',
      desc:  'OpenPose detecting 18 keypoints',
    },
    {
      key:   'warp',
      icon:  '🔄',
      label: 'Garment Warping',
      desc:  'TPS fitting garment to your pose',
    },
    {
      key:   'blend',
      icon:  '🎨',
      label: 'Final Blending',
      desc:  'OpenCV compositing the result',
    },
  ];

  // Strictly kept to front, back, side as requested
  const VIEWS = ['front', 'back', 'side'];
  
  const handleStart = async () => {
    if (!product) return;

    const currentBodyId = bodyUploadId || localStorage.getItem('body_upload_id');
    const currentItemId = product._id || product.id;

    if (!currentBodyId || !currentItemId) {
      setError('Missing data. Please re-upload photos.');
      return;
    }

    // ── Full reset ──
    if (pollRef.current) clearInterval(pollRef.current);
    setError('');
    setStatus('pending');
    setActiveStage(0);
    setResults(null);
    setCurrentView('front');
    localStorage.removeItem('current_job_id');

    try {
      const res = await API.post('tryon/start/', {
        body_upload_id:   currentBodyId,
        clothing_item_id: currentItemId,
      });

      const newJobId = res.data.job_id;
      setJobId(newJobId);
      localStorage.setItem('current_job_id', newJobId);
      setStatus('processing');
      startPolling(newJobId);

    } catch (err) {
      setStatus('failed');
      setError(err.response?.data?.error || 'Failed to start. Try again.');
    }
};

  const startPolling = (id) => {
    // Clear any existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    // Animate pipeline stages
    let stageTimer = 0;
    const stageDurations = [8000, 8000, 10000, 8000];
    // ↑ longer durations — Leffa takes 60-120s total
    const stageTimerIds = [];

    stageDurations.forEach((duration, index) => {
      stageTimer += duration;
      const tid = setTimeout(() => {
        setActiveStage(prev => Math.max(prev, index + 1));
      }, stageTimer);
      stageTimerIds.push(tid);
    });

    let pollFailCount = 0;
    const MAX_POLL_FAILS = 5;
    const MAX_POLL_TIME  = 10 * 60 * 1000; // 10 minutes max
    const pollStart      = Date.now();

    pollRef.current = setInterval(async () => {

      // Timeout guard — stop after 10 minutes
      if (Date.now() - pollStart > MAX_POLL_TIME) {
        clearInterval(pollRef.current);
        stageTimerIds.forEach(t => clearTimeout(t));
        setStatus('failed');
        setError('Processing timed out after 10 minutes. Please try again.');
        return;
      }

      try {
        const res = await API.get(`tryon/status/${id}/`);
        const job = res.data;
        pollFailCount = 0; // reset on success

        if (job.status === 'done') {
          clearInterval(pollRef.current);
          stageTimerIds.forEach(t => clearTimeout(t));
          setStatus('done');
          setActiveStage(4);
          setResults({
            front:    job.front_result,
            back:     job.back_result,
            side:     job.side_result,
            score:    job.style_score,
            feedback: job.style_feedback,
          });
          // ── Clear job from localStorage when done ──
          localStorage.removeItem('current_job_id');
        }

        if (job.status === 'failed') {
          clearInterval(pollRef.current);
          stageTimerIds.forEach(t => clearTimeout(t));
          setStatus('failed');
          setError(job.error || 'ML pipeline failed. Please try again.');
          localStorage.removeItem('current_job_id');
        }

      } catch (err) {
        pollFailCount++;
        console.warn(`Poll error ${pollFailCount}/${MAX_POLL_FAILS}:`, err.message);

        // Only fail after 5 consecutive network errors
        if (pollFailCount >= MAX_POLL_FAILS) {
          clearInterval(pollRef.current);
          stageTimerIds.forEach(t => clearTimeout(t));
          setStatus('failed');
          setError('Lost connection to server. Please try again.');
        }
        // Otherwise keep polling — temporary network hiccup
      }
    }, 3000); // poll every 3 seconds
};

  return (
    <div className="tryon-page">
      <div className="tryon-bg-icons">
        {['👕','👗','👖','🧥','👔','🥻','🧣','👟'].map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="tryon-container">
        {status === 'idle' && product && (
          <div className="tryon-idle">
            <div className="tryon-step-badge">Step 4 of 5</div>
            <h1 className="tryon-title">Ready to Try On</h1>
            <p className="tryon-subtitle">
              We'll run the AI pipeline on all 3 of your photos
            </p>

            <div className="tryon-product-card">
              <img
                src={product.image}
                alt={product.name}
                className="tryon-product-img"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/200x260?text=Product';
                }}
              />
              <div className="tryon-product-info">
                <div className="tryon-product-name">{product.name}</div>
                <div className="tryon-product-tags">
                  <span className="tryon-tag">{product.material}</span>
                  <span className="tryon-tag">{product.color}</span>
                  <span className="tryon-tag">{product.category}</span>
                </div>
                <div className="tryon-product-price">
                  ₹{product.price?.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="tryon-pipeline-preview">
              {STAGES.map((stage, i) => (
                <div key={i} className="tryon-pipeline-item">
                  <div className="tryon-pipeline-icon">{stage.icon}</div>
                  <div>
                    <div className="tryon-pipeline-label">{stage.label}</div>
                    <div className="tryon-pipeline-desc">{stage.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="tryon-error">⚠️ {error}</div>}

            <button className="tryon-start-btn" onClick={handleStart}>
              ✨ Start Try On — All 3 Views
            </button>

            <button className="tryon-back-btn" onClick={() => navigate('/recommendations')}>
              ← Choose Different Item
            </button>
          </div>
        )}

        {(status === 'pending' || status === 'processing') && (
          <div className="tryon-processing">
            <div className="tryon-step-badge">Processing</div>
            <h1 className="tryon-title">Running AI Pipeline</h1>
            <p className="tryon-subtitle">
              Processing all 3 views — this will take a few minutes
            </p>

            <div className="tryon-stages">
              {STAGES.map((stage, i) => (
                <div
                  key={i}
                  className={`tryon-stage ${
                    activeStage > i  ? 'done'    :
                    activeStage === i ? 'active' : ''
                  }`}>

                  {i > 0 && (
                    <div className={`tryon-stage-line ${activeStage > i ? 'done' : ''}`} />
                  )}

                  <div className="tryon-stage-dot">
                    {activeStage > i ? '✓' : stage.icon}
                  </div>
                  <div className="tryon-stage-label">{stage.label}</div>
                  <div className="tryon-stage-desc">
                    {activeStage > i   ? 'Complete'      :
                     activeStage === i ? stage.desc      :
                     'Waiting...'}
                  </div>
                </div>
              ))}
            </div>

            <div className="tryon-progress-bar">
              <div
                className="tryon-progress-fill"
                style={{
                  width: `${Math.min((activeStage / STAGES.length) * 100, 95)}%`
                }}/>
            </div>
            <div className="tryon-progress-text">
              Processing {currentView} view...
            </div>

            <div className="tryon-views-progress">
              {VIEWS.map((view) => (
                <div key={view} className="tryon-view-chip">
                  <span className="tryon-view-spinner" />
                  {view}
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'done' && results && (
          <div className="tryon-results">
            <div className="tryon-step-badge">Step 5 of 5</div>
            <h1 className="tryon-title">Your Try-On Result</h1>
            <p className="tryon-subtitle">
              Click the arrows or tabs below to view your results
            </p>

            <div className="tryon-viewer">
              <div className="tryon-viewer-main">
                <img
                  src={results[currentView]}
                  alt={`${currentView} view`}
                  className="tryon-viewer-img"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/400x500?text=Result';
                  }}
                />
                <div className="tryon-viewer-label">{currentView} view</div>

                {/* Arrow Navigation using exact modulo 3 calculation bounds */}
                <button className="tryon-arrow tryon-arrow-left"
                  onClick={() => {
                    const idx = VIEWS.indexOf(currentView);
                    setCurrentView(VIEWS[(idx - 1 + 3) % 3]);
                  }}>
                </button>
                <button className="tryon-arrow tryon-arrow-right"
                  onClick={() => {
                    const idx = VIEWS.indexOf(currentView);
                    setCurrentView(VIEWS[(idx + 1) % 3]);
                  }}>
                </button>
              </div>

              <div className="tryon-view-tabs">
                {VIEWS.map((view) => (
                  <button key={view}
                    className={`tryon-view-tab ${currentView === view ? 'active' : ''}`}
                    onClick={() => setCurrentView(view)}>
                    {view}
                  </button>
                ))}
              </div>

              <div className="tryon-thumbs">
                {VIEWS.map((view) => (
                  <div key={view}
                    className={`tryon-thumb ${currentView === view ? 'active' : ''}`}
                    onClick={() => setCurrentView(view)}>
                    <img src={results[view]} alt={view}
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/100x130?text=' + view;
                      }}/>
                    <div className="tryon-thumb-label">{view}</div>
                  </div>
                ))}
              </div>
            </div>

            {results.feedback && (
              <div className="tryon-feedback">
                <div className="tryon-feedback-header">
                  <span>🧠</span>
                  <span>AI Style Analysis</span>
                  {results.score && (
                    <span className="tryon-score">{results.score}/10</span>
                  )}
                </div>
                <p className="tryon-feedback-text">{results.feedback}</p>
              </div>
            )}

            <div className="tryon-actions">
              <button className="tryon-action-btn retry" onClick={() => navigate('/recommendations')}>
                👗 Try Another
              </button>
            </div>
          </div>
        )}

        {status === 'failed' && (
  <div className="tryon-failed">
    <div className="tryon-failed-icon">❌</div>
    <h2>Something went wrong</h2>
    <p>{error || 'The ML pipeline failed. Please try again.'}</p>
    <button
      className="tryon-start-btn"
      onClick={() => {
        // ── Full reset to idle ──
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus('idle');
        setError('');
        setActiveStage(-1);
        setResults(null);
        localStorage.removeItem('current_job_id');
      }}
    >
      Try Again
    </button>
    <button
      className="tryon-back-btn"
      style={{ marginTop: '12px' }}
      onClick={() => navigate('/recommendations')}
    >
      ← Choose Different Item
    </button>
  </div>
)}
      </div>
    </div>
  );
}

export default TryOn;