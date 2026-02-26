# ☁️ Ace Clouds

> **A sleek, PWA-ready file manager** — upload, download, browse, and delete files stored in a GitHub repository via a Cloudflare Worker backend and a Cloudflare Pages frontend.

![Beta](https://img.shields.io/badge/status-beta-orange?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-enabled-0891b2?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## ✨ Features

- 📤 **Upload / Overwrite** — push any text-based file straight to your GitHub repo
- 📥 **Download** — fetch and save any stored file with a single click
- 📂 **Browse All Files** — searchable list with live file count and SHA info
- 🗑️ **Delete** — permanently remove files with a confirmation guard
- 📱 **Installable PWA** — works offline, installable on mobile and desktop
- 🔒 **Proxy-secured** — your GitHub token never touches the browser

---

## 🏗️ Architecture

```
Browser (Cloudflare Pages)
        │
        │  fetch /api?...
        ▼
Cloudflare Pages Function  (/functions/api.js)
        │  proxies request, hides WORKER_URL env var
        ▼
Cloudflare Worker  (ace-clouds-backend)
        │  reads/writes via GitHub Contents API
        ▼
GitHub Repository  (your storage bucket)
```

**Files in this repo:**

| File | Purpose |
|---|---|
| `index.html` | Full SPA UI (tabs, cards, log panels) |
| `script.js` | All client-side logic (fetch, PWA, drag-drop) |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker (cache-first shell, network-first API) |
| `functions/api.js` | Cloudflare Pages Function — reverse proxy to Worker |

---

## 🚀 Deployment Guide

You need **three things** set up:

1. A **GitHub repo** to store files (can be private)
2. A **Cloudflare Worker** (the backend)
3. A **Cloudflare Pages** site (the frontend)

---

### Step 1 — Create a GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set the scope to the target repository only
4. Under **Repository permissions**, enable:
   - `Contents` → **Read and Write**
5. Copy and save your token — you'll need it in Step 2

---

### Step 2 — Deploy the Cloudflare Worker (Backend)

The Worker handles all GitHub API calls and keeps your token secret.

#### 2a. Create the Worker

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **Workers & Pages → Create application → Create Worker**
3. Name it (e.g. `ace-clouds-backend`) and click **Deploy**
4. Click **Edit code** and replace the default script with the Worker code below

#### 2b. Worker Code

```js
const GITHUB_TOKEN = GITHUB_TOKEN_SECRET; // bound as secret
const OWNER  = 'your-github-username';
const REPO   = 'your-storage-repo';
const BRANCH = 'main';

const BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent':  'ace-clouds-worker',
  Accept:        'application/vnd.github+json',
};

export default {
  async fetch(req) {
    const url    = new URL(req.url);
    const name   = url.searchParams.get('name');
    const isList = url.searchParams.get('list') === '1';
    const method = req.method.toUpperCase();

    // ── CORS preflight ────────────────────────────────
    if (method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }));
    }

    // ── LIST all files ────────────────────────────────
    if (method === 'GET' && isList) {
      const r = await fetch(`${BASE}?ref=${BRANCH}`, { headers: HEADERS });
      if (!r.ok) return cors(new Response(JSON.stringify({ error: await r.text() }), { status: r.status }));
      const items = await r.json();
      const files = items
        .filter(i => i.type === 'file')
        .map(i => ({ name: i.name, size: i.size, sha: i.sha }));
      return cors(Response.json(files));
    }

    if (!name) return cors(new Response('Missing ?name=', { status: 400 }));

    // ── GET single file ───────────────────────────────
    if (method === 'GET') {
      const r = await fetch(`${BASE}/${encodeURIComponent(name)}?ref=${BRANCH}`, { headers: HEADERS });
      if (!r.ok) return cors(new Response(await r.text(), { status: r.status }));
      const j = await r.json();
      const content = atob(j.content.replace(/\n/g,''));
      return cors(new Response(content, { status: 200 }));
    }

    // ── POST (create / overwrite) ─────────────────────
    if (method === 'POST') {
      const body    = await req.text();
      const encoded = btoa(unescape(encodeURIComponent(body)));
      // Get existing SHA (needed for updates)
      let sha;
      const existing = await fetch(`${BASE}/${encodeURIComponent(name)}?ref=${BRANCH}`, { headers: HEADERS });
      if (existing.ok) sha = (await existing.json()).sha;

      const payload = { message: `Upload ${name}`, content: encoded, branch: BRANCH, ...(sha && { sha }) };
      const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return cors(new Response(r.ok ? `"${name}" uploaded successfully.` : await r.text(), { status: r.status }));
    }

    // ── DELETE ────────────────────────────────────────
    if (method === 'DELETE') {
      const existing = await fetch(`${BASE}/${encodeURIComponent(name)}?ref=${BRANCH}`, { headers: HEADERS });
      if (!existing.ok) return cors(new Response('File not found.', { status: 404 }));
      const { sha } = await existing.json();
      const r = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${name}`, sha, branch: BRANCH }),
      });
      return cors(new Response(r.ok ? `"${name}" deleted.` : await r.text(), { status: r.status }));
    }

    return cors(new Response('Method not allowed', { status: 405 }));
  },
};

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
}
```

#### 2c. Add Secrets & Variables to the Worker

1. In your Worker dashboard, go to **Settings → Variables**
2. Under **Environment Variables**, add:
   - `GITHUB_TOKEN_SECRET` → your GitHub token from Step 1 *(mark as Secret)*
3. Update `OWNER`, `REPO`, and `BRANCH` constants in the Worker code to match your GitHub details
4. Click **Save and Deploy**
5. Note your Worker URL — it looks like `https://ace-clouds-backend.YOUR-SUBDOMAIN.workers.dev`

