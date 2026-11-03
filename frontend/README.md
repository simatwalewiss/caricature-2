# Caricature Booth (frontend)

Event kiosk app: a guest takes a photo (or uploads one), picks a style, and gets an AI caricature they can print.

- **Live:** https://rdd-caricature-bzgxhqbsb4fxgmch.northeurope-01.azurewebsites.net/
- **Backend API** (separate App Service, not in this repo): `https://caricature-e2ckfydxhhbcduft.northeurope-01.azurewebsites.net`, set in `API_BASE` at the top of `src/App.js`
- **Stack:** Create React App (React 19), single component in `src/App.js` with its CSS inlined in the `CSS` string

## Run locally

```bash
npm ci
npm start            # http://localhost:3000
```

Camera capture needs `localhost` or HTTPS.

## Theming for an event

All of the theme lives in `src/App.js`:

- **Colours:** the `:root` tokens at the top of the `CSS` string (`--accent`, `--accent-bright`, `--accent-deep`, `--gradient`, `--bg`, …)
- **Background art:** `public/theme-bg.jpg`, drawn by the `.rdd-bg` layer
- **Copy:** tagline, title, and footer hashtags in the JSX near the bottom
- **Style presets:** `THEME_SUGGESTIONS`

If you change the CSS, bump `STYLE_ID` so the injected style tag is refreshed.

## Deploy (Azure App Service, local git)

Pushing to the App Service's git remote runs an Oryx build (`npm install` + `npm run build`) and serves `build/`.

```bash
git remote add azure 'https://$rdd-caricature@rdd-caricature-bzgxhqbsb4fxgmch.scm.northeurope-01.azurewebsites.net:443/rdd-caricature.git'
git push azure master
```

Git Credential Manager asks for the deployment password; get it from the App Service **Deployment Center → Local Git/FTPS credentials**. Never commit it.

Check the build log in Kudu (`https://rdd-caricature-bzgxhqbsb4fxgmch.scm.northeurope-01.azurewebsites.net`) → Deployments.
