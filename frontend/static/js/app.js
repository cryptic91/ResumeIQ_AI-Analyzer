'use strict';

/* ═══════════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════════ */
const RING_CIRCUMFERENCE = 2 * Math.PI * 56; // r=56, matches SVG

/* ═══════════════════════════════════════════════════
   DOM REFS
════════════════════════════════════════════════ */
const screenUpload  = document.getElementById('screen-upload');
const screenResults = document.getElementById('screen-results');

const dropZone      = document.getElementById('drop-zone');
const resumeInput   = document.getElementById('resume-input');
const fileChosen    = document.getElementById('file-chosen');
const fileNameDisp  = document.getElementById('file-name-display');
const uploadError   = document.getElementById('upload-error');
const jdTextarea    = document.getElementById('job-description');
const jdError       = document.getElementById('jd-error');
const analyzeForm   = document.getElementById('analyze-form');
const analyzeBtn    = document.getElementById('analyze-btn');

const loadingOverlay  = document.getElementById('loading-overlay');
const resultsContent  = document.getElementById('results-content');
const backBtn         = document.getElementById('back-btn');

const scoreRingProgress = document.getElementById('score-ring-progress');
const scoreNumber       = document.getElementById('score-number');
const scoreBadge        = document.getElementById('score-badge');
const overallVerdict    = document.getElementById('overall-verdict');
const sectionsList      = document.getElementById('sections-list');
const matchedKeywords   = document.getElementById('matched-keywords');
const missingKeywords   = document.getElementById('missing-keywords');
const strengthsList     = document.getElementById('strengths-list');
const weaknessesList    = document.getElementById('weaknesses-list');
const improvementsContent = document.getElementById('improvements-content');
const rewritesContent   = document.getElementById('rewrites-content');
const quickWinsList     = document.getElementById('quick-wins-list');

/* ═══════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════ */
let selectedFile = null;

/* ═══════════════════════════════════════════════════
   SCREEN TRANSITIONS
════════════════════════════════════════════════ */
function showScreen(screen) {
  [screenUpload, screenResults].forEach(s => {
    s.classList.remove('active');
    s.setAttribute('aria-hidden', 'true');
  });
  screen.classList.add('active');
  screen.removeAttribute('aria-hidden');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ═══════════════════════════════════════════════════
   DRAG & DROP / FILE SELECTION
════════════════════════════════════════════════ */
dropZone.addEventListener('click', () => resumeInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    resumeInput.click();
  }
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

resumeInput.addEventListener('change', () => {
  if (resumeInput.files[0]) handleFileSelect(resumeInput.files[0]);
});

function handleFileSelect(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file.', true);
    return;
  }
  selectedFile = file;
  fileNameDisp.textContent = file.name;
  fileChosen.classList.remove('hidden');
  dropZone.classList.add('has-file');
  uploadError.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════
   FORM SUBMISSION
════════════════════════════════════════════════ */
analyzeForm.addEventListener('submit', async e => {
  e.preventDefault();

  let valid = true;

  if (!selectedFile) {
    uploadError.classList.remove('hidden');
    valid = false;
  }
  if (!jdTextarea.value.trim()) {
    jdError.classList.remove('hidden');
    valid = false;
  }
  if (!valid) return;

  uploadError.classList.add('hidden');
  jdError.classList.add('hidden');

  // Switch to results screen (loading state)
  showScreen(screenResults);
  loadingOverlay.style.display = 'flex';
  resultsContent.classList.add('hidden');

  const formData = new FormData();
  formData.append('resume', selectedFile);
  formData.append('job_description', jdTextarea.value.trim());

  analyzeBtn.disabled = true;
  analyzeBtn.classList.add('loading');
  analyzeBtn.querySelector('.btn-text').textContent = 'Analyzing…';

  try {
    console.log('[ResumeIQ] Sending request to /analyze...');
    const res = await fetch('/analyze', { method: 'POST', body: formData });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ detail: res.statusText }));
      console.error('[ResumeIQ] Server error response:', res.status, errBody);
      throw new Error(errBody.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('[ResumeIQ] Analysis result:', data);
    renderResults(data);

    loadingOverlay.style.display = 'none';
    resultsContent.classList.remove('hidden');

  } catch (err) {
    console.error('[ResumeIQ] Request failed:', err);
    showScreen(screenUpload);
    showToast(`Error: ${err.message}`, true);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('loading');
    analyzeBtn.querySelector('.btn-text').textContent = 'Analyze My Resume';
  }
});

/* ═══════════════════════════════════════════════════
   BACK BUTTON
════════════════════════════════════════════════ */
backBtn.addEventListener('click', () => {
  showScreen(screenUpload);
  resetScoreRing();
});

/* ═══════════════════════════════════════════════════
   RENDER RESULTS
════════════════════════════════════════════════ */
function renderResults(data) {
  renderScore(data.ats_score);
  renderVerdict(data.overall_verdict, data.sections_found);
  renderKeywords(data.matched_keywords, data.missing_keywords);
  renderList(strengthsList, data.strengths, 'strength');
  renderList(weaknessesList, data.weaknesses, 'weakness');
  renderImprovements(data.improvements_by_section);
  renderRewrites(data.before_after_rewrites);
  renderQuickWins(data.quick_wins);
}

