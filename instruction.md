Refocus **ARES-V** (*Augmented Reconnaissance & EVA System – Visor*) to center the user experience around an **authentic NASA EVA Field Geology & Traverse Mapping Device ("ARES-V Field Slate")** held by the astronaut in first-person POV, directly fulfilling the NASA Space Apps challenge objective of providing a layered, NASA-data-driven surface exploration tool.

### 1. Replace Generic HUD Bars with the Interactive "ARES-V Field Slate" (`FieldSlateDevice.jsx`)
- **Physical 3D Handheld / Forearm Device:** Render a ruggedized NASA-style EVA tablet/scanner held in the astronaut's left hand/forearm in the first-person viewport.
  - **Peripheral Stowed View (Default):** Tilted cleanly in the lower-left corner showing the active Curiosity-style traverse route line, heading arrow, and next geologic waypoint distance.
  - **Active Inspection View (`[M]` or Right-Click):** Smoothly brings the device into center-left focus and unlocks the cursor so the astronaut can click tabs, toggle NASA data layers, and inspect waypoints directly on the device's glass screen.
- **3 Functional Tabs on the Device Screen (Minimalist, High-Signal UI):**
  1. **`[MAP / ROUTE]` (JPL Mars Trek + USGS Geologic Mapping):**
     - Displays a live 3D holographic/topographic map of the local site (highlighting **Mount Sharp Boxwork Formations** in Gale Crater and **Jezero Crater Delta**).
     - Includes **4 toggleable NASA data layer switches** directly on the tablet bezel:
       - `OPTICAL` (HiRISE / Mastcam surface mosaic)
       - `TOPO / OBSTACLES` (HiRISE DEM contours + red hazard masks over boulder fields and >25° slopes)
       - `USGS GEOLOGY` (Color-coded geologic units: mudstone, sulfate veins, boxwork ridges)
       - `RAD / WEATHER` (Curiosity RAD ionizing radiation & dust opacity zones)
     - **Annotated Curiosity-Style Traverse Route:** Draws a dashed cyan safe-route line from the Lander around large rock obstacles to each science station, accompanied by ground-projected AR waypoint markers in the 3D world.
  2. **`[SPECTRA / REF]` (Perseverance Raw Gallery + Rover Reference):**
     - When near a rock target, displays a compact **NASA Reference Verification Card** on the device showing the target's real NASA mission counterpart (e.g., *Curiosity Sol 4400+ Boxwork Ridge* or *Perseverance Cheyava Falls*), a real reference thumbnail from NASA's Mars Rover Raw Images Gallery, and key mineral/chemical signatures so the astronaut can confirm the sample before coring.
  3. **`[EVA MOBILITY]` (Suit Safety & Return Calculator):**
     - Shows real-time **Suit O₂**, **Core Temp (-63°C ambient)**, **Stamina**, and **Carried Sample Mass (`kg`)**, plus a dynamic **"Safe Return Margin"** indicator that recalculates whether the astronaut has enough oxygen and stamina to climb back to the Lander given their current pack weight.

### 2. Clean Up the Outer Visor Viewport
- Remove any cluttered floating text boxes from the main screen. Keep only:
  - Top-left micro-watermark: `ARES-V // EVA FIELD SYSTEM`
  - Top-center slim compass with `LANDER` bearing and active `WAYPOINT` bearing
  - Center subtle reticle that shifts to `[E] SCAN TARGET` or `[E] OFFLOAD & RESUPPLY AT LANDER` only when within 4 meters of an interactive object
  - Bottom single-line minimalist hotkey bar (`[M] FIELD SLATE` · `[1-4] DATA LAYERS` · `[R] RADAR PULSE` · `[E] INTERACT`)

### 3. Preserve Realistic Lander & Encumbrance Mechanics
- Keep the Mars Lander at spawn with finite O₂/power reserves, sample offloading (`0 kg` reset), and realistic uphill stamina/oxygen penalties as sample weight increases.