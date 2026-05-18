import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Carrot",
  description: "Sistema unificado de monitoreo de red y gestión de predios",
  manifest: `${basePath}/manifest.json`,
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      {basePath ? (
        <Script
          id="base-path-runtime-patch"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  var basePath = ${JSON.stringify(basePath)};
  if (!basePath || window.__carrotBasePathPatch) return;
  window.__carrotBasePathPatch = true;

  function shouldPrefix(pathname) {
    return pathname === "/api" || pathname.indexOf("/api/") === 0 || pathname === "/uploads" || pathname.indexOf("/uploads/") === 0;
  }

  function shouldNavigateInsideDemo(pathname) {
    return pathname === "/login" || pathname === "/dashboard" || pathname.indexOf("/dashboard/") === 0;
  }

  function prefixed(pathname) {
    return pathname.indexOf(basePath + "/") === 0 || pathname === basePath ? pathname : basePath + pathname;
  }

  function rewriteUrl(value, includeNavigation) {
    if (typeof value !== "string") return value;

    try {
      if (value.charAt(0) === "/" && value.indexOf("//") !== 0) {
        if (value.indexOf(basePath + "/") === 0 || value === basePath) return value;
        var queryIndex = value.search(/[?#]/);
        var pathname = queryIndex === -1 ? value : value.slice(0, queryIndex);
        if (shouldPrefix(pathname) || (includeNavigation && shouldNavigateInsideDemo(pathname))) {
          return prefixed(value);
        }
        return value;
      }

      var url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) return value;
      if (url.pathname.indexOf(basePath + "/") === 0 || url.pathname === basePath) return value;
      if (shouldPrefix(url.pathname) || (includeNavigation && shouldNavigateInsideDemo(url.pathname))) {
        url.pathname = prefixed(url.pathname);
        return url.toString();
      }
    } catch (_) {
      return value;
    }

    return value;
  }

  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      if (typeof input === "string") return originalFetch.call(this, rewriteUrl(input, false), init);
      if (input instanceof URL) {
        var nextUrl = rewriteUrl(input.toString(), false);
        return originalFetch.call(this, nextUrl === input.toString() ? input : nextUrl, init);
      }
      if (input instanceof Request) {
        var rewritten = rewriteUrl(input.url, false);
        return originalFetch.call(this, rewritten === input.url ? input : new Request(rewritten, input), init);
      }
      return originalFetch.call(this, input, init);
    };
  }

  var originalOpen = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  if (originalOpen) {
    window.XMLHttpRequest.prototype.open = function (method, url) {
      arguments[1] = rewriteUrl(url, false);
      return originalOpen.apply(this, arguments);
    };
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!target || target.target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var href = target.getAttribute("href");
    var nextHref = rewriteUrl(href, true);
    if (nextHref !== href) {
      event.preventDefault();
      window.location.href = nextHref;
    }
  }, true);
})();`,
          }}
        />
      ) : null}
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          {children}
          <Toaster richColors position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
