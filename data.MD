# Vehicle Physics Realism Audit 🏎️

A system-by-system analysis of what is already realistic vs. what is still **not 1:1 with real-world physics**.

> [!NOTE]
> **Last updated: 2026-06-23** — Full re-audit after major physics refactors including [TireModel.ts](file:///d:/trifilpla/components/objects/TireModel.ts), [TireCompound.ts](file:///d:/trifilpla/components/objects/TireCompound.ts), [SuspensionModel.ts](file:///d:/trifilpla/components/objects/SuspensionModel.ts), and [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts).

---

## Rating Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Realistic / close to real |
| ⚠️ | Partially realistic — has the right idea but simplifies significantly |
| ❌ | Not realistic — arcade or missing entirely |
| 🆕 | New since previous audit |

---

## 1. Tire Model (Lateral Forces)

**Current**: Full Pacejka with B/C/D/E shape params → `D × sin(C × atan(B×α − E×(B×α − atan(B×α))))` in [TireModel.ts](file:///d:/trifilpla/components/objects/TireModel.ts).

| Aspect | Status | Detail |
|--------|--------|--------|
| Magic formula shape | ✅ 🆕 | Now uses all 4 Pacejka params: stiffness (B=8.0), shape (C=1.3), peak (D=grip×load), curvature (E=0.92). Previously only used `sin(atan(B*α))` |
| Post-peak grip drop-off | ✅ 🆕 | Smooth 22% drop-off over 0.65 rad past peak at 0.16 rad. Tunable per-axis. Previously hardcoded at 20% over 0.4 rad |
| Cornering stiffness per car | ✅ | Each car has `corneringStiffnessFront/Rear` in [CarDatabase.ts](file:///d:/trifilpla/components/config/CarDatabase.ts) |
| **Tire temperature model** | ✅ 🆕 | **Now implemented in [TireCompound.ts](file:///d:/trifilpla/components/objects/TireCompound.ts).** Each compound has `optimalTemperature`, `temperatureWindow`, `coldGripFloor`, and `heatRate`. Cold tires start at 25°C with reduced grip (76–88% floor), peak at optimal, and overheat above window with 24% degradation. Heat from speed, slip angle, slip ratio, and braking |
| **Tire pressure model** | ✅ 🆕 | **Implemented.** Each compound has a recommended cold pressure and tolerance. Hot pressure follows the ideal-gas relationship, while under/over-inflation changes grip, cornering stiffness, heat generation, and wear |
| **Load sensitivity (tire)** | ⚠️ | `computeAxleGripLimit()` has load sensitivity (`1.08 - 0.16*(loadRatio-1)`), but real tires have more complex non-linear degression curves |
| **Camber effects** | ✅ 🆕 | **Implemented.** Per-car front/rear camber settings modify lateral grip, cornering stiffness, and straight-line traction. Suspension upgrades add moderate negative camber; excessive camber reduces usable grip |
| **Combined slip (friction envelope)** | ✅ 🆕 | `combinedGripCircle()` now uses an **elliptical** friction envelope with `longitudinalScale=1.05` and `lateralScale=0.95`. Previously was a circular clamp. Tires can now produce slightly more grip longitudinally than laterally |
| **Relaxation length** | ✅ 🆕 | **Implemented via `relaxTireValue()`.** Front uses 0.10m, rear uses 0.12m relaxation length. Force builds over distance travelled, not instantly. Imported and used in `updateTirePhysics()` |

---

## 2. Tire Model (Longitudinal Forces)

| Aspect | Status | Detail |
|--------|--------|--------|
| Slip ratio computation | ✅ 🆕 | `computeSlipRatio()` in [TireModel.ts](file:///d:/trifilpla/components/objects/TireModel.ts) — normalized by max of wheel/ground speed |
| Wheelspin detection | ✅ | Excess drive force → wheel speed diverges from ground speed via `updateAxleWheelSpeed()` |
| **Longitudinal force through tire model** | ✅ 🆕 | **Fixed!** `computeLongitudinalForce()` is now called in the main physics loop. Drive and brake forces produce slip ratios, which generate traction via Pacejka. Previously forces were applied directly, bypassing the tire model entirely |
| **Per-axle wheel speed tracking** | ✅ 🆕 | `frontWheelSpeed` and `rearWheelSpeed` tracked independently. `updateAxleWheelSpeed()` uses binary search to invert the Pacejka curve for target slip, models excess force via wheel inertia (1.35 kg·m² per wheel), and clamps locked wheels at zero |
| Wheel inertia model | ✅ 🆕 | Uses `wheelInertiaPerWheel = 1.35 kg·m²` with proper `axleEquivalentMass = 2×I/r²` calculation. Previously was a flat 100 kg effective mass |

---

## 3. Drivetrain & Transmission

| Aspect | Status | Detail |
|--------|--------|--------|
| Gear ratios per car | ✅ | Database supports custom `gearRatios[]` and `finalDrive` |
| Auto-shift by RPM or speed schedule | ✅ | `shiftUpMph[]` schedule + RPM-based fallback |
| Shift time with upgrade modifiers | ✅ 🆕 | Shift interruption now depends on hardware: manual 0.38/0.24s, automatic 0.28/0.22s, dual-clutch 0.10/0.13s, reduced by gearbox and flywheel upgrades |
| **Rev-matching on downshift** | ✅ 🆕 | **Implemented!** Downshifts compute `revMatchTargetRpm` from target gear ratio and wheel speed, then smoothly blip RPM via exponential response (rate=18.0). No longer just an RPM jump |
| **Manual transmission controls** | ⚠️ 🆕 | Manual gearbox hardware and clutch behavior now exist for cars such as the S2000 and Ford GT, but shifts are still automatic because no player clutch, paddle, or H-pattern input has been added |
| Clutch slip at launch | ✅ 🆕 | Manual and dual-clutch transmissions now use a progressive launch engagement curve. Clutch upgrades increase capacity and engagement speed; transmitted wheel torque follows actual engagement instead of remaining fully locked |
| **Torque converter / dual-clutch** | ✅ 🆕 | Automatics now model stall RPM, torque multiplication, and converter coupling. Dual-clutch gearboxes shift faster and retain partial torque through shifts |
| Engine inertia | ⚠️ | Flywheel inertia is `0.05 + (0.15 - flywheelLevel×0.04) + 0.03` — functional but still simplified vs measured MOI curves |
| **Electric powertrain** | ✅ 🆕 | `powertrainType: 'electric'` for Cybertruck/Tesla — single-gear, no turbo spool, instant torque, regenerative engine braking at 1.15 m/s² vs 2.5 for combustion |

---

## 4. Engine Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Torque curve per car | ✅ | Custom `torqueCurve: TorquePoint[]` with linear interpolation in `sampleTorqueCurve()` |
| Rev limiter | ✅ | Oscillating cut at redline with 100 RPM sine wave |
| Turbo spool lag | ⚠️ | Spool still uses a compact 0→1 state, but boost now contributes to engine heat and follows smoothed throttle position rather than raw pedal input |
| **Engine friction model** | ✅ 🆕 | Engine losses now combine mechanical, viscous, RPM², pumping, cold-oil, and overheat friction. The same model drives gear/RPM-dependent engine braking instead of a flat deceleration |
| **Fuel system** | ✅ 🆕 | Per-car tank capacity, gasoline density, displacement, BSFC, RPM, torque, throttle, rich high-load operation, turbo enrichment, idle use, and overrun fuel cut now determine consumption. HUD shows liters remaining and L/h |
| **Engine temperature** | ✅ 🆕 | Lumped coolant/oil temperature now warms from ambient, responds to RPM/load/boost, receives speed-dependent cooling, adds cold friction, and removes up to 34% torque under severe overheating |
| **Natural aspiration induction** | ⚠️ 🆕 | Variable valve timing is now configurable with smooth engagement RPM and torque gain; the S2000 uses a 6000 RPM high-cam transition. Intake resonance remains simplified |

---

## 5. Aerodynamics

| Aspect | Status | Detail |
|--------|--------|--------|
| Drag force (Cd × A × ½ρv²) | ✅ | Proper aerodynamic drag formula with per-car Cd and frontal area |
| Downforce (lift coefficient) | ✅ | `liftCoefficient` creates speed-dependent downforce |
| Rolling resistance | ✅ | `rollingResistanceCoefficient` per car |
| **Yaw-dependent aero** | ✅ 🆕 | **Now implemented!** `yawDragMultiplier = 1.0 + min(2.0, |sin(driftAngle)| × 6.0)` — at high sideslip, drag increases up to 3× (real cars at 10°+ sideslip have 2-3× the drag). Previously missing entirely |
| **Pitch-dependent aero** | ❌ | Under braking (nose-down pitch), front downforce increases. Not modeled |
| **Ground effect** | ❌ | No ride-height-dependent underbody venturi effect |
| **Dirty air / slipstream** | ❌ | No drafting effect behind AI cars, no turbulent wake |

---

## 6. Weight Transfer

| Aspect | Status | Detail |
|--------|--------|--------|
| Longitudinal weight transfer | ✅ | Via [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts): `(sprungMass × accel × cgHeight) / wheelbase` |
| Lateral weight transfer | ✅ | `(sprungMass × lateralAccel × cgHeight) / trackWidth` with front/rear proportional split |
| Per-axle weight distribution | ✅ | `frontWeightDistribution` in database, clamped [0.32, 0.68] |
| Transfer clamping (no negative load) | ✅ | Capped at 8% of static load minimum per axle |
| **Per-wheel weight (4 corners)** | ✅ 🆕 | **Fixed!** [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts) computes `cornerLoads` for all 4 wheels (FL/FR/RL/RR) combining longitudinal + lateral transfer. [SuspensionModel.ts](file:///d:/trifilpla/components/objects/SuspensionModel.ts) uses these as targets and produces per-corner normal loads with anti-roll bar redistribution. No longer a pure bicycle model |
| **Sprung vs unsprung mass** | ✅ 🆕 | **Implemented in [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts).** `unsprungMassPerWheel` calculated as ~3.2% of total mass (clamped 24–48 kg). `sprungMass = totalMass - 4×unsprungMass`. Load transfer uses sprung mass; suspension adds unsprung load per corner |
| **Engine layout affecting inertia** | ✅ 🆕 | `EngineLayout` type (front/front_mid/mid/rear) affects mass concentration factor (0.84–1.05) which scales yaw/pitch/roll inertia tensors |

---

## 7. Suspension

| Aspect | Status | Detail |
|--------|--------|--------|
| Visual body roll | ✅ 🆕 | Now driven by actual suspension compression differential (`atan2(leftComp - rightComp, trackWidth)`) with roll inertia response |
| Visual pitch (accel/brake) | ✅ 🆕 | Now driven by suspension compression (`atan2(frontComp - rearComp, wheelbase)`) with pitch inertia response |
| Suspension compression visual | ✅ 🆕 | `heave` computed from average compression vs static compression, referenced to ride height |
| **Spring/damper physics** | ✅ 🆕 | **Fully implemented in [SuspensionModel.ts](file:///d:/trifilpla/components/objects/SuspensionModel.ts).** Per-corner spring rates derived from target ride frequency (1.45–2.0 Hz by upgrade level). Separate compression and rebound damping (68%/82% of critical). Force-based simulation with `F = springRate × compression + damping × velocity`. No longer cosmetic lerp |
| **Anti-roll bars** | ✅ 🆕 | **Implemented!** Front and rear anti-roll rates scale with mass (`mass × 8.5` front, `mass × 6.8` rear). `applyAntiRoll()` redistributes normal load between left/right corners. Scales with suspension upgrade level |
| **Ride height changes** | ✅ 🆕 | `rideHeight = max(0.09, 0.16 - level × 0.018)`. Ride frequency increases with upgrade level (1.45 + level × 0.18 Hz), producing both lower and stiffer suspension |
| **Bump stops / travel limits** | ✅ 🆕 | **Implemented!** Progressive bump stops: `bumpForce = compression² × bumpStopRate` activating at 78% of travel. Travel limits clamp compression to `[-0.18×travel, travel]`. Rate scales with mass and upgrade level |
| **Independent wheel height** | ✅ 🆕 | **Implemented!** 4-corner ground height sampling via `sampleGround()` at each wheel position (frontDist ± halfTrack). Each corner has independent compression, velocity, and contact state. Per-wheel visual displacement applied in `updateSuspensionWheelVisuals()` |

---

## 8. Braking System

| Aspect | Status | Detail |
|--------|--------|--------|
| Brake force with pressure curve | ✅ | `(1 - (1-input)^1.65)` progressive pedal feel |
| Front/rear brake bias (EBD) | ✅ 🆕 | `frontBrakeBias` adapts to axle grip, steering, brake demand, and speed. It is clamped [58%, 84%], with stronger front bias at high speed. Rear axle utilization is restricted during hard braking to preserve lateral stability |
| **High-speed straight-line stability** | ✅ 🆕 | Brake pressure now builds progressively instead of reaching 100% in one frame. Above ~86 km/h, proportioning shifts up to 7% more braking forward, limits rear utilization to 76% under hard braking, and damps unintended yaw when the steering is centered |
| ABS preventing lock-up | ✅ | Limits longitudinal force based on grip when ABS enabled |
| **ABS pulse cycling** | ✅ 🆕 | **Implemented!** ABS now uses a 24 Hz sine oscillation (`sin(time × π × 24) × 0.025`) around a target utilization that varies with steering (90% straight, 72% at full lock). Still simpler than a real hydraulic pulse system, but no longer just a static force clamp |
| **Brake fade / heat** | ✅ 🆕 | **Implemented!** `brakeTemperatureFront/Rear` tracked separately. Heat = `|brakeForce × speed| / heatCapacity`. Cooling = `(0.018 + speed×0.0035) × (1 + brakeLevel×0.08)`. Fade = smoothstep from 520°C (start) to 780°C (full), reducing effectiveness by up to 42%. Higher brake upgrade level raises fade thresholds |
| **Adjustable brake bias** | ⚠️ | EBD is automatic — no manual player adjustment of front/rear bias |
| **Brake cooling** | ✅ 🆕 | Speed-dependent cooling: `airflowCooling = 0.012 + speedRatio × 0.045`, improved by brake upgrade level |

---

## 9. Steering Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Ackermann steering geometry | ✅ | Inner wheel steers more than outer via `getAckermannWheelAngles()` — correct |
| Speed-sensitive steering reduction | ✅ | Max steer angle smoothstep-reduces from full to 16% (normal) or 38% (drifting) at high speed |
| Counter-steer assist | ✅ | Dynamic assist with neutral (45%), counter-steer (70%), and pro-steer (10%) factors, fading near spin threshold |
| **Rear-axle steering** | ✅ 🆕 | `rearSteeringRatio` and `rearSteeringMaxAngle` — counter-phase at low speed (opposite to front), in-phase blend at high speed (stabilizing). Currently used by Cybertruck (ratio=0.35, max=0.12 rad) |
| **Self-aligning torque (SAT)** | ✅ 🆕 | Pneumatic trail and caster trail now create steering-wheel torque from front slip angle and axle load. SAT fades after peak slip and actively helps return/counter-steer the rack |
| **Steering rack ratio** | ✅ 🆕 | Steering-wheel angle is tracked separately from road-wheel angle through per-car rack ratios. Rack ratio also changes steering speed and torque felt at the wheel |
| **Power steering model** | ✅ 🆕 | None, hydraulic, and electric assist types now provide different low-speed assistance and high-speed weight. Assist changes steering rate and reduces driver torque without deleting SAT |
| **Steering response rate** | ✅ 🆕 | Per-car `steeringResponse` multiplier (default 1.0, Cybertruck 0.72) affects interpolation rate |
| **Chicane transient stability** | ✅ 🆕 | Rapid left-right reversals now trigger a 0.42s transient model: steering rack rate falls up to 52%, yaw acceleration falls 45%, yaw damping rises up to 110%, rear response accelerates, rear grip gains a 16% stability reserve, front bite is briefly moderated, and lift-off grip loss fades out during the transition |

---

## 10. Differential

| Aspect | Status | Detail |
|--------|--------|--------|
| Accel/decel/preload lock percentages | ✅ | `accelLock`, `decelLock`, `preload` per car |
| AWD front/rear torque split | ✅ | `awdFrontBias` adjustable (clamped [0.2, 0.8]) |
| LSD effect on traction | ✅ 🆕 | Diff lock now modulates drive grip limit: `gripLimit × (0.86 + diffLock × 0.12)` — locked diff allows more longitudinal force |
| **Torque vectoring** | ❌ | No active torque vectoring (brake-based or clutch-based) |
| **Viscous vs plate LSD** | ❌ | No distinction between mechanical LSD types (viscous has speed-dependent lock, plate has torque-dependent) |
| **One-way / 1.5-way / 2-way** | ❌ | Current model is effectively a 2-way LSD for all cars |

---

## 11. Collision Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Wall reflection with restitution | ✅ | Velocity reflected off wall normal with 0.3 restitution in [Fence.ts](file:///d:/trifilpla/components/objects/Fence.ts) |
| Energy loss on impact | ✅ | 8% speed penalty on wall contact (`velocityX/Z *= 0.92`) |
| **Car-to-car collision** | ❌ | **No car-to-car collision at all.** Player and AI cars phase through each other |
| **Damage model** | ❌ | No mechanical or visual damage (engine damage, broken suspension, bent steering, cosmetic dents) |
| **Crumple zones / impact deformation** | ❌ | No deformation physics |

---

## 12. Tire Compounds & Wear

**Current**: Fully refactored in [TireCompound.ts](file:///d:/trifilpla/components/objects/TireCompound.ts).

| Aspect | Status | Detail |
|--------|--------|--------|
| 9 compound types with grip/wear trade-offs | ✅ 🆕 | Economy; Sport Hard/Medium/Soft; Racing Hard/Medium/Soft/Super Soft; and a short-life Qualifying compound |
| Wear cliff (performance drops after ~30%) | ✅ | `smoothstep(0.3, 1.0, wear) × 0.35` — 35% max grip loss |
| Speed/slip/brake/load-dependent wear | ✅ 🆕 | Multi-factor wear now includes speed, cornering, braking, overheating, pressure, compound, and actual peak tire normal load. A heavy fuel load therefore increases wear |
| **Grip multiplier values** | ✅ 🆕 | Economy=0.82×; Sport range=0.89–0.99×; Racing Hard/Medium/Soft/Super Soft=1.12/1.18/1.24/1.29×; Qualifying=1.34×. Racing compounds now provide a clear step above sport tires |
| **Cold racing grip** | ✅ 🆕 | Racing cold-grip floors were raised to 84–92% and operating windows widened slightly. Cold tires still need warming, but no longer begin with economy-level effective grip |
| **Racing lateral envelope** | ✅ 🆕 | Racing compounds now use 1.03–1.07× lateral friction-envelope scaling instead of the old universal 0.95× reduction, so their extra compound grip produces real cornering force |
| **Breakaway behavior** | ✅ 🆕 | Each compound now has its own peak slip angle, post-peak grip loss, and falloff distance. Sport tires break away progressively; racing tires remain sharper but retain more useful grip after saturation, reducing sudden high-speed spins |
| **Temperature-dependent grip** | ✅ 🆕 | Each compound has unique optimal temp (65–102°C), window width (14–28°C), cold grip floor, and heat rate. Grip builds from cold floor to 100% across the operating window, degrades 24% if overheated. Cold tire warmup lap dynamics are present |
| **Overheat wear acceleration** | ✅ 🆕 | Running above optimal temperature increases wear: `overheatLoad = 1.0 + max(0, temp - optimal) × 0.012` |
| **Flat spots from lock-ups** | ❌ | No localized tire damage from brake lockup |
| **Graining / blistering** | ❌ | No compound-specific degradation modes |

---

## 13. Surface & Environment Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Grass grip reduction | ✅ | Progressive instability factor in [Grass.ts](file:///d:/trifilpla/components/objects/Grass.ts) → `1.0 - 0.45 × grassInstability` grip multiplier |
| Grass speed limit (~60 km/h) | ✅ | Exponential decay drag limiting speed to 16.67 m/s on grass |
| Grass lateral slide | ✅ | Oscillating lateral impulse via sine wave |
| **Wet/rain physics** | ❌ | No rain, no aquaplaning, no puddles, no spray |
| **Track rubbering in** | ❌ | No racing line grip evolution over laps |
| **Marbles / dirty surface off-line** | ❌ | No tire debris accumulation reducing grip |
| **Kerb / rumble strip physics** | ❌ | No special kerb behavior (bouncing, destabilizing) |
| **Elevation change physics** | ⚠️ | Ground height is sampled per-wheel now (4-corner), but gradient doesn't affect acceleration/braking force calculation |

---

## 14. Gravity & Airborne Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Basic gravity when airborne | ⚠️ | 9.81 m/s² (GRAVITY constant updated to correct value). Landing detection snaps to ground |
| Pitch while airborne | ✅ | Forward/backward tilt based on vertical velocity |
| **Yaw/roll control while airborne** | ❌ | No angular momentum conservation — car just freezes yaw mid-air |
| **Drag while airborne** | ❌ | No reduced grip or aero effects while wheels are off ground |

---

## 15. Banking / Banked Curves

| Aspect | Status | Detail |
|--------|--------|--------|
| Banking angle affects gravity vector | ✅ | `effectiveGravity` modified by `cos(bankAngle) + centripetal×sin(bankAngle)` |
| Lateral gravity force on banked surfaces | ✅ | `lateralGravityForce = -mass × g × sin(bankAngle)` applied to lateral forces |
| **Banking affects visual roll** | ❌ | Car visual doesn't tilt to match banked surface |

---

## 16. Car Database / Vehicle Specs

| Aspect | Status | Detail |
|--------|--------|--------|
| Real manufacturer names (Honda, Ford, Ferrari, Tesla) | ✅ | In database |
| Per-car character tuning (weight dist, grip, inertia) | ✅ | GT4-style `character` object |
| **Engine layout modeling** | ✅ 🆕 | `engineLayout` (front/front_mid/mid/rear) in [CarDatabase.ts](file:///d:/trifilpla/components/config/CarDatabase.ts) affects mass concentration and inertia distribution. Honda S2000 is `front_mid`, Ford GT is `mid`, Cybertruck is `mid` |
| **Mass-derived inertia tensors** | ✅ 🆕 | Yaw, pitch, and roll inertias calculated from body dimensions, mass, layout concentration, and weight bias spread via [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts). No longer flat constants |
| **Real-world verified specs** | ⚠️ | Ford GT 2006 has detailed real specs (torque curve, gear ratios, mass, wheelbase, Cd, final drive). Cybertruck has real specs (3009 kg, 3.635m wheelbase, rear steering). Most fictional cars use tier-based defaults |
| **Drag coefficient values** | ⚠️ | `dragCoeff` field (e.g. `0.000012`) still exists alongside `dragCoefficient` (e.g. `0.32`). The old `dragCoeff` field appears to be legacy/unused by new physics |

---

## 17. Mass Dynamics (NEW SECTION) 🆕

**New module**: [MassDynamics.ts](file:///d:/trifilpla/components/objects/MassDynamics.ts)

| Aspect | Status | Detail |
|--------|--------|--------|
| Center of gravity computation | ✅ | CG position derived from weight distribution and wheelbase: `z = (frontDist - 0.5) × wheelbase` |
| Inertia tensor estimation | ✅ | Yaw, pitch, roll from uniform body approximation (`M×(L²+W²)/12`) scaled by layout concentration and unsprung contributions |
| Sprung/unsprung mass split | ✅ | Unsprung at 3.2% of total (24–48 kg per wheel), sprung = total - 4×unsprung |
| 4-corner load transfer | ✅ | Combined longitudinal + lateral transfer distributed to all 4 corners by front/rear load share |
| **Non-uniform mass distribution** | ⚠️ | `massConcentration` is a single scalar — real cars have asymmetric mass distribution (engine/gearbox/fuel tank in specific locations) |

---

## 18. Fuel & Vehicle Mass 🆕

| Aspect | Status | Detail |
|--------|--------|--------|
| Per-car tank capacity | ✅ | Real cars can override capacity (S2000 50 L, Ford GT 66 L); other combustion cars derive capacity from vehicle class, mass, speed, displacement, and drivetrain. Electric vehicles use 0 L |
| Fuel consumption | ✅ | Brake-power/BSFC model with idle consumption, low-load inefficiency, high-load enrichment, turbo enrichment, and deceleration fuel cut |
| Fuel mass | ✅ | Gasoline defaults to 0.745 kg/L. Database mass remains the full-tank curb mass; empty mass is derived underneath it, so real specs remain unchanged when full and vehicle mass falls continuously as fuel burns |
| Fuel tank position and CG | ✅ | Tank longitudinal position and height alter front/rear weight distribution, CG height, inertia tensors, suspension loads, and handling as the tank empties |
| Fuel surge/starvation | ✅ | The final reserve can uncover the pickup under combined acceleration, causing reduced fuel delivery and sputtering before fully empty |
| Empty-tank behavior | ✅ | Combustion engine stalls at zero fuel. Race mode automatically tows to the start/pit, refuels, and adds a 20–120 second penalty based on recovery distance along the circuit |
| Fuel telemetry | ✅ | HUD displays remaining/capacity liters, live L/h consumption, low-fuel warning, and stalled state |

---

## Summary: Priority Gaps for Realism

### ✅ Major Items FIXED Since Last Audit

1. ~~Tire temperature model~~ → **Implemented** (9 compounds, cold/optimal/overheat, per-compound heat rates)
2. ~~Proper suspension physics~~ → **Implemented** (spring rates, damping, anti-roll bars, bump stops, per-wheel)
3. ~~Full 4-wheel model~~ → **Implemented** (4-corner load transfer, per-wheel suspension, anti-roll redistribution)
4. ~~Longitudinal tire force through slip ratio~~ → **Implemented** (Pacejka longitudinal with per-axle wheel speed)
5. ~~Friction ellipse~~ → **Implemented** (elliptical envelope, 1.05× longitudinal / 0.95× lateral)
6. ~~Brake fade/temperature~~ → **Implemented** (front/rear temps, speed cooling, 42% max fade)
7. ~~Tire relaxation length~~ → **Implemented** (0.10m front, 0.12m rear)
8. ~~Rev-matching on downshifts~~ → **Implemented** (automatic throttle blip)
9. ~~ABS pulse cycling~~ → **Implemented** (24 Hz oscillation, steering-aware pressure release)
10. ~~Yaw-dependent aero~~ → **Implemented** (up to 3× drag at high sideslip)
11. ~~Wheel inertia model~~ → **Fixed** (1.35 kg·m² per wheel, proper axle equivalent mass)
12. ~~Grip multiplier values unrealistic~~ → **Fixed** (max difference now ~38%, was 60%+)
13. ~~Tire pressure model~~ → **Implemented** (temperature-driven pressure, grip/stiffness/heat/wear effects)
14. ~~Camber effects~~ → **Implemented** (per-car axle camber with lateral/longitudinal trade-offs)
15. ~~Torque converter / dual-clutch behavior~~ → **Implemented** (converter multiplication/coupling, DCT torque retention, hardware-specific shift times)
16. ~~Launch clutch torque coupling~~ → **Fixed** (wheel torque now follows progressive clutch engagement)
17. ~~Engine temperature/overheating~~ → **Implemented** (load/boost heat, airflow cooling, cold friction, overheat derating)
18. ~~Linear engine friction~~ → **Fixed** (mechanical, viscous, pumping, RPM², oil-temperature losses)
19. ~~VTEC / variable valve timing~~ → **Implemented** (configurable high-cam transition; 6000 RPM on S2000)
20. ~~Fuel consumption and fuel weight~~ → **Implemented** (BSFC consumption, tank mass/position, dynamic CG/inertia, starvation, stall/tow)
21. ~~Load-sensitive tire wear~~ → **Implemented** (peak per-tire normal load now accelerates degradation)

### 🔴 High Impact (would most noticeably improve realism)

1. **Car-to-car collision** — Essential for racing, currently phantom cars
2. **Rain/weather physics** — Transforms driving dynamics entirely
3. **Manual transmission controls** — Core driving experience for enthusiasts
4. **Damage model** — Consequences for bad driving

### 🟡 Medium Impact

6. **Adjustable brake bias** — Allow player tuning of front/rear bias
7. **Viscous vs plate LSD types** — Different lock behaviors affect handling
8. **Pitch-dependent aero** — Front downforce increases under braking
9. **Kerb/rumble strip physics** — Bouncing, destabilizing effects on kerbs
10. **Elevation-dependent forces** — Gradient should affect traction/braking

### 🟢 Lower Priority (nice-to-have for full sim)

12. Ground effect (ride-height aero)
13. Slipstream/drafting
14. Flat spots from lock-ups
15. Track rubbering in
16. Graining/blistering degradation modes
17. Intake manifold resonance / advanced induction
18. Non-uniform component-level mass distribution
19. Angular momentum conservation while airborne

---

> [!NOTE]
> The physics has been **substantially upgraded** since the previous audit. Tire behavior now includes Pacejka forces, pressure, temperature, camber, and relaxation. Suspension is force-based with per-wheel contact. Steering includes SAT, rack ratios, and power assist. Engines now include thermal behavior, non-linear friction, throttle response, and variable valve timing. This places the simulation firmly in the **advanced simcade** category while still lacking key full-sim features such as car-to-car collision, weather, damage, fuel use, and manual player controls.