/* ── Score Ring ── */
function renderScore(score) {
  const clamped = Math.max(0, Math.min(100, score));
  const offset  = RING_CIRCUMFERENCE * (1 - clamped / 100);

  scoreRingProgress.style.strokeDasharray  = RING_CIRCUMFERENCE;
  scoreRingProgress.style.strokeDashoffset = RING_CIRCUMFERENCE; // start at 0

  // Animate number counter
  let current = 0;
  const step  = Math.ceil(clamped / 60);
  const timer = setInterval(() => {
    current = Math.min(current + step, clamped);
    scoreNumber.textContent = current;
    if (current >= clamped) clearInterval(timer);
  }, 22);

  // Animate ring after a tick
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scoreRingProgress.style.strokeDashoffset = offset;
    });
  });

  // Apply colour class (SVG elements need setAttribute, not .className)
  scoreRingProgress.setAttribute('class', 'ring-progress ' + scoreClass(clamped));

  // Badge
  const { label, cls } = scoreBadgeInfo(clamped);
  scoreBadge.textContent = label;
  scoreBadge.className   = `score-badge ${cls}`;
}

function resetScoreRing() {
  scoreRingProgress.style.strokeDashoffset = RING_CIRCUMFERENCE;
  scoreNumber.textContent = '0';
}

function scoreClass(s) {
  if (s >= 80) return 'score-excellent';
  if (s >= 60) return 'score-good';
  if (s >= 40) return 'score-average';
  return 'score-poor';
}

function scoreBadgeInfo(s) {
  if (s >= 80) return { label: 'Excellent',  cls: 'badge-excellent' };
  if (s >= 60) return { label: 'Good Match', cls: 'badge-good' };
  if (s >= 40) return { label: 'Average',    cls: 'badge-average' };
  return             { label: 'Needs Work',  cls: 'badge-poor' };
}

/* ── Verdict & Sections ── */
function renderVerdict(verdict, sections) {
  overallVerdict.textContent = verdict || '—';

  sectionsList.innerHTML = '';
  (sections || []).forEach(s => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = s;
    sectionsList.appendChild(tag);
  });
}

/* ── Keywords ── */
function renderKeywords(matched, missing) {
  matchedKeywords.innerHTML = '';
  missingKeywords.innerHTML = '';

  (matched || []).forEach(kw => {
    matchedKeywords.appendChild(kwTag(kw, 'matched'));
  });
  (missing || []).forEach(kw => {
    missingKeywords.appendChild(kwTag(kw, 'missing'));
  });
}

function kwTag(text, type) {
  const span = document.createElement('span');
  span.className = `kw-tag ${type}`;
  span.textContent = text;
  return span;
}

/* ── Generic bullet list ── */
function renderList(container, items, type) {
  container.innerHTML = '';
  (items || []).forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    container.appendChild(li);
  });
}

/* ── Improvements by Section ── */
function renderImprovements(bySection) {
  improvementsContent.innerHTML = '';
  if (!bySection) return;

  Object.entries(bySection).forEach(([section, tips]) => {
    const group = document.createElement('div');
    group.className = 'improvement-group';

    const name = document.createElement('span');
    name.className = 'improvement-section-name';
    name.textContent = section;
    group.appendChild(name);

    const ul = document.createElement('ul');
    ul.className = 'improvement-items';
    (tips || []).forEach(tip => {
      const li = document.createElement('li');
      li.textContent = tip;
      ul.appendChild(li);
    });
    group.appendChild(ul);
    improvementsContent.appendChild(group);
  });
}

/* ── Before / After Rewrites ── */
function renderRewrites(rewrites) {
  rewritesContent.innerHTML = '';
  (rewrites || []).forEach(item => {
    const card = document.createElement('div');
    card.className = 'rewrite-card';

    card.innerHTML = `
      <div class="rewrite-header">
        <span class="rewrite-section-name">${escapeHtml(item.section || '')}</span>
        <span class="rewrite-label">${escapeHtml(item.label || '')}</span>
      </div>
      <div class="rewrite-body">
        <div class="rewrite-col">
          <div class="rewrite-col-label">Before</div>
          <p class="rewrite-text">${escapeHtml(item.before || '')}</p>
        </div>
        <div class="rewrite-col">
          <div class="rewrite-col-label">After</div>
          <p class="rewrite-text">${escapeHtml(item.after || '')}</p>
        </div>
      </div>
    `;
    rewritesContent.appendChild(card);
  });
}

/* ── Quick Wins ── */
function renderQuickWins(wins) {
  quickWinsList.innerHTML = '';
  (wins || []).forEach(win => {
    const li = document.createElement('li');
    li.textContent = win;
    quickWinsList.appendChild(li);
  });
}

/* ═══════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(message, isError = false) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
}
