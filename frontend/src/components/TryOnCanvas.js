// src/components/TryOnCanvas.js
// ─────────────────────────────────────────────────────────────
// In-browser virtual try-on using:
// - MediaPipe Pose: detects body keypoints
// - Fabric.js v6: overlays and warps garment PNG
// - HTML5 Canvas: exports final result
// No backend, no GPU, no waiting
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react';
// ── Fabric v6: no more `fabric` namespace export — import classes directly ──
import * as fabric from 'fabric';

// ── Load MediaPipe from CDN ───────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(); return;
    }
    const script = document.createElement('script');
    script.src     = src;
    script.onload  = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ── Garment category to body region mapping ───────────────────
const GARMENT_REGIONS = {
  tshirt:  'upper',
  shirt:   'upper',
  jacket:  'upper',
  jeans:   'lower',
  pants:   'lower',
  dress:   'full',
};

// ── Fetch an image as a blob and return a local blob: URL.
// ── This sidesteps CORS/canvas-tainting issues entirely — blob:
// ── URLs are always same-origin, so Fabric never needs crossOrigin
// ── and doesn't depend on the image server sending exact CORS headers.
async function toBlobUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}): ${url}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function TryOnCanvas({ personImageUrl, garmentImageUrl, category, onResult }) {
  const canvasRef     = useRef(null);
  const fabricRef     = useRef(null);
  const [loading,  setLoading]  = useState(true);
  const [status,   setStatus]   = useState('Loading MediaPipe...');
  const [poseData, setPoseData] = useState(null);
  const [error,    setError]    = useState('');

  // ── Step 1: Load MediaPipe scripts ───────────────────────────
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        setStatus('Loading pose detection...');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
        setStatus('Detecting body pose...');
        await detectPose();
      } catch (e) {
        setError('Failed to load MediaPipe: ' + e.message);
        setLoading(false);
      }
    };
    loadMediaPipe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personImageUrl]);

  // ── Step 2: Detect pose from person image ────────────────────
  const detectPose = useCallback(async () => {
    try {
      const Pose = window.Pose;
      if (!Pose) throw new Error('MediaPipe Pose not loaded');

      const pose = new Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      pose.setOptions({
        modelComplexity:    1,
        smoothLandmarks:    true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5,
      });

      let resolved = false;

      pose.onResults((results) => {
        if (resolved) return;
        resolved = true;

        if (results.poseLandmarks && results.poseLandmarks.length > 0) {
          setPoseData(results.poseLandmarks);
          setStatus('Pose detected! Placing garment...');
        } else {
          setStatus('No pose detected — placing garment manually');
          setPoseData(null);
        }
        setLoading(false);
      });

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        await pose.send({ image: img });
      };
      img.onerror = () => {
        setStatus('Placing garment...');
        setPoseData(null);
        setLoading(false);
      };
      img.src = personImageUrl;

    } catch (e) {
      console.error('Pose detection error:', e);
      setStatus('Placing garment manually...');
      setPoseData(null);
      setLoading(false);
    }
  }, [personImageUrl]);

  // ── Step 3: Setup Fabric canvas after pose detected ──────────
  useEffect(() => {
    if (loading) return;
    setupCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, poseData]);

  const setupCanvas = async () => {
    try {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;

      // Destroy old canvas if exists
      if (fabricRef.current) {
        await fabricRef.current.dispose();
      }

      const CANVAS_W = 520;
      const CANVAS_H = 680;

      // ── v6: fabric.Canvas still exists as a named export ──
      const fabricCanvas = new fabric.Canvas(canvasEl, {
        width:                  CANVAS_W,
        height:                 CANVAS_H,
        backgroundColor:        '#1a1a2e',
        preserveObjectStacking: true,
      });
      fabricRef.current = fabricCanvas;

      // ── Load as blob URL to avoid CORS/canvas-taint issues ──
      const personBlobUrl = await toBlobUrl(personImageUrl);
      const personImg = await fabric.Image.fromURL(personBlobUrl);

      console.log('Person image natural size:', personImg.width, personImg.height);

      const scaleX = CANVAS_W / personImg.width;
      const scaleY = CANVAS_H / personImg.height;
      const scale  = Math.min(scaleX, scaleY);

      personImg.set({
        left:       (CANVAS_W - personImg.width  * scale) / 2,
        top:        (CANVAS_H - personImg.height * scale) / 2,
        scaleX:     scale,
        scaleY:     scale,
        selectable: false,
        evented:    false,
      });

      fabricCanvas.add(personImg);
      // ── v6: sendToBack was renamed sendObjectToBack ──
      fabricCanvas.sendObjectToBack(personImg);

      await loadGarment(fabricCanvas, personImg, scale, CANVAS_W, CANVAS_H);

    } catch (e) {
      console.error(e);
      setError('Canvas setup failed: ' + e.message);
    }
  };

  // ── Step 4: Load and position garment ────────────────────────
  const loadGarment = async (fabricCanvas, personImg, personScale, CW, CH) => {
    const region = GARMENT_REGIONS[category] || 'upper';

    let garmentLeft, garmentTop, garmentWidth;

    const personLeft   = personImg.left;
    const personTop    = personImg.top;
    const personWidth  = personImg.width  * personScale;
    const personHeight = personImg.height * personScale;

    if (poseData) {
      const leftShoulder  = poseData[11];
      const rightShoulder = poseData[12];
      const leftHip       = poseData[23];
      const rightHip      = poseData[24];

      const toX = (lm) => personLeft + lm.x * personWidth;
      const toY = (lm) => personTop  + lm.y * personHeight;

      const lsx = toX(leftShoulder);
      const rsx = toX(rightShoulder);
      const lsy = toY(leftShoulder);
      const lhx = toX(leftHip);
      const rhx = toX(rightHip);
      const lhy = toY(leftHip);

      const shoulderWidth  = Math.abs(rsx - lsx) * 1.4;
      const shoulderCenter = (lsx + rsx) / 2;

      if (region === 'upper') {
        garmentWidth = shoulderWidth;
        garmentLeft  = shoulderCenter - garmentWidth / 2;
        garmentTop   = Math.min(lsy, toY(rightShoulder)) - garmentWidth * 0.05;

      } else if (region === 'lower') {
        const hipWidth   = Math.abs(rhx - lhx) * 1.3;
        const hipCenter  = (lhx + rhx) / 2;
        garmentWidth = hipWidth;
        garmentLeft  = hipCenter - garmentWidth / 2;
        garmentTop   = lhy;

      } else {
        garmentWidth = shoulderWidth;
        garmentLeft  = shoulderCenter - garmentWidth / 2;
        garmentTop   = Math.min(lsy, toY(rightShoulder)) - garmentWidth * 0.05;
      }

    } else {
      if (region === 'upper') {
        garmentWidth = personWidth * 0.65;
        garmentLeft  = personLeft  + personWidth * 0.175;
        garmentTop   = personTop   + personHeight * 0.12;

      } else if (region === 'lower') {
        garmentWidth = personWidth * 0.60;
        garmentLeft  = personLeft  + personWidth * 0.20;
        garmentTop   = personTop   + personHeight * 0.48;

      } else {
        garmentWidth = personWidth * 0.65;
        garmentLeft  = personLeft  + personWidth * 0.175;
        garmentTop   = personTop   + personHeight * 0.10;
      }
    }

    // ── Load as blob URL to avoid CORS/canvas-taint issues ──
    const garmentBlobUrl = await toBlobUrl(garmentImageUrl);
    const garmentImg = await fabric.Image.fromURL(garmentBlobUrl);

    console.log('Garment image natural size:', garmentImg.width, garmentImg.height);

    const aspectRatio   = garmentImg.height / garmentImg.width;
    const garmentHeight = garmentWidth * aspectRatio;

    let heightMultiplier = 1.0;
    if (region === 'upper')  heightMultiplier = 1.1;
    if (region === 'lower')  heightMultiplier = 1.4;
    if (region === 'full')   heightMultiplier = 1.8;

    garmentImg.set({
      left:    garmentLeft,
      top:     garmentTop,
      scaleX:  garmentWidth / garmentImg.width,
      scaleY:  (garmentHeight * heightMultiplier) / garmentImg.height,
      opacity: 0.92,
      selectable:         true,
      hasControls:        true,
      hasBorders:         true,
      cornerColor:        '#57BAE4',
      cornerSize:         10,
      transparentCorners: false,
    });

    fabricCanvas.add(garmentImg);
    fabricCanvas.setActiveObject(garmentImg);
    fabricCanvas.renderAll();

    setStatus('✅ Done! Drag to adjust position');
  };

  // ── Export result as image ────────────────────────────────────
  const handleExport = () => {
    if (!fabricRef.current) return;

    fabricRef.current.discardActiveObject();
    fabricRef.current.renderAll();

    const dataURL = fabricRef.current.toDataURL({
      format:     'jpeg',
      quality:    0.92,
      multiplier: 1,
    });

    if (onResult) onResult(dataURL);
  };

  // ── Controls ──────────────────────────────────────────────────
  const adjustOpacity = (delta) => {
    if (!fabricRef.current) return;
    const obj = fabricRef.current.getActiveObject();
    if (!obj) return;
    obj.set('opacity', Math.min(1, Math.max(0.1, obj.opacity + delta)));
    fabricRef.current.renderAll();
  };

  const resetGarment = () => {
    setupCanvas();
    setStatus('Garment reset');
  };

  return (
    <div style={{ textAlign: 'center' }}>

      <div style={{
        fontSize:     '13px',
        color:        loading ? '#57BAE4' : '#4ade80',
        marginBottom: '12px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        gap: '8px',
      }}>
        {loading && (
          <span style={{
            width: '12px', height: '12px',
            border: '2px solid rgba(87,186,228,0.3)',
            borderTop: '2px solid #57BAE4',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {error || status}
      </div>

      <div style={{
        display:      'inline-block',
        borderRadius: '16px',
        overflow:     'hidden',
        border:       '1px solid rgba(255,255,255,0.1)',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <canvas ref={canvasRef} />
      </div>

      {!loading && !error && (
        <p style={{
          fontSize: '12px',
          color: 'rgba(255,255,255,0.4)',
          marginTop: '10px',
        }}>
          Drag garment to adjust · Use corner handles to resize · Scroll to zoom
        </p>
      )}

      {!loading && !error && (
        <div style={{
          display:        'flex',
          gap:            '10px',
          justifyContent: 'center',
          marginTop:      '14px',
          flexWrap:       'wrap',
        }}>
          <button onClick={() => adjustOpacity(0.1)}  style={ctrlBtn}>
            + Opacity
          </button>
          <button onClick={() => adjustOpacity(-0.1)} style={ctrlBtn}>
            - Opacity
          </button>
          <button onClick={resetGarment} style={ctrlBtn}>
            ↺ Reset
          </button>
          <button onClick={handleExport} style={exportBtn}>
            ✓ Use This Result
          </button>
        </div>
      )}
    </div>
  );
}

const ctrlBtn = {
  padding:      '8px 16px',
  borderRadius: '8px',
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.15)',
  color:        '#fff',
  fontSize:     '13px',
  cursor:       'pointer',
};

const exportBtn = {
  padding:      '8px 24px',
  borderRadius: '8px',
  background:   '#57BAE4',
  border:       'none',
  color:        '#000',
  fontSize:     '13px',
  fontWeight:   700,
  cursor:       'pointer',
};

export default TryOnCanvas;