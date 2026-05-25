# Learning Three.js: Cyber Drive Architecture & Tutorial Guide

Welcome! This guide is designed to help you learn **Three.js** and understand how **"Cyber Drive: Neon Horizon"** was built from scratch. You will learn the core concepts of 3D web development, how arcade car physics work, and how to write custom shaders and particles.

---

## 🌌 Part 1: Core Three.js Architecture

Three.js is a library that wraps WebGL (Web Graphics Library), allowing you to draw 3D graphics in the browser using JavaScript. The three pillars of any Three.js project are:
1. **The Scene**: A container that holds all 3D objects, lights, and cameras.
2. **The Camera**: The viewport through which the scene is viewed (usually a `PerspectiveCamera` which mimics human eyes).
3. **The Renderer**: The engine that draws the scene onto a HTML `<canvas>` using the GPU.

In [components/gameEngine.ts](file:///d:/react_game_type_shit/trifilpla/components/gameEngine.ts), this setup happens in the `initThree()` method:

```typescript
// 1. Create the Scene container
this.scene = new THREE.Scene();
this.scene.fog = new THREE.FogExp2(0x0a0a14, 0.007); // Adds depth fog

// 2. Setup the Camera (Field of view, Aspect ratio, Near plane, Far plane)
this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);

// 3. Create the WebGLRenderer and attach it to the HTML <canvas>
this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
this.renderer.setSize(width, height, false);
```

### 🎬 The Animation Loop (Tick)
3D games need to render frames continuously (usually 60 times per second). We do this using `requestAnimationFrame`, which tells the browser to run a function right before the next repaint:

```typescript
private animate = () => {
  // Enqueue the next frame
  this.animationFrameId = requestAnimationFrame(this.animate);
  
  const deltaTime = Math.min(0.016, 0.05); // Standardized time step

  // Update physics, positions, camera, particles
  this.updateCarPhysics(deltaTime);
  this.updateCameraChase(deltaTime);

  // Draw the updated frame
  this.renderer.render(this.scene, this.camera);
};
```

---

## 🏎️ Part 2: Procedural 3D Modeling with Primitives

Instead of loading heavy `.gltf` or `.obj` 3D files (which require external hosting and loading times), we assemble our cars and scenery programmatically. This is called **procedural modeling**.

A 3D object in Three.js is called a **Mesh** and consists of two things:
1. **Geometry**: The mathematical shape/structure (vertices and faces).
2. **Material**: How the shape looks (color, roughness, shininess, light reflectivity).

### 🛠️ Creating the Car Chassis
In `buildCar()`, we combine multiple boxes, cylinders, and lighting objects into a single `THREE.Group` that moves together:

```typescript
this.carGroup = new THREE.Group();

// 1. Create a Box Geometry for the body
const chassisGeom = new THREE.BoxGeometry(2.4, 0.5, 4.8);

// 2. Create a shiny metal material
const chassisMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(color), // Pink, cyan, etc.
  roughness: 0.2,               // Low roughness makes it reflective
  metalness: 0.8,               // High metalness makes it look like steel
});

// 3. Join them into a Mesh and add to the Group
const chassis = new THREE.Mesh(chassisGeom, chassisMat);
chassis.position.y = 0.45; // Raise slightly above wheels
this.carGroup.add(chassis);
```

### 🛞 Wheel Mechanics
We add wheels at four offset coordinates. To make the car feel alive:
- **Tire Spin**: We rotate the wheels around their local **X-axis** relative to speed.
- **Steering**: We rotate the front wheels around their **Y-axis** relative to steering input:

```typescript
// Inside updateCarPhysics:
const turnInput = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
const steeringAngle = turnInput * 0.5; // Turn limit

// Rotate front wheel assemblies
this.leftFrontWheel.rotation.y = steeringAngle;
this.rightFrontWheel.rotation.y = steeringAngle;

// Spin all wheels relative to forward velocity
const wheelRotSpeed = (this.carSpeed / 0.48) * deltaTime;
this.wheels.forEach(wheel => {
  wheel.children[0].rotation.x += wheelRotSpeed;
});
```

---

## 📐 Part 3: Arcade Physics & Vector Math

Our car needs to move around in 3D space. We track:
- `carPos`: A `THREE.Vector3(x, y, z)` storing the car's current position.
- `carYaw`: The angle (in radians) the car is facing around the Y-axis.
- `carSpeed`: The current forward velocity.
- `driftAngle`: The slide angle offset from where the car is facing.

### 🧭 Moving the Car in 2D Plane
We convert the car's speed and rotation angle (yaw + drift) into directional vectors to update its position:

```typescript
// 1. Start with a vector pointing forward (along Z-axis)
const directionVector = new THREE.Vector3(0, 0, 1);

// 2. Rotate the vector around the Y-axis by the car's heading + drift slide
directionVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.carYaw + this.driftAngle);

// 3. Move the car coordinate along this vector scaled by speed and time
this.carPos.x += directionVector.x * this.carSpeed * deltaTime;
this.carPos.z += directionVector.z * this.carSpeed * deltaTime;
```

### 💨 The Drift Sliding Formula
When drifting, the car slides slightly sideways. We represent this by setting `driftAngle` when the user turns hard or presses Space:

```typescript
if (isDrifting) {
  // Drift angle builds up, opposite to turn direction
  this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, -turnInput * 0.42, 0.1);
} else {
  // Return to straight alignment
  this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, 0, 0.15);
}
```

### 🚀 Gravity & Jumps (Vertical Physics)
If the car is in the air, we update its Y position using gravity and vertical velocity:

```typescript
if (!this.isGrounded) {
  this.carYVelocity -= 18 * deltaTime; // Subtract gravity force
  this.carPos.y += this.carYVelocity * deltaTime; // Update height

  // Rotate car pitching down slightly as it falls
  this.carPitch = THREE.MathUtils.lerp(this.carPitch, this.carYVelocity > 0 ? 0.15 : -0.2, 0.08);

  // Check if we hit the floor
  if (this.carPos.y <= 0) {
    this.carPos.y = 0;
    this.carYVelocity = 0;
    this.isGrounded = true;
    this.carPitch = 0;
  }
}
```

---

## 🎇 Part 4: Custom Particle Systems

To simulate sparks, smoke, and engine boosters, we use lightweight arrays of meshes that spawn, move, fade, and delete over time.

For example, here is how the **Tire Drift Smoke** is built:
1. **Spawn**: We calculate the global 3D position of the rear tires.
2. **Create Mesh**: Create a gray sphere and push it to the `smokeParticles` array.
3. **Animate**: Move it up and backward, and scale it down.
4. **Dispose**: When it runs out of life, remove it from the scene and delete it to prevent memory leaks.

```typescript
// 1. Emit Smoke
const rearLeftPos = new THREE.Vector3(-1.25, 0.2, -1.6).applyMatrix4(this.carGroup.matrixWorld);
const mesh = new THREE.Mesh(smokeGeom, smokeMat);
mesh.position.copy(rearLeftPos);
this.scene.add(mesh);
this.smokeParticles.push({ mesh, velocity: new THREE.Vector3(...), life: 0, maxLife: 1.0 });

// 2. Inside updateParticles loop:
p.life += deltaTime;
if (p.life >= p.maxLife) {
  this.scene.remove(p.mesh); // Remove from 3D scene
  this.smokeParticles.splice(i, 1); // Delete from array
} else {
  p.mesh.position.addScaledVector(p.velocity, deltaTime);
  p.mesh.scale.multiplyScalar(1 - deltaTime * 0.8); // Shrink
  p.mesh.material.opacity = 0.35 * (1 - p.life / p.maxLife); // Fade
}
```

---

## 🧪 Part 5: Code Challenges (Try Editing!)

Here are 3 coding exercises you can complete to customize the game and practice writing Three.js code!

### 🔴 Challenge 1: Add a Neon Underglow to the Car
Let's add a glowing underglow light that casts a neon color under the chassis.
1. Open [components/gameEngine.ts](file:///d:/react_game_type_shit/trifilpla/components/gameEngine.ts).
2. Go to `buildCar()` (around line 348).
3. Right after headlights are created, add a new `THREE.PointLight` pointing down:
```typescript
// Add this in buildCar:
const underglow = new THREE.PointLight(new THREE.Color(color), 3, 6);
underglow.position.set(0, -0.2, 0); // Position under the floor
this.carGroup.add(underglow);
```
4. Save the file and observe the floor underneath the car glow!

### 🔵 Challenge 2: Speed-up Boost Pad
Let's make a special pad on the floor that accelerates the car to extreme speeds when driven over.
1. Open [components/gameEngine.ts](file:///d:/react_game_type_shit/trifilpla/components/gameEngine.ts).
2. Create a glowing cyan boost pad in `buildOpenWorld()`:
```typescript
// 1. Add class field
private boostPadMesh?: THREE.Mesh;

// 2. Inside buildOpenWorld(), spawn the pad at coordinates (0, 0.05, -80):
const padGeom = new THREE.BoxGeometry(6, 0.1, 4);
const padMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
this.boostPadMesh = new THREE.Mesh(padGeom, padMat);
this.boostPadMesh.position.set(0, 0.05, -80);
this.environmentGroup.add(this.boostPadMesh);
```
3. Inside `updateCarPhysics()`, check if the car overlaps the pad:
```typescript
if (this.boostPadMesh) {
  const dist = this.carPos.distanceTo(this.boostPadMesh.position);
  if (dist < 4.0) {
    this.carSpeed = this.maxSpeed * 1.5; // Inject massive boost speed!
    this.emitSparkParticles(10, this.carPos, 0x00ffff); // cyan sparks
  }
}
```

### 🟢 Challenge 3: Customizing the Star Sky Colors
You can change the star color generator in `createStarfield()` (around line 170) to use your own hex values or restrict it to green/gold shades! Find this line:
```typescript
colors[i * 3] = 1.0;     // Red channel (0.0 to 1.0)
colors[i * 3 + 1] = 0.05; // Green channel
colors[i * 3 + 2] = 0.6;  // Blue channel
```
Change these ratios and save to see the starry night sky transform instantly.