---

### Step 3 — Deploy the Frontend on Cloudflare Pages

#### 3a. Push this repo to GitHub

Make sure all files (`index.html`, `script.js`, `manifest.json`, `sw.js`, `functions/api.js`) are committed and pushed.

#### 3b. Create a Pages project

1. In Cloudflare dashboard, go to **Workers & Pages → Create application → Pages**
2. Click **Connect to Git** and select your frontend repo
3. Set the build configuration:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or wherever your `index.html` lives)
4. Click **Save and Deploy**

#### 3c. Add the Worker URL as an environment variable

1. In your Pages project, go to **Settings → Environment variables**
2. Add a variable for **Production** (and optionally Preview):
   - **Variable name:** `WORKER_URL`
   - **Value:** your full Worker URL, e.g. `https://ace-clouds-backend.YOUR-SUBDOMAIN.workers.dev`
3. Click **Save**
4. Go to **Deployments** and click **Retry deployment** to rebuild with the new variable

---

### Step 4 — Update `manifest.json`

Replace the placeholder icon URLs in `manifest.json` with your actual logo URLs:

```json
"icons": [
  {
    "src": "https://your-domain.com/logo-192.png",
    "sizes": "192x192",
    "type": "image/png",
    "purpose": "any maskable"
  },
  {
    "src": "https://your-domain.com/logo-512.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "any maskable"
  }
]
```

---

## 🖥️ Using the App

Once deployed, open your Pages URL and you'll see four tabs:

### 📤 Upload
1. Type a filename (e.g. `notes.txt`) or drag-and-drop a file from your device
2. Paste or type the content, or let it auto-fill from the picked file
3. Click **Upload File** — the Activity Log shows the result

### 📥 Download
1. Type the exact filename stored in the repo
2. Click **Fetch & Download**
3. A preview card appears — click **Save File** to download it

### 📂 All Files
- Loads automatically when you open the tab
- Use the search box to filter by name
- Click **Download** on any row to save it instantly
- Click **Delete** → **Delete** to permanently remove a file

### 🗑️ Delete
1. Type the exact filename to delete
2. A preview badge confirms the target file
3. Click **Yes, Delete Permanently** — this cannot be undone

---

## 📱 Installing as a PWA

On supported browsers a **Install App** button appears in the top-right corner. Tap it to install Ace Clouds as a native-like app on your device. The app shell is cached for offline viewing — API calls still require a network connection.

---

## 🔧 Local Development

You can run the frontend locally with any static file server:

```bash
# using Python
python -m http.server 8080

# using Node (npx)
npx serve .
```

For local API calls, either point `WORKER` in `script.js` directly to your live Worker URL, or set up [Wrangler](https://developers.cloudflare.com/workers/wrangler/) to run the Worker locally.

---

## 🛡️ Security Notes

- Your **GitHub token is never exposed to the browser** — it lives only in the Worker as an encrypted secret
- The Pages Function (`functions/api.js`) acts as a reverse proxy, forwarding requests to the Worker and reading `WORKER_URL` from a server-side environment variable
- For production use, consider restricting the Worker's CORS `Access-Control-Allow-Origin` to your Pages domain instead of `*`

---

## 🗺️ Roadmap

- [ ] Folder / path support
- [ ] Binary file uploads (images, PDFs)
- [ ] File preview pane
- [ ] Authentication layer

---

## 📄 License

MIT — free to use, modify, and distribute.

---

<p align="center">Built with ☁️ by <strong>Vikas Patel</strong> · Powered by Cloudflare Workers &amp; GitHub</p>
