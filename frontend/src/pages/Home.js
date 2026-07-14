import React from 'react';
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Home.css'

const steps = [
  {
    num:   '01',
    icon:  '📸',
    title: 'Upload 4 Photos',
    desc:  'Upload full-body photos from front, back, left and right angles for accurate body mapping.',
  },
  {
    num:   '02',
    icon:  '🎯',
    title: 'Answer Quick Quiz',
    desc:  'Tell us your gender, clothing type, size, material preference and occasion.',
  },
  {
    num:   '03',
    icon:  '🤖',
    title: 'Get AI Picks',
    desc:  'Our recommendation model filters the catalog and ranks outfits by fit score and style match.',
  },
  {
    num:   '04',
    icon:  '✨',
    title: 'Try It On',
    desc:  'Click Try On — our ML pipeline fits the garment to your body using SAM, OpenPose and VITON-HD.',
  },
  {
    num:   '05',
    icon:  '🔁',
    title: 'View in 360°',
    desc:  'See the result from all 4 angles with AI style score and personalized feedback.',
  },
];

const features = [
  { icon: '✂️', title: 'Body Segmentation',   desc: 'SAM isolates your body from the background with pixel-perfect accuracy.' },
  { icon: '🦴', title: 'Pose Estimation',      desc: 'OpenPose detects 18 body keypoints to understand your exact body shape.' },
  { icon: '🔄', title: 'Garment Warping',      desc: 'TPS transformation maps clothing to fit your unique body pose naturally.' },
  { icon: '🎨', title: 'Realistic Blending',   desc: 'OpenCV compositing merges the warped garment onto your photo seamlessly.' },
  { icon: '🧠', title: 'Style Analysis',       desc: 'ML model scores the outfit fit and generates personalized style feedback.' },
  { icon: '🔁', title: '360° Result Viewer',   desc: 'See the try-on from front, back, left and right — all 4 views.' },
  { icon: '⚡', title: 'Fast Processing',      desc: 'Celery + Redis task queue processes your try-on in the background.' },
];

const stats = [
  { val: '3',    label: 'Body views captured' },
  { val: '~15s',  label: 'Processing time'      },
  { val: '360°',  label: 'Result viewer'        },
  { val: '6',    label: 'AI models used'       },
];

function Home() {

  const navigate = useNavigate();
  const { user } = useAuth();

  const handleStart = () => {
    navigate(user ? '/upload' : '/register');
  }

  return (
    <div className="home-page">

      <div className="home-hero">

        <h1 className="home-h1">
          Try on any outfit<br />
          <span className="home-h1-highlight">on intelligent displays</span>
        </h1>

        <p className="home-hero-sub">
          Upload your photo, answer a quick quiz, and our AI pipeline
          fits real clothing to your body in seconds — viewed in 360°.
        </p>

        <div className="home-btn-row">
          <button className="home-btn-primary" onClick={handleStart}>
            {user ? 'Go to Upload →' : 'Get Started Free'}
          </button>
          {!user && (
    <button className="home-btn-outline" onClick={() => navigate('/login')}>
      Login
    </button>
  )}
        </div>

        <div className="home-stats-row">
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div className="home-stat-val">{s.val}</div>
              <div className="home-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-section">
        <div className="home-section-head">
          <p className="home-section-tag">Process</p>
          <h2 className="home-section-title">How TryOn works</h2>
        </div>

        <div>
          {steps.map((step, i) => (
            <div
              key={i}
              className={`home-step-row ${i === steps.length - 1 ? 'no-border' : ''}`}
            >
              <div className="home-step-num">{step.num}</div>
              <div className="home-step-icon">{step.icon}</div>
              <div>
                <div className="home-step-title">{step.title}</div>
                <div className="home-step-desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-features-band">
        <div className="home-section-head">
          <p className="home-section-tag">Technology</p>
          <h2 className="home-section-title">What's under the hood</h2>
        </div>
        
        <div className="home-feat-grid">
          {features.map((f, i) => (
            <div key={i} className="home-feat-card">
              <div className="home-feat-icon">{f.icon}</div>
              <div className="home-feat-title">{f.title}</div>
              <div className="home-feat-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
export default Home;