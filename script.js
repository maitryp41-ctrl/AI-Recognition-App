// Change this if your backend runs somewhere other than localhost:5000
const BASE_URL = "http://localhost:5000";

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

function openPanel(tool){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.node').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + tool).classList.add('open');
  document.querySelector(`.node[data-tool="${tool}"]`).classList.add('active');
  document.getElementById('panel-' + tool).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closePanel(){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.node').forEach(n => n.classList.remove('active'));
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
}

async function handleFile(event, kind){
  const file = event.target.files[0];
  if(!file) return;
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
  event.target.value = ''; // allow re-selecting the same file
}
