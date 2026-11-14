  SUpgrade **ARES-V** (*Augmented Reconnaissance & EVA System – Visor*) in first-person EVA mode (`viewMode: 'EVA'`) by adding a **Mars Lander / Spaceship Base** at the astronaut's spawn point, realistic **Martian EVA survival physiology (Oxygen, Body Temperature, Stamina)**, and a **sample weight encumbrance & offloading loop**, while preserving our high-abstraction, clutter-free visor HUD.

### 1. Mars Lander / Spaceship at Spawn (`LanderBase.jsx`)
- **3D Lander Mesh:** Place a stylized, NASA-authentic Mars Descent/Ascent Lander (`LanderBase.jsx`) 8 meters behind the astronaut's initial spawn point (`position={[0, terrainY, 8]}`), complete with landing struts, metallic thermal foil accenting, a pressurized airlock hatch with a warm beacon light, and an external **Sample Return Cache Locker**.
- **Finite Lander Reserve Pool:** The lander holds a **limited mission reserve** (e.g., `O2 Reserve: 300%` [3 full tank refills], `Battery/Heater Reserve: 300%`), forcing the astronaut to manage sorties carefully rather than having infinite supplies.
- **Airlock Resupply & Sample Offload Interaction:**
  - Walking within 4 meters of the lander's airlock/cargo bay displays a minimal diegetic reticle prompt: **`[E] AIRLOCK RESUPPLY & OFFLOAD SAMPLES`**.
  - Pressing `E` transfers all carried rock cores from the astronaut's pack into the Lander's Sample Return Vault (permanently banking them toward mission completion), resets the astronaut's carried weight to `0 kg`, and replenishes the astronaut's suit **Oxygen** and **Thermal Heater** back to `100%`—deducting the exact amount used from the Lander's finite reserve pool.

### 2. Realistic Martian EVA Physiology & Encumbrance (`useMissionStore.js` & `FirstPersonRig.jsx`)
Simulate realistic 0.38g Martian surface physics inside `useFrame` (scaled cleanly for an engaging 5–10 minute hackathon gameplay loop):
- **Suit Oxygen (`oxygen: 0–100%`):**
  - Depletes steadily during EVA (`~0.18%/sec` at rest), and **depletes faster when sprinting (`Shift`) or carrying heavy rock samples** (higher metabolic respiration rate).
  - Dropping below `20%` triggers a subtle amber visor edge vignette and soft breathing cadence cue; hitting `0%` triggers an emergency abort back to orbit.
- **Body / Suit Core Temperature (`bodyTempC: 37.0°C` nominal):**
  - Mars ambient surface temperature averages **-63°C** (colder in shadowed craters or during high dust opacity).
  - The suit's active thermal loop keeps core temp near `37.0°C`, slowly draining suit battery/thermal capacity. Standing in deep crater shadows or moving slowly causes gradual cooling (`37.0°C -> 35.0°C` hypothermia warning), whereas sprinting generates metabolic body heat. Returning to the Lander warms the astronaut back to `37.0°C`.
- **Stamina & Sample Encumbrance (`stamina: 0–100%`, `carriedMassKg`):**
  - Each collected Martian rock/regolith core adds realistic mass (`+4.5 kg` to `+7.0 kg` per core + containment tube, up to a max pack capacity of `~25 kg` / 4 cores).
  - **Encumbrance Penalty:** As `carriedMassKg` increases:
    1. **Stamina drains proportionally faster** when walking uphill (`slope > 15°`) or sprinting (`Shift`), and **regenerates slower** when resting.
    2. **Walk/sprint speed subtly decreases** (`-5%` per carried sample) and camera head-bob feels slightly heavier.
    3. **Metabolic O₂ burn increases** (`+12%` per carried sample).
  - Offloading samples at the Lander immediately removes the encumbrance penalty so the astronaut can head back out for the next sortie.

### 3. Minimalist Visor & Wrist Telemetry Integration
- **Keep the Viewport Clear:** Do NOT add bulky text boxes or giant bars across the screen.
- **Compact Diegetic Readouts:**
  - Integrate **O₂ %**, **CORE TEMP (°C)**, **STAMINA**, and **PACK LOAD (`X.X / 25 KG`)** cleanly onto the **Wrist Tablet bezel** (`WristTabletRig.jsx`) and as ultra-slim, low-opacity micro-bars (`4px` height) tucked into the bottom-left visor corner.
  - Display a subtle distance/direction marker (`LANDER: 42m`) on the top compass strip so the astronaut can always navigate back to the spaceship when O₂ or pack capacity gets critical.
  - Show a compact Lander Reserve counter (`SHIP O2: 240% | VAULT: 2/6 CORES`) only when looking at or standing near the Lander airlock.