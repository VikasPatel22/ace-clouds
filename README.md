# ☁️ Ace Clouds

> **Serverless cloud file storage — powered by Cloudflare Workers + GitHub as a backend.**

Ace Clouds is a lightweight, fully serverless file manager that uses **GitHub as a storage layer** and **Cloudflare Workers** as the API backend. A clean PWA frontend (hosted on **Cloudflare Pages**) lets you upload, download, browse, and delete files — from any device, with no server to maintain.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📤 **Upload / Overwrite** | Send any text-based file directly to your GitHub repo |
| 📥 **Download** | Fetch any stored file by name and save it locally |
| 🗂 **Browse All Files** | List every file in your repo with size, SHA, and quick actions |
| 🗑 **Delete** | Permanently remove files from GitHub via the UI |
| 🔍 **Search** | Filter your files list in real time |
| 📱 **PWA** | Installable on Android, iOS, and desktop; works offline (shell only) |
| 🔒 **Secure** | Your GitHub token lives only in Cloudflare Worker env vars — never in the browser |
| ⚡ **Zero Cold Start** | Cloudflare's edge network runs the Worker globally |

---

## 🏗 Architecture

```
Browser / PWA (Cloudflare Pages)
        │
        │  fetch("/api?...")
        ▼
Cloudflare Pages Function  ← /functions/api.js  (proxy)
        │
        │  forwards request + hides real Worker URL
        ▼
Cloudflare Worker  ← ace-clouds-backend
        │
        │  GitHub REST API v3
        ▼
GitHub Repository  ← your file storage
```

**Why a proxy?** The Pages Function keeps your Worker's URL private and handles CORS cleanly, so your GitHub token is never exposed to the client.

---

## 📁 Repository Structure

```
ace-clouds/
├── index.html              # Main PWA frontend
├── script.js               # Frontend JS (upload, download, delete, list)
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline shell caching)
├── functions/
│   └── api.js              # Cloudflare Pages proxy function
└── README.md
```

The **Cloudflare Worker** (`worker.js`) is deployed separately on Cloudflare Workers — it is **not** in this repo's web root.

---

## 🚀 Deployment Guide

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com) (free tier works)
- A [GitHub account](https://github.com) with a **dedicated storage repo** (can be private)
- A GitHub **Personal Access Token** with `repo` (or `contents`) scope

---

### Step 1 — Create a GitHub Storage Repository

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (e.g. `ace-clouds-st`) — private is fine
3. Initialize it with a `README.md` so the `main` branch exists

---

### Step 2 — Generate a GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Give it a name (e.g. `ace-clouds`)
4. Select scope: ✅ `repo` (full control of private repositories)
5. Click **Generate token** — **copy it now**, you won't see it again

---

### Step 3 — Deploy the Cloudflare Worker

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **Workers & Pages → Create → Worker**
3. Name it (e.g. `ace-clouds`) and click **Deploy**
4. Click **Edit Code**, paste the entire contents of `worker.js`, then click **Deploy**

#### Add Environment Variables

In your Worker's dashboard, go to **Settings → Variables → Environment Variables** and add:

| Variable | Value | Example |
|---|---|---|
| `GITHUB_TOKEN` | Your PAT from Step 2 | `ghp_xxxxxxxxxxxx` |
| `GITHUB_OWNER` | Your GitHub username or org | `your_github_username` |
| `GITHUB_REPO` | Storage repo name | `your_repo_name` |
| `GITHUB_BRANCH` | Branch to use | `main` |

> ⚠️ **Encrypt all secrets** using the **"Encrypt"** toggle — especially `GITHUB_TOKEN`.

After saving, note your Worker URL: `https://<your-subdomain>.workers.dev`

---

### Step 4 — Deploy the Frontend to Cloudflare Pages

1. Go to **Workers & Pages → Create → Pages → Connect to Git**
2. Connect your GitHub account and select this repository
3. Configure the build:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` *(or leave blank)*
4. Click **Save and Deploy**

#### Add the Worker URL as an Environment Variable

After your first deploy, go to **Pages → Your Project → Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `WORKER_URL` | `https://ace-clouds-backend.<your-subdomain>.workers.dev` |

Then go to **Deployments → Retry deployment** (or push a new commit) so the Pages Function picks up the new variable.

> The Pages Function at `functions/api.js` reads `WORKER_URL` at runtime and proxies all `/api` requests to your Worker — your Worker URL is never exposed to users.

---

### Step 5 — Verify

Open your Pages URL (e.g. `https://ace-clouds.pages.dev`).

- ✅ The **All Files** tab should load (empty repo will show "No files found")
- ✅ Upload a test file — it should appear in your GitHub storage repo
- ✅ Download it back and verify the content
- ✅ Delete it and confirm it's removed from GitHub

---

## ⚙️ API Reference

All requests go through `/api` on your Pages domain (proxied to the Worker).

| Method | URL | Description |
|---|---|---|
| `GET` | `/api?list=1` | List all files → returns JSON array |
| `GET` | `/api?name=<filename>` | Download file → returns raw content |
| `POST` | `/api?name=<filename>` | Upload or overwrite file (body = raw text) |
| `DELETE` | `/api?name=<filename>` | Delete file permanently |
| `OPTIONS` | `/api` | CORS preflight |

### Example — Upload via cURL

```bash
curl -X POST "https://your-pages-domain.pages.dev/api?name=hello.txt" \
  -H "Content-Type: text/plain" \
  -d "Hello from curl!"
```

### Example — Download via cURL

```bash
curl "https://your-pages-domain.pages.dev/api?name=hello.txt"
```

### Example — List Files via cURL

```bash
curl "https://your-pages-domain.pages.dev/api?list=1"
```

### Example — Delete via cURL

```bash
curl -X DELETE "https://your-pages-domain.pages.dev/api?name=hello.txt"
```

---

## 🔒 Security Notes

- Your **GitHub token** is stored only as an encrypted Cloudflare Worker environment variable — it is never sent to the browser
- The **Worker URL** is hidden behind the Pages Function proxy
- Files in a **private GitHub repo** are only accessible through authenticated API calls — not via raw GitHub URLs
- Consider adding **Cloudflare Access** in front of your Pages site if you want to restrict who can use the UI

---

## 📱 PWA / Install

Ace Clouds is a Progressive Web App. On a supported browser:

- **Android Chrome:** tap the install banner or **⋮ → Add to Home Screen**
- **iOS Safari:** tap **Share → Add to Home Screen**
- **Desktop Chrome/Edge:** click the install icon in the address bar

Once installed it caches the app shell for offline viewing. API calls (upload/download/delete) still require a network connection.

---

## 🛠 Local Development

No build step required — it's plain HTML + JS.

```bash
# Clone the repo
git clone https://github.com/<your-username>/ace-clouds.git
cd ace-clouds

# Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 8080
```

For local testing you'll need to either:
- Point `const WORKER = '/api'` in `script.js` directly to your Worker URL temporarily, **or**
- Run the Cloudflare Pages dev server: `npx wrangler pages dev .`

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Built with ❤️ using **Cloudflare Workers** · **Cloudflare Pages** · **GitHub REST API**

</div>
