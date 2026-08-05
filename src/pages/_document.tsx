// Override del Document por defecto de Next.js para proyectos App Router.
//
// Contexto (ZAL-95): el build prerenderizaba /404 usando el Document
// interno (next/dist/.../pages/_document.js), que llama `useHtmlContext()`
// directamente. En App Router puro ese contexto solo lo monta el runtime
// de Pages Router (no el flujo de prerender de /404), por lo que
// `useHtmlContext()` throws "<Html> should not be imported outside of
// pages/_document" y rompe `pnpm build` en `Generating static pages`.
//
// Este Document propio usa el <Html> público de `next/document` y lo
// envuelve con HtmlContext.Provider para que el prerender del 404 / _error
// interno tenga contexto válido. Solo aplica a la compilación de la
// Pages Router shim; el routing real sigue en src/app/ + src/app/layout.tsx
// (App Router, lowercase <html>).

import * as React from "react";
import { Html, Head, Main, NextScript } from "next/document";
import { HtmlContext } from "next/dist/shared/lib/html-context.shared-runtime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctxValue: any = {
  docComponentsRendered: { Html: false, Head: false, NextScript: false, Main: false },
  buildManifest: { polyfillFiles: [], devFiles: [], lowPriorityFiles: [] },
  __NEXT_DATA__: { page: "/_error", scriptLoader: [] },
  dangerousAsPath: "/404",
  assetPrefix: "",
  assetQueryString: "",
  isDevelopment: false,
  crossOrigin: undefined,
  head: [],
  headTags: [],
  html: "",
  inAmpMode: false,
  hybridAmp: false,
  styles: [],
  locale: "es",
  scriptLoader: { beforeInteractive: [], afterInteractive: [], lazyOnload: [], worker: [] },
  disableOptimizedLoading: false,
  unstable_runtimeJS: undefined,
  unstable_JsPreload: undefined,
  optimizeCss: false,
  experimentalClientTraceMetadata: undefined,
  nextFontManifest: undefined,
};

export default function Document() {
  return (
    <HtmlContext.Provider value={ctxValue}>
      <Html lang="es">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    </HtmlContext.Provider>
  );
}