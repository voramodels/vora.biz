# vora — opportunity map

The Vora hiring page. Pannable space canvas with interactive job planets.

---

## Run locally on your laptop, test from your phone

If your laptop and phone are on the same Wi-Fi, you can test from your phone in 60 seconds:

```bash
npm install
npm run dev
```

Vite will print two URLs:

```
  VITE ready in 312 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.42:5173/   ← open THIS one on your phone
```

Open the **Network** URL on your phone in Safari/Chrome. Refresh after edits.

---

## Deploy publicly to test from anywhere (Vercel — free, 5 minutes)

### Option 1: GitHub + Vercel dashboard (recommended for ongoing iteration)

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "initial"
   gh repo create vora-opportunity-map --public --source=. --push
   ```
   (Or create the repo on github.com manually and push.)

2. Go to https://vercel.com → "Add New Project" → import the repo
3. Vercel auto-detects Vite. Click **Deploy**.
4. ~90 seconds later you get a URL like `vora-opportunity-map.vercel.app`
5. Every push to main auto-redeploys.

### Option 2: Vercel CLI (one-shot deploy, no GitHub needed)

```bash
npm install -g vercel
vercel
```

Follow the prompts. First deploy creates the project, gives you a public URL. Subsequent runs of `vercel` redeploy in seconds.

### Option 3: Netlify Drop (zero setup)

```bash
npm install
npm run build
```

Then drag the `dist/` folder onto https://app.netlify.com/drop. Instant public URL. Good for one-off testing.

---

## Test in IG/TikTok in-app browser

Once you have a public URL:

1. DM the URL to yourself on Instagram
2. Tap the link from inside IG — it opens in IG's in-app browser
3. This is exactly what your VAs will see when clicking your IG bio link
4. Test drag, tap, planet expansion, panel open

For TikTok, same flow via TikTok DM.

---

## File structure

```
vora-deploy/
├── package.json
├── vite.config.js
├── index.html             ← viewport meta + base CSS
├── src/
│   ├── main.jsx           ← React entry
│   └── vora-opportunity-map.jsx   ← the artifact
└── .gitignore
```

To update the page, edit `src/vora-opportunity-map.jsx` and either redeploy or `npm run dev` for live reload.
