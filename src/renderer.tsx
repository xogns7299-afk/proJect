import { jsxRenderer } from 'hono/jsx-renderer'

// 첫 화면이 그려지기 전에 테마를 정해야 밝은 화면이 번쩍이지 않는다
const themeBoot = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>proJect</title>
        <link rel="icon" type="image/png" href="/static/img/favicon.png" />
        <link rel="apple-touch-icon" href="/static/img/icon-192.png" />
        <link rel="manifest" href="/static/manifest.webmanifest" />
        <meta name="theme-color" content="#1f1b17" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }}></script>
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body>
        {children}
        <script type="module" src="/static/js/app.js"></script>
      </body>
    </html>
  )
})
