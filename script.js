const WORKER = '/api';
  let allFiles = [];

  // ── PWA: Service Worker ───────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(r => console.log('[SW] Registered, scope:', r.scope))
        .catch(e => console.warn('[SW] Registration failed:', e));
    });
  }

  // ── PWA: Install prompt ───────────────────────────────────
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-btn').classList.add('visible');
  });
  window.addEventListener('appinstalled', () => {
    document.getElementById('install-btn').classList.remove('visible');
    deferredPrompt = null;
  });

  async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('install-btn').classList.remove('visible');
    deferredPrompt = null;
  }

  // ── Offline banner ────────────────────────────────────────
  const banner = document.getElementById('offline-banner');
  function updateOnline() {
    banner.classList.toggle('show', !navigator.onLine);
  }
  window.addEventListener('online',  updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // ── Tab ──────────────────────────────────────────────────
  function switchTab(name, btn) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('panel-' + name).classList.add('active');
    btn.classList.add('active');
    if (name === 'files') loadFiles();
  }

  // ── Log ──────────────────────────────────────────────────
  function addLog(id, dotId, msg, type) {
    const el = document.getElementById(id);
    if (el.querySelector('span[style]')) el.innerHTML = '';
    const t = new Date().toLocaleTimeString('en-GB');
    const row = document.createElement('div');
    row.className = 'll';
    row.innerHTML = `<span class="lt">${t}</span><span class="${type === 's' ? 'ls' : type === 'e' ? 'le' : type === 'i' ? 'li' : ''}">${esc(msg)}</span>`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
    if (dotId) {
      const d = document.getElementById(dotId);
      d.classList.add('on');
      setTimeout(() => d.classList.remove('on'), 2500);
    }
  }

  function clearLog(id, dotId) {
    document.getElementById(id).innerHTML = '<span style="color:var(--text3);font-size:.72rem">Log cleared.</span>';
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(2) + ' MB';
  }

  // ── File picker ───────────────────────────────────────────
  const fp = document.getElementById('filepick');
  const fi = document.getElementById('file-input');
  fi.addEventListener('change', () => readFile(fi.files[0]));
  fp.addEventListener('dragover', e => { e.preventDefault(); fp.classList.add('over'); });
  fp.addEventListener('dragleave', () => fp.classList.remove('over'));
  fp.addEventListener('drop', e => { e.preventDefault(); fp.classList.remove('over'); readFile(e.dataTransfer.files[0]); });

  function readFile(f) {
    if (!f) return;
    document.getElementById('up-name').value = f.name;
    document.getElementById('fp-tag').innerHTML = `<span class="fp-tag">📎 ${esc(f.name)} · ${fmtSize(f.size)}</span>`;
    const r = new FileReader();
    r.onload = e => document.getElementById('up-content').value = e.target.result;
    r.readAsText(f);
  }

  function clearUpload() {
    document.getElementById('up-name').value = '';
    document.getElementById('up-content').value = '';
    document.getElementById('fp-tag').innerHTML = '';
    fi.value = '';
  }

  // ── UPLOAD ────────────────────────────────────────────────
  async function doUpload() {
    const name    = document.getElementById('up-name').value.trim();
    const content = document.getElementById('up-content').value;
    if (!name) { addLog('up-log','up-dot','⚠ Filename is required.','e'); return; }
    addLog('up-log','up-dot',`↑ Uploading "${name}"…`);
    try {
      const res  = await fetch(`${WORKER}?name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: {'Content-Type':'text/plain'}, body: content
      });
      const txt = await res.text();
      addLog('up-log','up-dot', res.ok ? `✓ ${txt}` : `✗ Error ${res.status}: ${txt}`, res.ok ? 's' : 'e');
    } catch(e) { addLog('up-log','up-dot',`✗ Network error: ${e.message}`,'e'); }
  }

  // ── DOWNLOAD ──────────────────────────────────────────────
  async function doDownload() {
    const name = document.getElementById('dl-name').value.trim();
    const resEl = document.getElementById('dl-res');
    resEl.classList.remove('show');
    if (!name) { addLog('dl-log','dl-dot','⚠ Filename is required.','e'); return; }
    addLog('dl-log','dl-dot',`↓ Fetching "${name}"…`);
    try {
      const res  = await fetch(`${WORKER}?name=${encodeURIComponent(name)}`, { method:'GET' });
      const txt  = await res.text();
      if (res.ok) {
        addLog('dl-log','dl-dot',`✓ "${name}" ready — ${fmtSize(txt.length)}`,'s');
        const blob = new Blob([txt], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        document.getElementById('dl-fname').textContent = name;
        document.getElementById('dl-fsize').textContent = fmtSize(txt.length);
        const a = document.getElementById('dl-link');
        a.href = url; a.download = name;
        resEl.classList.add('show');
        const prev = txt.length > 200 ? txt.slice(0,200)+'…' : txt;
        addLog('dl-log',null,`Preview: ${prev}`,'i');
      } else {
        addLog('dl-log','dl-dot',`✗ Error ${res.status}: ${txt}`,'e');
      }
    } catch(e) { addLog('dl-log','dl-dot',`✗ Network error: ${e.message}`,'e'); }
  }

  // ── FILES LIST ────────────────────────────────────────────
  async function loadFiles() {
    const el = document.getElementById('file-list');
    el.innerHTML = '<div class="loading"><div class="spin"></div>Loading files…</div>';
    document.getElementById('fcount').innerHTML = '';
    document.getElementById('fsearch').value = '';
    try {
      const res  = await fetch(`${WORKER}?list=1`, { method:'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      allFiles = data;
      renderFiles(allFiles);
    } catch(e) {
      el.innerHTML = `<div class="empty"><div class="ico">⚠️</div><p>Could not load files:<br>${esc(e.message)}</p></div>`;
    }
  }

  function renderFiles(files) {
    const el = document.getElementById('file-list');
    const cnt = document.getElementById('fcount');
    if (!files.length) {
      el.innerHTML = '<div class="empty"><div class="ico">☁️</div><p>No files found in repository.</p></div>';
      cnt.innerHTML = '';
      return;
    }
    cnt.innerHTML = `<strong>${files.length}</strong> file${files.length!==1?'s':''}`;
    el.innerHTML = files.map(f => {
      const ext  = f.name.includes('.') ? f.name.split('.').pop().substring(0,4).toUpperCase() : 'FILE';
      const size = f.size ? fmtSize(f.size) : '—';
      const k    = CSS.escape(f.sha || f.name);
      return `
        <div class="file-row" id="row-${k}" data-name="${esc(f.name)}">
          <div class="ext-badge">${esc(ext)}</div>
          <div class="f-info">
            <div class="f-name">${esc(f.name)}</div>
            <div class="f-meta">${size} · sha: ${f.sha ? f.sha.substring(0,7) : '—'}</div>
          </div>
          <div class="f-actions" id="fa-${k}">
            <button class="btn btn-outline btn-sm" onclick="quickDl(${JSON.stringify(f.name)})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </button>
            <button class="btn btn-soft-red btn-sm" onclick="askDel(${JSON.stringify(f.name)},${JSON.stringify(k)})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              Delete
            </button>
          </div>
          <div class="del-confirm" id="dc-${k}">
            <span>Delete forever?</span>
            <button class="btn btn-danger btn-sm" onclick="confirmDel(${JSON.stringify(f.name)},${JSON.stringify(k)})">Delete</button>
            <button class="btn btn-ghost btn-sm" onclick="cancelDel(${JSON.stringify(k)})">Cancel</button>
          </div>
        </div>`;
    }).join('');
  }

  function filterFiles() {
    const q = document.getElementById('fsearch').value.toLowerCase();
    const filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
    renderFiles(filtered);
    if (q) document.getElementById('fcount').innerHTML = `<strong>${filtered.length}</strong> of ${allFiles.length}`;
  }

  function askDel(name, k)    { document.getElementById('fa-'+k).style.display='none'; document.getElementById('dc-'+k).classList.add('show'); }
  function cancelDel(k)        { document.getElementById('fa-'+k).style.display=''; document.getElementById('dc-'+k).classList.remove('show'); }

  async function confirmDel(name, k) {
    const row = document.getElementById('row-'+k);
    row.style.opacity = '0.5';
    row.style.pointerEvents = 'none';
    try {
      const res = await fetch(`${WORKER}?name=${encodeURIComponent(name)}`, { method:'DELETE' });
      if (res.ok) {
        row.classList.add('removing');
        setTimeout(() => { allFiles = allFiles.filter(f => f.name !== name); renderFiles(allFiles); }, 320);
      } else {
        const t = await res.text();
        row.style.opacity=''; row.style.pointerEvents='';
        cancelDel(k);
        alert(`Error: ${t}`);
      }
    } catch(e) { row.style.opacity=''; row.style.pointerEvents=''; cancelDel(k); }
  }

  async function quickDl(name) {
    try {
      const res = await fetch(`${WORKER}?name=${encodeURIComponent(name)}`, { method:'GET' });
      if (res.ok) {
        const txt  = await res.text();
        const blob = new Blob([txt], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href=url; a.download=name; a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e) {}
  }

  // ── DELETE PANEL ─────────────────────────────────────────
  function updateDelPreview() {
    const name = document.getElementById('del-name').value.trim();
    const prev = document.getElementById('del-preview');
    const btn  = document.getElementById('del-btn');
    if (name) {
      document.getElementById('del-prev-name').textContent = name;
      prev.classList.add('show'); btn.disabled = false;
    } else {
      prev.classList.remove('show'); btn.disabled = true;
    }
  }

  function clearDel() {
    document.getElementById('del-name').value = '';
    updateDelPreview();
  }

  async function doDelete() {
    const name = document.getElementById('del-name').value.trim();
    if (!name) return;
    const btn = document.getElementById('del-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    addLog('del-log','del-dot',`🗑 Deleting "${name}"…`);
    try {
      const res = await fetch(`${WORKER}?name=${encodeURIComponent(name)}`, { method:'DELETE' });
      const txt = await res.text();
      addLog('del-log','del-dot', res.ok ? `✓ ${txt}` : `✗ Error ${res.status}: ${txt}`, res.ok ? 's' : 'e');
      if (res.ok) { clearDel(); allFiles = allFiles.filter(f => f.name !== name); }
    } catch(e) { addLog('del-log','del-dot',`✗ Network error: ${e.message}`,'e'); }
    finally {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> Yes, Delete Permanently`;
      updateDelPreview();
    }
  }
