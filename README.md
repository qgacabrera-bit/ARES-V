# ARES-V — Augmented Reconnaissance & EVA System

**ARES-V** is an interactive 3D Mars orbital-to-surface exploration and astronaut EVA simulator built with React, Three.js (`@react-three/fiber`), and NASA planetary datasets.

Select a historic NASA rover landing corridor from orbit, plunge through the Martian atmosphere to the surface, and conduct a first-person geological EVA—balancing oxygen, thermal reserves, stamina, and pack mass while coring priority rock specimens along real rover traverse routes.

---

## Features

- **Planetary Orbital Recon (`380 km` Orbit)**
  - Interactive 3D Mars globe with **Optical** (JPL Mars Trek / MRO MARCI), **Thermal** (Odyssey THEMIS), and **Subsurface Ice** (MRO SHARAD) data layers.
  - Smooth animated **orbital descent**, **ascent to orbit**, and **suborbital site-to-site transfers**.

- **Four Real NASA Landing Sites & Rovers**
  - **Jezero Crater** — *Perseverance* (`Octavia E. Butler Landing`)
  - **Mount Sharp, Gale Crater** — *Curiosity* (`Bradbury Landing`)
  - **Meridiani Planum & Endeavour Crater** — *Opportunity* (`Challenger Memorial Station`)
  - **Gusev Crater & Columbia Hills** — *Spirit* (`Columbia Memorial Station`)

- **First-Person Surface EVA & Suit Safety**
  - **4 Visor Data Layers (`1`–`4`):** Optical, Topo / Obstacles (`>25°` slope & boulder hazard masks), USGS Geology, and Rad / Weather.
  - **Physiology & Load Management:** Live `O₂`, thermal/heater reserve, stamina, heart rate, and `25 kg` core pack limit with a real-time **Suit Status & Safety Advisory** bar.
  - **Lander Airlock Resupply (`E`):** Offload cored specimens into the lander vault and replenish `O₂` and heater reserves.

- **Diegetic Field Slate (`M` / `Tab`)**
  - **Map & Route:** Live 3×3 sector map with slope-aware safe-traverse pathfinding.
  - **Samples:** Mineral readouts, discovery notes, and specimen imagery for all 24 priority cores (`6` per site).
  - **Sites & Rovers:** Unlockable heritage archive for every Sol 0 touchdown monument and NASA rover.

- **Procedural Mission Audio & Expedition Certificate**
  - Zero-asset Web Audio API soundscapes (exertion-responsive suit breathing, heartbeat, laser spectrometer hum, radio chirps, and orbital thrusters) with a HUD mute toggle.
  - **Global Expedition Report** tracking cores vaulted (`0/24`), landmarks unlocked (`0/8`), EVA distance, surface time, and peak radiation—with Markdown report export and a downloadable **Planetary Field Geologist Certificate (PNG)** upon 100% completion.

---

## Controls

| Key | Action |
| :--- | :--- |
| `W A S D` | Move |
| `Shift` | Sprint |
| `Mouse` | Look (click viewport to lock pointer) |
| `E` | Scan & core sample / Resupply at lander / Inspect rover or Sol 0 monument |
| `M` / `Tab` | Toggle Field Slate |
| `1` – `4` | Switch orbital / visor data layers |
| `P` | Plot / clear safe route |
| `R` | Trigger terrain radar pulse |
| `F` | Toggle suit headlamp |
| `O` | Return to orbit |
| `Esc` | Mission menu |

---

## Tech Stack

- **Frontend:** React 18, Vite 6, Tailwind CSS 4, Zustand 5, Lucide Icons
- **3D & Shaders:** Three.js, `@react-three/fiber`, `@react-three/drei`
- **Data Sources:** NASA JPL Mars Trek (WMTS), MGS MOLA, Mars Odyssey THEMIS, MRO HiRISE / SHARAD, Curiosity RAD, USGS Astrogeology

---

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

---

## Deployment (Render)

This repository includes a [`render.yaml`](./render.yaml) Blueprint configured for Render Static Sites (`npm install && npm run build`, publishing `./dist` with SPA routing to `/index.html`).

---

## Team — Avengineers

- Gabriel Cabrera
- Ron Von Angeles
- Angelo Base
- Christian Bondoc
- Jomari Iglesia
