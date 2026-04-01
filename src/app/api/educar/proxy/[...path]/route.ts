import { NextRequest, NextResponse } from "next/server";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* ─── Reverse‑proxy para Salesforce PNCE ─────────────────────
   Replica lo que hace bypass_final.py (Playwright):
   1. User-Agent de tablet Android
   2. Intercept pnce_SPA.js → debugMode = true
   3. Bloquea devtoolsDetector
   4. Reescribe URLs para que pasen por el proxy
   ──────────────────────────────────────────────────────────── */

const TARGET = "https://d1i0000001z2ruaq.my.salesforce-sites.com";
const PREFIX = "/api/educar/proxy";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

/* ── helpers ─────────────────────────────────────────── */
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BLOCKED_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "content-encoding",          // we decode ourselves
  "transfer-encoding",
]);

/* Script inyectado en el <head> del HTML para completar la
   emulación móvil/PWA del lado del cliente                 */
const INJECT = `<script>
(function(){
  // Mobile UA
  try{Object.defineProperty(navigator,'userAgent',{get:()=>'${MOBILE_UA}'})}catch(e){}
  try{Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5})}catch(e){}
  try{Object.defineProperty(navigator,'platform',{get:()=>'Linux armv8l'})}catch(e){}

  // Fake standalone PWA
  var _mm=window.matchMedia;
  window.matchMedia=function(q){
    if(q.indexOf('standalone')!==-1) return{matches:true,media:q,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return true}};
    return _mm.call(window,q);
  };

  // Kill devtoolsDetector preemptively
  window.devtoolsDetector={launch:function(){},stop:function(){},addListener:function(){},removeListener:function(){},isLaunch:function(){return false},setDetectDelay:function(){},isOpen:false};

  // Intercept fetch → rewrite root-relative paths through proxy
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('${PREFIX}'))u='${PREFIX}'+u;
    return _f.call(window,u,o);
  };
  // Intercept XHR
  var _xo=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('${PREFIX}'))u='${PREFIX}'+u;
    return _xo.apply(this,[m,u].concat(Array.prototype.slice.call(arguments,2)));
  };
})();
</script>`;

/* ── Proxy handler ───────────────────────────────────── */
async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { path } = await params;
  const targetPath = "/" + (path ?? []).join("/");
  const targetUrl = new URL(targetPath, TARGET);

  // Forward query params
  request.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  /* ── Build outgoing headers ─────────────── */
  const outHeaders: Record<string, string> = {
    "User-Agent": MOBILE_UA,
    Accept: request.headers.get("accept") || "*/*",
    "Accept-Language": "es-AR,es;q=0.9",
    "Accept-Encoding": "identity",   // avoid compressed responses we can't edit
    "Sec-CH-UA-Mobile": "?1",
    "Sec-CH-UA-Platform": '"Android"',
  };

  // Rewrite Referer
  const ref = request.headers.get("referer");
  if (ref) {
    try {
      const ru = new URL(ref);
      outHeaders["Referer"] = TARGET + ru.pathname.replace(PREFIX, "");
    } catch { /* ignore */ }
  }

  const fetchOpts: RequestInit = {
    method: request.method,
    headers: outHeaders,
    redirect: "manual",
  };
  if (request.method === "POST") {
    fetchOpts.body = await request.arrayBuffer();
    const ct = request.headers.get("content-type");
    if (ct) outHeaders["Content-Type"] = ct;
  }

  let resp: Response;
  try {
    resp = await fetch(targetUrl.toString(), fetchOpts);
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo conectar con Salesforce", detail: String(e) },
      { status: 502 },
    );
  }

  /* ── Redirects: rewrite Location ────────── */
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get("location");
    if (loc) {
      let newLoc = loc;
      if (loc.startsWith("/")) newLoc = PREFIX + loc;
      else if (loc.startsWith(TARGET)) newLoc = PREFIX + loc.substring(TARGET.length);
      return NextResponse.redirect(new URL(newLoc, request.url), resp.status as 301 | 302 | 303 | 307 | 308);
    }
  }

  /* ── Build response headers (strip security) ─── */
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    if (!BLOCKED_HEADERS.has(k.toLowerCase())) respHeaders[k] = v;
  });

  /* ── Handle by content-type ─────────────── */
  const ct = resp.headers.get("content-type") || "";

  // ── JavaScript: debugMode bypass + devtools blocker ──
  if (ct.includes("javascript") || ct.includes("ecmascript")) {
    let body = await resp.text();

    // Block devtools detector completely
    if (body.toLowerCase().includes("devtoolsdetector") || body.toLowerCase().includes("devtools_detector")) {
      body = `window.devtoolsDetector={launch:function(){},stop:function(){},addListener:function(){},removeListener:function(){},isLaunch:function(){return false},setDetectDelay:function(){},isOpen:false};`;
    }

    // debugMode bypass (the core of bypass_final.py)
    body = body.replace(/const\s+debugMode\s*=\s*false\s*;/g, "const debugMode = true; /* BYPASSED */");
    body = body.replace(/var\s+debugMode\s*=\s*false\s*;/g, "var debugMode = true; /* BYPASSED */");
    body = body.replace(/let\s+debugMode\s*=\s*false\s*;/g, "let debugMode = true; /* BYPASSED */");

    respHeaders["content-type"] = "application/javascript; charset=utf-8";
    return new NextResponse(body, { status: resp.status, headers: respHeaders });
  }

  // ── HTML: rewrite URLs + inject overrides ──
  if (ct.includes("html")) {
    let html = await resp.text();

    // Rewrite absolute URLs on same origin
    html = html.replace(new RegExp(escapeRe(TARGET), "g"), PREFIX);

    // Rewrite root-relative URLs in href/src/action attributes
    html = html.replace(/(href|src|action)="\//g, `$1="${PREFIX}/`);
    html = html.replace(/(href|src|action)='\//g, `$1='${PREFIX}/`);

    // Inject client-side overrides
    html = html.replace(/<head[^>]*>/i, (match) => match + INJECT);

    respHeaders["content-type"] = "text/html; charset=utf-8";
    return new NextResponse(html, { status: resp.status, headers: respHeaders });
  }

  // ── CSS: rewrite url() references ──
  if (ct.includes("css")) {
    let css = await resp.text();
    css = css.replace(/url\(\s*(['"]?)\//g, `url($1${PREFIX}/`);
    respHeaders["content-type"] = "text/css; charset=utf-8";
    return new NextResponse(css, { status: resp.status, headers: respHeaders });
  }

  // ── Everything else: pass through ──
  const body = await resp.arrayBuffer();
  return new NextResponse(body, { status: resp.status, headers: respHeaders });
}

export const GET = handle;
export const POST = handle;
