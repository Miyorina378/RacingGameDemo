# Vehicle Physics Realism Audit 🏎️

A system-by-system analysis of what is already realistic vs. what is still **not 1:1 with real-world physics**.

---

## Rating Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Realistic / close to real |
| ⚠️ | Partially realistic — has the right idea but simplifies significantly |
| ❌ | Not realistic — arcade or missing entirely |

---

## 1. Tire Model (Lateral Forces)

**Current**: Simplified Pacejka "Magic Formula" → `F = Fpeak × sin(atan(B × α))` with post-peak drop-off.

| Aspect | Status | Detail |
|--------|--------|--------|
| Magic formula shape | ⚠️ | Uses only `sin(atan(B*α))` — real Pacejka has 4 params `(B, C, D, E)` controlling peak shape, asymmetry, and tail behavior |
| Post-peak grip drop-off | ⚠️ | Hardcoded at 20% over 0.4 rad — real tires lose 10-40% depending on compound/load/temperature |
| Cornering stiffness per car | ✅ | Each car has `corneringStiffnessFront/Rear` in database |
| **Tire temperature model** | ❌ | **Completely absent.** Real tires have an operating window (cold = low grip, optimal = peak, overheated = degraded). This is a major realism gap |
| **Tire pressure model** | ❌ | **Missing.** Pressure affects contact patch size, stiffness, heat generation, and wear rate |
| **Load sensitivity (tire)** | ⚠️ | `computeAxleGripLimit()` has basic load sensitivity (`1.08 - 0.16*(loadRatio-1)`), but real tires have complex non-linear degression |
| **Camber effects** | ❌ | **Missing.** Camber angle affects lateral grip significantly (1-3° negative camber = more cornering grip) |
| **Combined slip (longitudinal)** | ⚠️ | `combinedGripCircle()` uses circular friction — real tires have an **elliptical** friction envelope (more grip longitudinally than laterally) |
| **Relaxation length** | ❌ | **Missing.** Real tires don't generate force instantly — there's a ~0.05-0.1m relaxation length delay as the contact patch deforms |

---

## 2. Tire Model (Longitudinal Forces)

