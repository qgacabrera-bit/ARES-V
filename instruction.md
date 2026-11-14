Integrate a lightweight, diegetic mission narrative (**"ARES-1 // The Meridian Relay"**) into **ARES-V** so users feel immersed as a NASA field geologist without adding clutter or pop-up text walls. **Preserve all existing 3D scenes, shaders, terrain physics, and minimalist UI styling.**

### 1. Diegetic Radio Comms Banner (`VisorHUD.jsx`)
- Add a sleek, auto-dismissing **1-line Comms Ticker** directly beneath the top compass bar (`max-w-xl mx-auto px-4 py-1.5 rounded-full bg-slate-950/75 backdrop-blur-md border border-cyan-500/30 text-xs font-mono text-cyan-100`).
- Trigger concise, contextual radio dispatches (fading out automatically after 6 seconds) based on real gameplay events:
  - **Surface Deployment:** `"CAPCOM // Valkyrie touchdown confirmed. Raise Field Slate [M] to sync NASA rover telemetry and plot your route."`
  - **First Sample Collected:** `"SCIENCE // Spectral match verified against NASA archive. Pack mass updated—monitor stamina on >15° slopes."`
  - **High Encumbrance (`>= 2` carried cores) or Low O₂ (`< 30%`):** `"FLIGHT // Metabolic O₂ burn elevated. Return to Lander airlock to offload cores and replenish reserves."`
  - **All Site Cores Vaulted:** `"CAPCOM // Priority cores secured in ascent vault. Dust front approaching—cleared for orbital return."`

### 2. Mission Chapter Briefings (`landingZones.js` & Pre-Deployment Card)
- Update each site's `1-sentence` mission brief in `landingZones.js` to connect real NASA rover history to the astronaut's current objective:
  - **Jezero Crater:** `"Follow Perseverance's delta traverse upslope to core ancient carbonate-mudstone strata before seasonal dust opacity spikes."`
  - **Mount Sharp:** `"Ascend Curiosity's Aeolis Mons corridor to sample hardened boxwork mineral veins formed by Mars's last groundwater."`
  - **Meridiani Planum:** `"Survey Opportunity's hematite-rich plains and crater rims to map ancient acidic surface water horizons."`
  - **Gusev Crater:** `"Traverse Spirit's Columbia Hills ridge to recover hydrothermal opaline silica deposits."`
- Include a compact 2-sentence **"Discovery Note"** on each sample target that unlocks in the `SPECTRA / REF` tab once vaulted.

### 3. Opening Mission Context in `ABOUT` Modal
- Add a concise 3-line **"MISSION BRIEF // SOL 412"** block at the top of the `ABOUT` modal framing the user as the Lead Field Geologist aboard *Lander Valkyrie*, bridging orbital NASA datasets with human field intuition.