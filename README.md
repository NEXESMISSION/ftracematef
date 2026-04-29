# Trace Mate — React + Vite

The same landing page and login page, rebuilt as a React app with Vite.
Same design, same responsiveness, same animations — just faster, modular, and ready to scale.

## Stack
- **React 18** — component-based UI
- **Vite 5** — instant dev server, fast HMR, blazing-fast builds
- **React Router** — client-side routing for `/` (landing) and `/login`

## Getting started

```bash
cd app
npm install
npm run dev
```

Vite will open `http://localhost:5173` in your browser.

## Build for production

```bash
npm run build
npm run preview   # locally preview the production build
```

The optimized build is output to `app/dist/` — drop that on any static host
(Vercel, Netlify, Cloudflare Pages, GitHub Pages, S3+CloudFront, etc.).

## Project structure

```
app/
├── public/
│   └── images/                  ← all assets (served from /images/...)
├── src/
│   ├── components/              ← one file per visual block
│   │   ├── SvgDefs.jsx          shared watercolor SVG filters
│   │   ├── Nav.jsx
│   │   ├── Hero.jsx
│   │   ├── Marquee.jsx
│   │   ├── HowItWorks.jsx
│   │   ├── Gallery.jsx
│   │   ├── Pricing.jsx
│   │   ├── Footer.jsx
│   │   ├── WelcomeOverlay.jsx   first-visit t1→t2 animation
│   │   ├── CatPopup.jsx         floating bottom-right CTA
│   │   └── VideoModal.jsx       YouTube modal
│   ├── pages/
│   │   ├── Landing.jsx          /     (composes all sections)
│   │   └── Login.jsx            /login (email/Google sign-in)
│   ├── styles/
│   │   ├── globals.css          all the landing page styles
│   │   └── login.css            login-specific styles
│   ├── App.jsx                  router + image protection
│   └── main.jsx                 entry: scroll-restoration off, mount React
├── index.html                   Vite root template
├── package.json
└── vite.config.js
```

## Notes
- **Image protection** is wired in `App.jsx` via a `useEffect` that
  blocks `contextmenu` and `dragstart` on every `<img>`.
- **Welcome overlay** uses `sessionStorage` to play the t1/t2 sequence
  only once per session (subsequent reloads stay quiet).
- **Video modal** state lives in `Landing.jsx` and is passed down — the
  Hero's "See it in action" button calls `openVideo(id)` to open it.
- **CTAs** that say "Try it Now" / "Get the app →" use `<Link to="/login">`
  for client-side navigation — no full page reload.
- To wire up real auth, replace the `// TODO` block in `pages/Login.jsx`
  with your auth provider of choice.
- To enable the demo video, replace `'YOUR_VIDEO_ID'` in `Hero.jsx` with
  your real YouTube video ID.
