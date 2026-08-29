// BASE_URL comes from config.js (loaded before this file in index.html) —
// edit config.js when your backend URL changes, not this file.

/* ---------- theme ---------- */

function getStoredTheme(){
  try { return localStorage.getItem('ai-recognition-theme'); }
  catch(e){ return null; }
}
function storeTheme(theme){
  try { localStorage.setItem('ai-recognition-theme', theme); }
  catch(e){ /* ignore if storage unavailable */ }
}

(function initTheme(){
  const saved = getStoredTheme();
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  storeTheme(next);
}

/* ---------- panels ---------- */

function stopAllCameras(){
  Object.keys(activeStreams).forEach(stopCamera);
}

function openPanel(tool){
  stopAllCameras();
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.node').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + tool).classList.add('open');
  document.querySelector(`.node[data-tool="${tool}"]`).classList.add('active');
  document.getElementById('panel-' + tool).scrollIntoView({ behavior: 'smooth', block: 'center' });

  if(tool === 'attendance'){
    loadRegisteredStudents();
  }
}

function closePanel(){
  stopAllCameras();
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.node').forEach(n => n.classList.remove('active'));
}

/* ---------- registered students list ---------- */

async function loadRegisteredStudents(){
  const listEl = document.getElementById('student-list');
  if(!listEl) return;
  listEl.innerHTML = '<span class="vf-hint" style="text-transform:none;letter-spacing:0">Loading…</span>';

  try{
    const res = await fetch(BASE_URL + '/attendance/students');
    const data = await res.json();

    if(!data.success){
      listEl.innerHTML = '<span class="vf-hint" style="text-transform:none;letter-spacing:0">Could not load registered students.</span>';
      return;
    }

    if(data.count === 0){
      listEl.innerHTML = '<span class="vf-hint" style="text-transform:none;letter-spacing:0">No registration yet.</span>';
      return;
    }

    listEl.innerHTML = '';
    data.students.forEach(s => {
      const row = document.createElement('div');
      row.className = 'student-row';
      row.innerHTML = `
        <span><span class="student-name">${escapeHtml(s.name)}</span> &nbsp;
        <span class="student-id">#${escapeHtml(s.user_id)}</span></span>
        <button type="button" class="student-remove" title="Remove" onclick="removeStudent('${encodeURIComponent(s.user_id)}')">✕</button>
      `;
      listEl.appendChild(row);
    });
  }catch(err){
    listEl.innerHTML = '<span class="vf-hint" style="text-transform:none;letter-spacing:0">Could not reach backend.</span>';
    console.error('Failed to load registered students:', err);
  }
}

async function removeStudent(userId){
  try{
    const res = await fetch(BASE_URL + '/attendance/students/' + userId, { method: 'DELETE' });
    const data = await res.json();
    if(data.success){
      loadRegisteredStudents();
    }
  }catch(err){
    console.error('Failed to remove student:', err);
  }
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- live webcam capture ---------- */

const activeStreams = {};

function facingModeFor(kind){
  return (kind === 'register' || kind === 'attendance') ? 'user' : 'environment';
}

function cameraSupported(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startCamera(kind){
  const vf = document.getElementById('vf-' + kind);
  const video = document.getElementById('video-' + kind);

  if(!cameraSupported()){
    document.getElementById('fallback-' + kind).click();
    return;
  }

  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingModeFor(kind) },
      audio: false
    });
    activeStreams[kind] = stream;
    video.srcObject = stream;
    vf.classList.add('streaming');
    vf.classList.remove('has-image');
    document.getElementById('controls-' + kind).style.display = 'none';
    document.getElementById('streamControls-' + kind).style.display = 'flex';
  }catch(err){
    console.warn('Camera unavailable, falling back to native capture:', err);
    document.getElementById('fallback-' + kind).click();
  }
}

function stopCamera(kind){
  const stream = activeStreams[kind];
  if(stream){
    stream.getTracks().forEach(track => track.stop());
    delete activeStreams[kind];
  }
  const vf = document.getElementById('vf-' + kind);
  vf.classList.remove('streaming');
  document.getElementById('controls-' + kind).style.display = 'flex';
  document.getElementById('streamControls-' + kind).style.display = 'none';
}

function cancelCamera(kind){
  stopCamera(kind);
}

function capturePhoto(kind){
  const video = document.getElementById('video-' + kind);
  const canvas = document.getElementById('canvas-' + kind);
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if(!blob) return;
    const file = new File([blob], kind + '-capture.jpg', { type: 'image/jpeg' });
    stopCamera(kind);
    processImage(file, kind);
  }, 'image/jpeg', 0.92);
}

/* ---------- capture + upload ---------- */

function showPreview(kind, file){
  const vf = document.getElementById('vf-' + kind);
  const img = document.getElementById('preview-' + kind);
  if(!vf || !img) return;
  img.src = URL.createObjectURL(file);
  vf.classList.add('has-image');
}

function setLoading(kind){
  const el = document.getElementById('readout-' + kind);
  el.className = 'readout loading';
  el.textContent = 'Sending to backend';
  let dots = 0;
  el._interval = setInterval(() => {
    dots = (dots + 1) % 4;
    el.textContent = 'Sending to backend' + '.'.repeat(dots);
  }, 400);
}

function stopLoading(kind){
  const el = document.getElementById('readout-' + kind);
  if(el._interval) clearInterval(el._interval);
}

function renderResult(kind, data, ok){
  stopLoading(kind);
  const el = document.getElementById('readout-' + kind);
  el.className = ok ? 'readout' : 'readout err';
  el.textContent = JSON.stringify(data, null, 2);

  if(kind === 'register' && ok){
    loadRegisteredStudents();
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-id').value = '';
  }
}

function handleFile(event, kind){
  const file = event.target.files[0];
  if(!file) return;
  processImage(file, kind);
  event.target.value = '';
}

async function processImage(file, kind){
  showPreview(kind === 'register' ? 'register' : kind, file);

  const formData = new FormData();
  formData.append('image', file);

  let url;
  if(kind === 'object')       url = BASE_URL + '/object';
  if(kind === 'authenticity') url = BASE_URL + '/authenticity';
  if(kind === 'attendance')   url = BASE_URL + '/attendance';
  if(kind === 'register'){
    const name = document.getElementById('reg-name').value.trim();
    const userId = document.getElementById('reg-id').value.trim();
    if(!name || !userId){
      renderResult('register', { error: "Enter both name and user ID before capturing a photo." }, false);
      return;
    }
    formData.append('name', name);
    formData.append('user_id', userId);
    url = BASE_URL + '/attendance/register';
  }

  setLoading(kind);
  try{
    const res = await fetch(url, { method: 'POST', body: formData });
    const data = await res.json();
    renderResult(kind, data, res.ok && data.success !== false);
  }catch(err){
    renderResult(kind, {
      error: "Could not reach backend. Is app.py running at " + BASE_URL + "?",
      detail: String(err)
    }, false);
  }
}
