import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import '../styles/Quiz.css'

const QUESTIONS = [
  {
    step:     1,
    key:      'gender',
    title:    'What is your gender?',
    subtitle: 'This helps us recommend better fitting clothes',
    type:     'single',
    // ↑ single = pick one option only
    options: [
      { value: 'M', label: 'Male',   icon: '👨' },
      { value: 'F', label: 'Female', icon: '👩' },
      { value: 'O', label: 'Other',  icon: '🧑' },
    ],
  },
  {
    step:     2,
    key:      'clothing',
    title:    'What type of clothing?',
    subtitle: 'Choose what you want to try on',
    type:     'single',
    options: [
      { value: 'tshirt', label: 'T-Shirt', icon: '👕' },
      { value: 'shirt',  label: 'Shirt',   icon: '👔' },
      { value: 'jeans',  label: 'Jeans',   icon: '👖' },
      { value: 'pants',  label: 'Pants',   icon: '🩳' },
      { value: 'dress',  label: 'Dress',   icon: '👗' },
      { value: 'jacket', label: 'Jacket',  icon: '🧥' },
    ],
  },
  {
    step:     3,
    key:      'size',
    title:    'What is your size?',
    subtitle: 'We will filter clothes that fit you',
    type:     'single',
    options: [
      { value: 'XS',  label: 'XS',  icon: '📏' },
      { value: 'S',   label: 'S',   icon: '📏' },
      { value: 'M',   label: 'M',   icon: '📏' },
      { value: 'L',   label: 'L',   icon: '📏' },
      { value: 'XL',  label: 'XL',  icon: '📏' },
      { value: 'XXL', label: 'XXL', icon: '📏' },
    ],
  },
  {
    step:     4,
    key:      'material',
    title:    'Preferred material?',
    subtitle: 'Choose your comfort preference',
    type:     'single',
    options: [
      { value: 'cotton',    label: 'Cotton',    icon: '🌿' },
      { value: 'polyester', label: 'Polyester', icon: '🧪' },
      { value: 'denim',     label: 'Denim',     icon: '💎' },
      { value: 'linen',     label: 'Linen',     icon: '🌾' },
      { value: 'silk',      label: 'Silk',      icon: '✨' },
      { value: 'any',       label: 'Any',       icon: '🎯' },
    ],
  },
  {
    step:     5,
    key:      'occasion',
    title:    'What is the occasion?',
    subtitle: 'We will suggest the most appropriate styles',
    type:     'single',
    options: [
      { value: 'casual',  label: 'Casual',  icon: '😊' },
      { value: 'formal',  label: 'Formal',  icon: '💼' },
      { value: 'sport',   label: 'Sport',   icon: '🏃' },
      { value: 'party',   label: 'Party',   icon: '🎉' },
      { value: 'outdoor', label: 'Outdoor', icon: '🏕️' },
    ],
  },
];

function Quiz() {

  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  // Which question is showing right now. 0 --> First Question, 4 --> Last Question

  const [answers, setAnswers] = useState({
    gender: '',
    clothing: '',
    size: '',
    material: '',
    occasion: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentQ = QUESTIONS[currentStep];
  const currentAnswer = answers[currentQ.key]

  const handleSelect = (value) => {
    setAnswers(prev => ({
      ...prev,
      [currentQ.key]: value,
      // ↑ Update only the current question's answer
      // e.g. if currentQ.key = 'gender'
      // answers.gender = value
    }));
  };

  const handleNext = () => {
    if (!currentAnswer) return;
    // ↑ Don't allow next if nothing selected

    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep(prev => prev + 1);
      // ↑ Move to next question
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      // ↑ Go back to previous question
    }
  };

  const handleSubmit = async () => {
    // ↑ Called on last question's Next button

    const allAnswered = Object.values(answers).every(a => a !== '');
    if (!allAnswered) {
      setError('Please answer all questions');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await API.post('preferences/', answers);
      // ↑ POST /api/preferences/
      // Django saves answers to MongoDB
      // answers = { gender, clothing, size, material, occasion }

      navigate('/recommendations');
      // ↑ Go to recommendations page

    } catch (err) {
      setError(
        err.response?.data?.error || 'Something went wrong. Try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const isLastStep = currentStep === QUESTIONS.length - 1;
  // ↑ true when on question 5 (occasion)
  // Changes Next button to Submit button

return (
    <div className="quiz-page">

      {/* ── Floating background icons ── */}
      <div className="quiz-bg-icons">
        {['👕','👗','👖','🧥','👔','🥻','🧣','👟'].map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </div>

      <div className="quiz-container">

        {/* ── Header ── */}
        <div className="quiz-header">
          <div className="quiz-step-badge">
            Step 2 of 5 · Question {currentStep + 1} of {QUESTIONS.length}
          </div>
          <h1 className="quiz-title">{currentQ.title}</h1>
          <p className="quiz-subtitle">{currentQ.subtitle}</p>
        </div>

        {/* ── Progress bar ── */}
        <div className="quiz-progress-bar">
          <div
            className="quiz-progress-fill"
            style={{
              width: `${((currentStep + 1) / QUESTIONS.length) * 100}%`
            }}
          />
        </div>

        {/* ── Step dots ── */}
        <div className="quiz-dots">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`quiz-dot ${
                i < currentStep  ? 'done'    :
                i === currentStep ? 'active' : ''
              }`}
            />
            // ↑ done   = answered already (filled blue)
            // active  = current question (highlighted)
            // default = future question (dim)
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="quiz-error">⚠️ {error}</div>
        )}

        {/* ── Options grid ── */}
        <div className="quiz-options">
          {currentQ.options.map((opt) => (
            <div
              key={opt.value}
              className={`quiz-option ${
                currentAnswer === opt.value ? 'selected' : ''
              }`}
              onClick={() => handleSelect(opt.value)}
            >
              <div className="quiz-option-icon">{opt.icon}</div>
              <div className="quiz-option-label">{opt.label}</div>
              {currentAnswer === opt.value && (
                <div className="quiz-option-check">✓</div>
              )}
            </div>
          ))}
        </div>

        {/* ── Navigation buttons ── */}
        <div className="quiz-nav">
          <button className="quiz-btn-back" onClick={handleBack} disabled={currentStep === 0}>
            ← Back
          </button>

          <button className="quiz-btn-next" onClick={isLastStep ? handleSubmit : handleNext} disabled={!currentAnswer || loading}>
            {loading ? (
              <span className="quiz-btn-loading">
                <span className="spinner" /> Saving...
              </span>
            ) : isLastStep ? (
              'Get Recommendations →'
            ) : (
              'Next →'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

export default Quiz;