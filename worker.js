/**
 * ╔══════════════════════════════════════════════════╗
 *  Ace Clouds — Cloudflare Worker Backend
 *  Serverless cloud storage via GitHub REST API
 * ╚══════════════════════════════════════════════════╝
 *
 * Environment Variables (Cloudflare Dashboard → Workers → Settings → Variables):
 *   GITHUB_TOKEN  — GitHub Personal Access Token (needs "repo" or "contents" scope)
 *   GITHUB_OWNER  — GitHub username or org        e.g. "vikaspatel22062009"
 *   GITHUB_REPO   — Repository name               e.g. "ace-clouds-storage"
 *   GITHUB_BRANCH — Branch to use (default: "main")
 *
 * Endpoints:
 *   GET  /?list=1           → List all files in repo  (returns JSON array)
 *   GET  /?name=<file>      → Download a file         (returns raw text)
 *   POST /?name=<file>      → Upload or overwrite      (body = raw content)
 *   DELETE /?name=<file>    → Delete a file
 *   OPTIONS *               → CORS preflight
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {

    // ── CORS preflight ──────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Validate env vars ───────────────────────────────────
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return reply(500, "Server misconfigured: missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO.");
    }

    const url    = new URL(request.url);
    const list   = url.searchParams.get("list");
    const name   = (url.searchParams.get("name") || "").trim();
    const branch = env.GITHUB_BRANCH || "main";

    try {

      // ── LIST all files ────────────────────────────────────
      if (request.method === "GET" && list === "1") {
        return await handleList(env, branch);
      }

      // ── File-level operations require ?name= ─────────────
      if (!name) {
        return reply(400, "Missing required query param: ?name= or ?list=1");
      }

      if (name.includes("..") || name.startsWith("/")) {
        return reply(400, "Invalid filename.");
      }

      switch (request.method) {
        case "GET":    return await handleGet(name, env, branch);
        case "POST":   return await handlePost(name, request, env, branch);
        case "DELETE": return await handleDelete(name, env, branch);
        default:       return reply(405, "Method not allowed.");
      }

    } catch (err) {
      console.error("[AceClouds]", err);
      return reply(500, `Internal error: ${err.message}`);
    }
  },
};

// ── LIST — return all files as JSON ─────────────────────────────────────────
async function handleList(env, branch) {
  const res = await gh("GET", `contents`, null, env, branch);

  if (res.status === 404) {
    return replyJSON(200, []);
  }
  if (!res.ok) {
    const t = await res.text();
    return reply(502, `GitHub error: ${t}`);
  }

  const data  = await res.json();
  // Only return files (type === "file"), not directories
  const files = Array.isArray(data)
    ? data
        .filter(item => item.type === "file")
        .map(item => ({ name: item.name, size: item.size, sha: item.sha, type: item.type }))
    : [];

  return replyJSON(200, files);
}

// ── GET — fetch a single file ────────────────────────────────────────────────
async function handleGet(name, env, branch) {
  const res = await gh("GET", `contents/${encodeURIComponent(name)}`, null, env, branch);

  if (res.status === 404) return reply(404, `File not found: ${name}`);
  if (!res.ok) return reply(502, `GitHub error: ${await res.text()}`);

  const data    = await res.json();
  const content = atob(data.content.replace(/\n/g, ""));
  return new Response(content, {
    status: 200,
    headers: { ...CORS, "Content-Type": detectMime(name) },
  });
}

// ── POST — create or update file ─────────────────────────────────────────────
async function handlePost(name, request, env, branch) {
  const body    = await request.text();
  const encoded = btoa(unescape(encodeURIComponent(body)));

  // Check for existing SHA (required to update)
  let sha;
  const existing = await gh("GET", `contents/${encodeURIComponent(name)}`, null, env, branch);
  if (existing.ok) sha = (await existing.json()).sha;

  const payload = {
    message: sha ? `Update ${name} via Ace Clouds` : `Upload ${name} via Ace Clouds`,
    content: encoded,
    branch,
    ...(sha ? { sha } : {}),
  };

  const res = await gh("PUT", `contents/${encodeURIComponent(name)}`, payload, env, branch);
  if (!res.ok) return reply(502, `GitHub error: ${await res.text()}`);

  return reply(200, `File ${sha ? "updated" : "created"}: ${name}`);
}

// ── DELETE — remove a file ────────────────────────────────────────────────────
async function handleDelete(name, env, branch) {
  const getRes = await gh("GET", `contents/${encodeURIComponent(name)}`, null, env, branch);
  if (getRes.status === 404) return reply(404, `File not found: ${name}`);
  if (!getRes.ok)            return reply(502, `GitHub error: ${await getRes.text()}`);

  const { sha } = await getRes.json();

  const delRes = await gh("DELETE", `contents/${encodeURIComponent(name)}`, {
    message: `Delete ${name} via Ace Clouds`,
    sha,
    branch,
  }, env, branch);

  if (!delRes.ok) return reply(502, `GitHub error: ${await delRes.text()}`);
  return reply(200, `File deleted: ${name}`);
}

// ── GitHub REST helper ────────────────────────────────────────────────────────
async function gh(method, path, body, env, branch) {
  const base = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${path}`;
  const url  = method === "GET" ? `${base}?ref=${encodeURIComponent(branch)}` : base;

  return fetch(url, {
    method,
    headers: {
      "Authorization": `token ${env.GITHUB_TOKEN}`,
      "Content-Type":  "application/json",
      "User-Agent":    "AceClouds-Worker/1.0",
      "Accept":        "application/vnd.github.v3+json",
    },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────
function reply(status, text) {
  return new Response(text, { status, headers: { ...CORS, "Content-Type": "text/plain" } });
}

function replyJSON(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── MIME detection ────────────────────────────────────────────────────────────
function detectMime(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return ({
    txt:"text/plain", md:"text/markdown", html:"text/html", htm:"text/html",
    css:"text/css", js:"application/javascript", json:"application/json",
    xml:"application/xml", csv:"text/csv", svg:"image/svg+xml",
    png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif",
    pdf:"application/pdf",
  })[ext] || "application/octet-stream";
}