| Aspect | Status | Detail |
|--------|--------|--------|
| Slip ratio computation | ✅ | Correct |
| Wheelspin detection | ✅ | Excess drive force → wheel speed diverges from ground speed |
| **Longitudinal force NOT used in main loop** | ❌ | `computeLongitudinalForce()` is defined but **never called** in [Vehicle.ts](file:///d:/trifilpla/components/objects/Vehicle.ts). Drive/brake forces are applied directly without going through the tire longitudinal model. Real cars produce traction force *through the tire contact patch* with slip-dependent grip |
| Wheel inertia model | ⚠️ | Uses a flat `100 kg` effective wheel mass for wheelspin — real wheel assemblies have rotational inertia based on moment of inertia (typically 1-2 kg·m²) |

---

## 3. Drivetrain & Transmission

| Aspect | Status | Detail |
|--------|--------|--------|
| Gear ratios per car | ✅ | Database supports custom `gearRatios[]` and `finalDrive` |
| Auto-shift by RPM or speed schedule | ✅ | `shiftUpMph[]` schedule + RPM-based fallback |
| Shift time with upgrade modifiers | ✅ | Base 0.35s up / 0.20s down, reduced by gearbox+flywheel upgrades |
| **Rev-matching / heel-toe on downshift** | ❌ | **Missing.** Downshifts should blip throttle to match RPM — currently RPM just jumps |
| **Manual transmission option** | ❌ | Only automatic. No clutch simulation, paddle-shift, or H-pattern |
| Clutch slip at launch | ⚠️ | Basic clutch capacity model exists but is very simplified (no clutch engagement curve, no stall) |
| **Torque converter / dual-clutch** | ❌ | No torque converter for automatics, no dual-clutch pre-engagement |
| Engine inertia | ⚠️ | Flywheel inertia is a flat `0.05-0.18` value — real engines have measured MOI curves |

---

## 4. Engine Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Torque curve per car | ✅ | Custom `torqueCurve: TorquePoint[]` with linear interpolation |
| Rev limiter | ✅ | Oscillating cut at redline |
| Turbo spool lag | ⚠️ | Simple 0→1 spool variable — real turbos have inertia-based spool, wastegate, blow-off valve, and boost curves |
| **Engine friction model** | ⚠️ | `frictionTorque = 15 + 0.012 * rpm` — overly linear. Real engines have viscous + mechanical + pumping losses |
| **Fuel system** | ❌ | No fuel consumption, no fuel weight affecting handling over time |
| **Engine temperature** | ❌ | No overheating, coolant, or performance degradation from sustained high RPM |
| **Natural aspiration induction** | ❌ | No intake manifold resonance tuning, no VTEC-like variable valve timing (despite having an S2000!) |

---

## 5. Aerodynamics

| Aspect | Status | Detail |
|--------|--------|--------|
| Drag force (Cd × A × ½ρv²) | ✅ | Proper aerodynamic drag formula with per-car Cd and frontal area |
| Downforce (lift coefficient) | ✅ | `liftCoefficient` creates speed-dependent downforce |
| Rolling resistance | ✅ | `rollingResistanceCoefficient` per car |
| **Yaw-dependent aero** | ❌ | **Missing.** At high yaw angles (sideslip), drag increases dramatically and downforce distribution shifts. Real cars at 10°+ sideslip have 2-3× the drag |
| **Pitch-dependent aero** | ❌ | Under braking (nose-down pitch), front downforce increases. Not modeled |
| **Ground effect** | ❌ | No ride-height-dependent underbody venturi effect |
| **Dirty air / slipstream** | ❌ | No drafting effect behind AI cars, no turbulent wake |

---

## 6. Weight Transfer

| Aspect | Status | Detail |
|--------|--------|--------|
| Longitudinal weight transfer | ✅ | `(mass × accel × cgHeight) / wheelbase` — textbook formula |
| Lateral weight transfer | ✅ | `(mass × lateralAccel × cgHeight) / trackWidth` |
| Per-axle weight distribution | ✅ | `frontWeightDistribution` in database |
| Transfer clamping (no negative load) | ✅ | Capped at 80% of static load |
| **Per-wheel weight (4 corners)** | ❌ | Uses a **2-axle (bicycle) model**, not 4-wheel. Combined lateral + longitudinal diagonal load transfer is not computed. This means inside-front/outside-rear load differences during corner entry are missed |
| **Sprung vs unsprung mass** | ❌ | No distinction between body mass and wheel/suspension mass |

---

## 7. Suspension

| Aspect | Status | Detail |
|--------|--------|--------|
| Visual body roll | ✅ | Roll based on steering × speed ratio |
| Visual pitch (accel/brake) | ✅ | Longitudinal acceleration affects pitch |
| Suspension compression visual | ✅ | `suspensionOffset` for vertical chassis movement |
| **Spring/damper physics** | ❌ | **No actual spring rates, damper coefficients, or compression/rebound simulation.** All body motion is cosmetic lerp-based, not force-based |
| **Anti-roll bars** | ❌ | No anti-roll bar stiffness affecting weight transfer distribution |
| **Ride height changes** | ❌ | Suspension level upgrade "lowers CG" by a fixed offset, not through actual spring/damper geometry |
| **Bump stops / travel limits** | ❌ | No suspension travel limits or progressive bump stops |
| **Independent wheel height** | ❌ | All 4 wheels share the same ground height — no per-wheel terrain sampling |

---

## 8. Braking System

| Aspect | Status | Detail |
|--------|--------|--------|
| Brake force with pressure curve | ✅ | `(1 - (1-input)^1.65)` progressive pedal feel |
| Front/rear brake bias (60/40) | ✅ | Hardcoded 60% front / 40% rear |
| ABS preventing lock-up | ✅ | Limits longitudinal force to 90% of grip when ABS on |
| **ABS pulse cycling** | ❌ | Real ABS rapidly pulses brakes (10-15 Hz cycle) causing a characteristic pedal feedback and noise. Current ABS is just a force clamp |
| **Brake fade / heat** | ❌ | **No brake temperature.** Sustained heavy braking should reduce brake effectiveness (brake fade). Critical for endurance racing |
| **Adjustable brake bias** | ❌ | Fixed at 60/40 — real racing allows driver adjustment |
| **Brake cooling** | ❌ | No brake duct effects or speed-dependent cooling |

---

## 9. Steering Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Ackermann steering geometry | ✅ | Inner wheel steers more than outer — correct |
| Speed-sensitive steering reduction | ✅ | Max steer angle reduces at high speed |
| Counter-steer assist | ✅ | Dynamic assist that helps catch slides |
| **Self-aligning torque (SAT)** | ❌ | **Missing.** Real tires generate a restoring torque through the pneumatic trail — this is what gives steering "feel" and auto-centering force |
| **Steering rack ratio** | ❌ | No distinction between steering wheel angle and road wheel angle |
| **Power steering model** | ❌ | No speed-dependent power assist simulation |
| **Steering column compliance** | ❌ | No flex or play in the steering system |

---

## 10. Differential

| Aspect | Status | Detail |
|--------|--------|--------|
| Accel/decel/preload lock percentages | ✅ | `accelLock`, `decelLock`, `preload` per car |
| AWD front/rear torque split | ✅ | `awdFrontBias` adjustable |
| LSD effect on lateral grip | ✅ | Locked diff affects wheelspin grip penalty |
| **Torque vectoring** | ❌ | No active torque vectoring (brake-based or clutch-based) |
| **Viscous vs plate LSD** | ❌ | No distinction between mechanical LSD types (viscous has speed-dependent lock, plate has torque-dependent) |
| **One-way / 1.5-way / 2-way** | ❌ | Current model is effectively a 2-way LSD for all cars |

---

## 11. Collision Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Wall reflection with restitution | ✅ | Velocity reflected off wall normal with 0.3 restitution |
| Energy loss on impact | ✅ | 8% speed penalty on wall contact |
| **Car-to-car collision** | ❌ | **No car-to-car collision at all.** Player and AI cars phase through each other |
| **Damage model** | ❌ | No mechanical or visual damage (engine damage, broken suspension, bent steering, cosmetic dents) |
| **Crumple zones / impact deformation** | ❌ | No deformation physics |

---

## 12. Tire Compounds & Wear

| Aspect | Status | Detail |
|--------|--------|--------|
| 6 compound types with grip/wear trade-offs | ✅ | Economy through Super Soft |
| Wear cliff (performance drops after ~30%) | ✅ | Smooth-stepped penalty curve |
| Speed/slip/brake-dependent wear | ✅ | Multi-factor wear accumulation |
| **Flat spots from lock-ups** | ❌ | No localized tire damage from brake lockup |
| **Graining / blistering** | ❌ | No compound-specific degradation modes |
| **Grip multiplier values unrealistic** | ⚠️ | Economy tires have 1.5× base grip, Super Soft at 2.44×. Real tire compounds differ by only ~15-25% grip, not 60%+ |

---

## 13. Surface & Environment Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Grass grip reduction | ✅ | Progressive instability factor |
| Grass speed limit (~60 km/h) | ✅ | Heavy drag on grass |
| Grass lateral slide | ✅ | Oscillating lateral impulse |
| **Wet/rain physics** | ❌ | No rain, no aquaplaning, no puddles, no spray |
| **Track rubbering in** | ❌ | No racing line grip evolution over laps |
| **Marbles / dirty surface off-line** | ❌ | No tire debris accumulation reducing grip |
| **Kerb / rumble strip physics** | ❌ | No special kerb behavior (bouncing, destabilizing) |
| **Elevation change physics** | ⚠️ | Ground height is sampled but no true 3D track — gradient doesn't affect acceleration/braking force calculation |

---

## 14. Gravity & Airborne Physics

| Aspect | Status | Detail |
|--------|--------|--------|
| Basic gravity when airborne | ✅ | 18 m/s² downward (slightly stronger than real 9.81 — feels snappier) |
| Pitch while airborne | ✅ | Forward/backward tilt based on vertical velocity |
| **Yaw/roll control while airborne** | ❌ | No angular momentum conservation — car just freezes yaw mid-air |
| **Drag while airborne** | ❌ | No reduced grip or aero effects while wheels are off ground |

---

## 15. Banking / Banked Curves

| Aspect | Status | Detail |
|--------|--------|--------|
| Banking angle affects gravity vector | ✅ | `effectiveGravity` modified by `cos(bankAngle)` |
| Lateral gravity force on banked surfaces | ✅ | `sin(bankAngle)` adds lateral force component |
| **Banking affects visual roll** | ❌ | Car visual doesn't tilt to match banked surface |

---

## 16. Car Database / Vehicle Specs

| Aspect | Status | Detail |
|--------|--------|--------|
| Real manufacturer names (Honda, Ford, Ferrari) | ✅ | In database |
| Per-car character tuning (weight dist, grip, inertia) | ✅ | GT4-style `character` object |
| **Real-world verified specs** | ⚠️ | Ford GT 2006 has detailed specs (torque curve, gear ratios, mass, wheelbase). Most fictional cars use tier-based defaults with no real-world validation |
| **Power/weight ratio accuracy** | ⚠️ | Some cars have unrealistic torque-to-mass ratios. Entry tier cars with 170 Nm and 1200 kg = very slow (real 100hp hatchback has ~180 Nm and does 0-100 in ~10s) |
| **Drag coefficient values** | ⚠️ | `dragCoeff` field (e.g. `0.000012`) in database is NOT the same as `dragCoefficient` (e.g. `0.32`). The old `dragCoeff` field appears to be a legacy arcade drag value, unused by the new physics. Confusing |

---

## Summary: Priority Gaps for Realism

### 🔴 High Impact (would most noticeably improve realism)

1. **Tire temperature model** — Biggest single omission. Cold tires out of pit, tire warm-up laps, overheating during sustained cornering
2. **Car-to-car collision** — Essential for racing, currently phantom cars
3. **Proper suspension physics** — Spring/damper/anti-roll bars determine weight transfer timing and feel
4. **Full 4-wheel model** (instead of bicycle) — Diagonal weight transfer matters for cornering realism
5. **Longitudinal tire force through slip ratio** — Currently bypassed; drive force should go through tire model
6. **Rain/weather physics** — Transforms driving dynamics entirely

### 🟡 Medium Impact

7. **Friction ellipse** instead of circle — Tires grip more longitudinally than laterally
8. **Brake fade/temperature** — Long races need this
9. **Self-aligning torque** — Critical for steering feel
10. **Manual transmission** — Core driving experience for enthusiasts
11. **Rev-matching on downshifts**
12. **Tire relaxation length** — Smoother, more progressive force build-up
13. **Damage model** — Consequences for bad driving

### 🟢 Lower Priority (nice-to-have for full sim)

14. Tire pressure model
15. Camber effects
16. Fuel consumption & weight
17. Yaw-dependent aero
18. Slipstream/drafting
19. Ground effect
20. ABS pulse cycling
21. Track rubbering in

---

> [!NOTE]
> The current physics is already a strong **simcade** implementation — the bicycle model, Pacejka-lite tire forces, weight transfer, and torque-based drivetrain put it well ahead of pure arcade racers. The gaps listed above represent what separates it from a true **simulation** (Gran Turismo / Assetto Corsa level).
