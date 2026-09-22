import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web-only document shell (Expo Router uses this for the static web export;
// native ignores it). We load Jost from Google Fonts and apply it app-wide.
// The !important is deliberate: react-native-web sets a system font-family on
// each text element via generated classes, and this is the simplest reliable
// way to override that everywhere. Existing fontWeight values keep working —
// the 400–700 weights are all loaded.
const globalCss = `
* { font-family: 'Jost', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif !important; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <ScrollViewStyleReset />
        <style>{globalCss}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
