const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite construir en un directorio aparte y recien despues cambiarlo por el que se
  // esta sirviendo (ver scripts/update.sh). Si se construye sobre .next en caliente, el
  // server viejo se queda sin los chunks que ya mando al navegador y tira
  // "Cannot read properties of undefined (reading 'clientModules')" hasta que reinicia.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' https://office.thnet.com.ar${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://office.thnet.com.ar",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              `connect-src 'self' https://*.tile.openstreetmap.org https://office.thnet.com.ar${isDev ? " ws://localhost:3000" : ""}`,
              "frame-src 'self' https://www.youtube-nocookie.com https://office.thnet.com.ar",
              "object-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/api/((?!meraki).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
