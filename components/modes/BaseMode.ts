import * as THREE from 'three';
import { GameEngine } from '../gameEngine';
import { Vehicle } from '../objects/Vehicle';
import { ParticleSystem } from '../objects/ParticleSystem';

export interface GameMode {
  init(): void;
  update(deltaTime: number): void;
  cleanup(): void;
  reset(): void;
}

export abstract class BaseMode implements GameMode {
  protected engine: GameEngine;
  protected scene: THREE.Scene;
  protected vehicle: Vehicle;
  protected particles: ParticleSystem;
  protected environmentGroup: THREE.Group;
  protected keys: { [key: string]: boolean };

  protected gridHelper1?: THREE.GridHelper;
  protected gridHelper2?: THREE.GridHelper;
  protected sunMesh?: THREE.Mesh;

  protected roadSamplePoints: THREE.Vector3[] = [];
  protected roadWidth: number = 14;
  protected curbWidth: number = 1.5;
  protected curbHeight: number = 0.15;
  protected grassWidth: number = 5.0;
  protected haveGrass: boolean = false;
  protected haveFence: boolean = false;
  protected trackBoundary: number = 0;
  protected grassUniforms = { uTime: { value: 0 } };

  // Settings for concrete block dimensions (used by Silverstone catch fence)
  protected concreteTopWidth: number = 0.3;
  protected concreteBaseWidth: number = 0.6;
  protected concreteHeight: number = 2.0;

  constructor(
    engine: GameEngine,
    scene: THREE.Scene,
    vehicle: Vehicle,
    particles: ParticleSystem,
    environmentGroup: THREE.Group,
    keys: { [key: string]: boolean }
  ) {
    this.engine = engine;
    this.scene = scene;
    this.vehicle = vehicle;
    this.particles = particles;
    this.environmentGroup = environmentGroup;
    this.keys = keys;

    // Assign ground height and boundary callbacks to the player vehicle
    this.vehicle.getGroundHeight = (x: number, z: number) => this.getGroundHeight(x, z);
    this.vehicle.getTrackInfo = (x: number, z: number) => this.getTrackInfo(x, z);
    this.vehicle.onFenceCollision = (contactPt: THREE.Vector3) => {
      this.particles.emitSparks(2, contactPt, 0xffaa00);
    };

  }

  public abstract init(): void;
  public abstract update(deltaTime: number): void;
  public abstract cleanup(): void;
  public abstract reset(): void;



  protected createGridFloor() {
    // Ground Grid helper 1 - Larger size 800 with 160 divisions (cell size = 5)
    this.gridHelper1 = new THREE.GridHelper(800, 160, 0x00ffff, 0x1e1e4a);
    this.gridHelper1.position.set(0, 0, 0);
    this.environmentGroup.add(this.gridHelper1);

    // Synthwave Sun
    const sunGeom = new THREE.SphereGeometry(40, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    sunGeom.rotateX(Math.PI / 2);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xff0088,
      transparent: true,
      opacity: 0.85,
    });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.sunMesh.position.set(0, 5, -450);
    this.environmentGroup.add(this.sunMesh);
  }

  protected updateScrollingFloor() {
    if (this.gridHelper1) {
      const carPos = this.vehicle.pos;

      // Snap position of grid helper to multiples of cell size (5 units) on both X and Z axis
      const snappedX = Math.round(carPos.x / 5) * 5;
      const snappedZ = Math.round(carPos.z / 5) * 5;
      this.gridHelper1.position.set(snappedX, 0, snappedZ);

      // Reposition sun to always stay ahead of car
      if (this.sunMesh) {
        this.sunMesh.position.x = carPos.x;
        this.sunMesh.position.z = carPos.z - 450;
      }
    }
  }

  protected updateGrass(deltaTime: number) {
    this.grassUniforms.uTime.value += deltaTime;
  }

  protected clearEnvironment() {
    while (this.environmentGroup.children.length > 0) {
      const obj = this.environmentGroup.children[0];
      this.environmentGroup.remove(obj);
    }
  }

  protected createRacetrackRoad(
    pathPoints: THREE.Vector3[],
    roadWidth: number = 14,
    HaveCrub: boolean = true,
    HaveFence: boolean = false,
    FenceType: 'guardrail' | 'silverstone' = 'guardrail',
    HaveGrass: boolean = false,
    GrassWidth: number = 5.0
  ) {
    if (pathPoints.length < 3) return;

    this.haveFence = HaveFence;
    this.haveGrass = HaveGrass;
    this.grassWidth = GrassWidth;
    this.trackBoundary = roadWidth / 2 + (HaveCrub ? this.curbWidth : 0) + (HaveGrass ? this.grassWidth : 0);

    // Sync values to the player vehicle
    this.vehicle.haveFence = HaveFence;
    this.vehicle.trackBoundary = this.trackBoundary;
    this.vehicle.isOnGrass = (x: number, z: number) => {
      if (!this.haveGrass) return false;
      const info = this.getTrackInfo(x, z);
      const grassStart = this.roadWidth / 2 + (HaveCrub ? this.curbWidth : 0);
      return info.dist >= grassStart && info.dist < this.trackBoundary;
    };

    // 1. Project points flat to ground height y = 0.01
    const roadPoints = pathPoints.map(p => new THREE.Vector3(p.x, 0.01, p.z));

    // 2. Create smooth closed loop curve
    const curve = new THREE.CatmullRomCurve3(roadPoints, true);

    // 3. Generate sample points along the curve based on track length to keep segment size uniform
    const trackLength = curve.getLength();
    const segmentLength = 4.0; // Uniform length of 4 units per block
    const totalSamplePoints = Math.max(100, Math.round(trackLength / segmentLength));
    const samplePoints = curve.getSpacedPoints(totalSamplePoints);
    this.roadSamplePoints = samplePoints;
    this.roadWidth = roadWidth;

    // 4. Create flat road surface geometry using a custom 2D ribbon mesh
    const roadGeom = new THREE.BufferGeometry();
    const roadPosArray = new Float32Array(samplePoints.length * 2 * 3);
    const roadIndexArray: number[] = [];

    const leftPoints: THREE.Vector3[] = [];
    const rightPoints: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];

    for (let i = 0; i < samplePoints.length; i++) {
      const pt = samplePoints[i];

      const tangent = new THREE.Vector3();
      if (i < samplePoints.length - 1) {
        tangent.subVectors(samplePoints[i + 1], pt);
      } else {
        tangent.subVectors(samplePoints[1], samplePoints[0]);
      }
      if (tangent.lengthSq() < 0.0001) {
        tangent.set(0, 0, -1);
      } else {
        tangent.normalize();
      }

      const normal = new THREE.Vector3(0, 1, 0).cross(tangent);
      if (normal.lengthSq() < 0.0001) {
        normal.set(1, 0, 0);
      } else {
        normal.normalize();
      }
      normals.push(normal);

      // Save points for boundaries and lines
      const left = new THREE.Vector3(pt.x, 0.05, pt.z).addScaledVector(normal, roadWidth / 2);
      const right = new THREE.Vector3(pt.x, 0.05, pt.z).addScaledVector(normal, -roadWidth / 2);
      leftPoints.push(left);
      rightPoints.push(right);

      roadPosArray[i * 6] = left.x;
      roadPosArray[i * 6 + 1] = left.y;
      roadPosArray[i * 6 + 2] = left.z;

      roadPosArray[i * 6 + 3] = right.x;
      roadPosArray[i * 6 + 4] = right.y;
      roadPosArray[i * 6 + 5] = right.z;
    }

    for (let i = 0; i < samplePoints.length - 1; i++) {
      const currLeft = 2 * i;
      const currRight = 2 * i + 1;
      const nextLeft = 2 * (i + 1);
      const nextRight = 2 * (i + 1) + 1;

      roadIndexArray.push(currLeft, currRight, nextLeft);
      roadIndexArray.push(currRight, nextRight, nextLeft);
    }

    roadGeom.setAttribute('position', new THREE.BufferAttribute(roadPosArray, 3));
    roadGeom.setIndex(roadIndexArray);
    roadGeom.computeVertexNormals();

    // Actual dark asphalt material
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f23, // Realistic dark grey asphalt
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    this.environmentGroup.add(roadMesh);

    // 5. Create White Edge lines
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const leftLineGeom = new THREE.BufferGeometry();
    const leftLinePos = new Float32Array(samplePoints.length * 2 * 3);
    const leftLineIndex: number[] = [];

    const rightLineGeom = new THREE.BufferGeometry();
    const rightLinePos = new Float32Array(samplePoints.length * 2 * 3);
    const rightLineIndex: number[] = [];

    const lineWidth = 0.15;

    for (let i = 0; i < samplePoints.length; i++) {
      const pt = samplePoints[i];
      const normal = normals[i];

      // Left edge line
      const l1 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, roadWidth / 2 - 0.4);
      const l2 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, roadWidth / 2 - 0.4 - lineWidth);
      leftLinePos[i * 6] = l1.x;
      leftLinePos[i * 6 + 1] = l1.y;
      leftLinePos[i * 6 + 2] = l1.z;
      leftLinePos[i * 6 + 3] = l2.x;
      leftLinePos[i * 6 + 4] = l2.y;
      leftLinePos[i * 6 + 5] = l2.z;

      // Right edge line
      const r1 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, -roadWidth / 2 + 0.4);
      const r2 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, -roadWidth / 2 + 0.4 + lineWidth);
      rightLinePos[i * 6] = r1.x;
      rightLinePos[i * 6 + 1] = r1.y;
      rightLinePos[i * 6 + 2] = r1.z;
      rightLinePos[i * 6 + 3] = r2.x;
      rightLinePos[i * 6 + 4] = r2.y;
      rightLinePos[i * 6 + 5] = r2.z;
    }

    for (let i = 0; i < samplePoints.length - 1; i++) {
      const currL = 2 * i;
      const nextL = 2 * (i + 1);
      leftLineIndex.push(currL, currL + 1, nextL);
      leftLineIndex.push(currL + 1, nextL + 1, nextL);
      rightLineIndex.push(currL, currL + 1, nextL);
      rightLineIndex.push(currL + 1, nextL + 1, nextL);
    }

    leftLineGeom.setAttribute('position', new THREE.BufferAttribute(leftLinePos, 3));
    leftLineGeom.setIndex(leftLineIndex);
    leftLineGeom.computeVertexNormals();
    const leftLineMesh = new THREE.Mesh(leftLineGeom, lineMat);
    this.environmentGroup.add(leftLineMesh);

    rightLineGeom.setAttribute('position', new THREE.BufferAttribute(rightLinePos, 3));
    rightLineGeom.setIndex(rightLineIndex);
    rightLineGeom.computeVertexNormals();
    const rightLineMesh = new THREE.Mesh(rightLineGeom, lineMat);
    this.environmentGroup.add(rightLineMesh);

    // 6. Create Yellow Dashed Center Line
    const centerLineGeom = new THREE.BufferGeometry();
    const centerLinePos: number[] = [];
    const centerLineIndex: number[] = [];
    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    let centerVertIndex = 0;
    for (let i = 0; i < samplePoints.length - 1; i++) {
      // Draw dashes: 3 segments visible, 3 segments blank
      if (Math.floor(i / 4) % 2 === 0) {
        const pt = samplePoints[i];
        const ptNext = samplePoints[i + 1];
        const normal = normals[i];
        const normalNext = normals[i + 1];

        const c1 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, 0.1);
        const c2 = new THREE.Vector3(pt.x, 0.052, pt.z).addScaledVector(normal, -0.1);
        const c1Next = new THREE.Vector3(ptNext.x, 0.052, ptNext.z).addScaledVector(normalNext, 0.1);
        const c2Next = new THREE.Vector3(ptNext.x, 0.052, ptNext.z).addScaledVector(normalNext, -0.1);

        centerLinePos.push(c1.x, c1.y, c1.z);
        centerLinePos.push(c2.x, c2.y, c2.z);
        centerLinePos.push(c1Next.x, c1Next.y, c1Next.z);
        centerLinePos.push(c2Next.x, c2Next.y, c2Next.z);

        const v0 = centerVertIndex;
        const v1 = centerVertIndex + 1;
        const v2 = centerVertIndex + 2;
        const v3 = centerVertIndex + 3;

        centerLineIndex.push(v0, v1, v2);
        centerLineIndex.push(v1, v3, v2);

        centerVertIndex += 4;
      }
    }

    if (centerLinePos.length > 0) {
      centerLineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(centerLinePos), 3));
      centerLineGeom.setIndex(centerLineIndex);
      centerLineGeom.computeVertexNormals();
      const centerLineMesh = new THREE.Mesh(centerLineGeom, yellowMat);
      this.environmentGroup.add(centerLineMesh);
    }

    if (HaveCrub) {
      // 7. Create Alternating Red & White Curbs
      const redCurbGeom = new THREE.BufferGeometry();
      const whiteCurbGeom = new THREE.BufferGeometry();

      const redCurbPos: number[] = [];
      const redCurbIndex: number[] = [];
      let redCurbVertIndex = 0;

      const whiteCurbPos: number[] = [];
      const whiteCurbIndex: number[] = [];
      let whiteCurbVertIndex = 0;

      const curbWidth = this.curbWidth;
      const curbHeight = this.curbHeight;

      // Helper to add a 3D curb segment (top face + inner face)
      const addCurbFace = (
        innerB: THREE.Vector3, innerT: THREE.Vector3, outerT: THREE.Vector3,
        innerB_next: THREE.Vector3, innerT_next: THREE.Vector3, outerT_next: THREE.Vector3,
        posArray: number[], indexArray: number[], vertIndex: number
      ): number => {
        // Inner Face (Inner Bottom, Inner Top, Inner Bottom Next, Inner Top Next)
        posArray.push(innerB.x, innerB.y, innerB.z); // 0
        posArray.push(innerT.x, innerT.y, innerT.z); // 1
        posArray.push(innerB_next.x, innerB_next.y, innerB_next.z); // 2
        posArray.push(innerT_next.x, innerT_next.y, innerT_next.z); // 3

        // Top Face (Inner Top, Outer Top, Inner Top Next, Outer Top Next)
        posArray.push(innerT.x, innerT.y, innerT.z); // 4
        posArray.push(outerT.x, outerT.y, outerT.z); // 5
        posArray.push(innerT_next.x, innerT_next.y, innerT_next.z); // 6
        posArray.push(outerT_next.x, outerT_next.y, outerT_next.z); // 7

        // Indices
        // Inner face triangles
        indexArray.push(vertIndex + 0, vertIndex + 1, vertIndex + 2);
        indexArray.push(vertIndex + 1, vertIndex + 3, vertIndex + 2);

        // Top face triangles
        indexArray.push(vertIndex + 4, vertIndex + 5, vertIndex + 6);
        indexArray.push(vertIndex + 5, vertIndex + 7, vertIndex + 6);

        return vertIndex + 8;
      };

      for (let i = 0; i < samplePoints.length; i++) {
        const next_i = (i + 1) % samplePoints.length;

        // Alternate red and white every segment for smaller, tighter blocks (was every 4)
        const isRed = i % 2 === 0;

        const normal = normals[i];
        const normalNext = normals[next_i];

        // Add Left side curbs
        const l_inner_bottom = leftPoints[i];
        const l_inner_top = new THREE.Vector3(l_inner_bottom.x, 0.05 + curbHeight, l_inner_bottom.z);
        const l_outer_top = new THREE.Vector3().copy(l_inner_top).addScaledVector(normal, curbWidth);

        const l_inner_bottom_next = leftPoints[next_i];
        const l_inner_top_next = new THREE.Vector3(l_inner_bottom_next.x, 0.05 + curbHeight, l_inner_bottom_next.z);
        const l_outer_top_next = new THREE.Vector3().copy(l_inner_top_next).addScaledVector(normalNext, curbWidth);

        // Add Right side curbs
        const r_inner_bottom = rightPoints[i];
        const r_inner_top = new THREE.Vector3(r_inner_bottom.x, 0.05 + curbHeight, r_inner_bottom.z);
        const r_outer_top = new THREE.Vector3().copy(r_inner_top).addScaledVector(normal, -curbWidth);

        const r_inner_bottom_next = rightPoints[next_i];
        const r_inner_top_next = new THREE.Vector3(r_inner_bottom_next.x, 0.05 + curbHeight, r_inner_bottom_next.z);
        const r_outer_top_next = new THREE.Vector3().copy(r_inner_top_next).addScaledVector(normalNext, -curbWidth);

        if (isRed) {
          // Update red indexes sequentially for both left and right curbs
          redCurbVertIndex = addCurbFace(
            l_inner_bottom, l_inner_top, l_outer_top,
            l_inner_bottom_next, l_inner_top_next, l_outer_top_next,
            redCurbPos, redCurbIndex, redCurbVertIndex
          );
          redCurbVertIndex = addCurbFace(
            r_inner_bottom, r_inner_top, r_outer_top,
            r_inner_bottom_next, r_inner_top_next, r_outer_top_next,
            redCurbPos, redCurbIndex, redCurbVertIndex
          );
        } else {
          // Update white indexes sequentially for both left and right curbs
          whiteCurbVertIndex = addCurbFace(
            l_inner_bottom, l_inner_top, l_outer_top,
            l_inner_bottom_next, l_inner_top_next, l_outer_top_next,
            whiteCurbPos, whiteCurbIndex, whiteCurbVertIndex
          );
          whiteCurbVertIndex = addCurbFace(
            r_inner_bottom, r_inner_top, r_outer_top,
            r_inner_bottom_next, r_inner_top_next, r_outer_top_next,
            whiteCurbPos, whiteCurbIndex, whiteCurbVertIndex
          );
        }
      }

      const redCurbMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, // Red
        emissive: 0xef4444,
        emissiveIntensity: 0.7,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
      });

      const whiteCurbMat = new THREE.MeshStandardMaterial({
        color: 0xfafafa, // White
        emissive: 0xfafafa,
        emissiveIntensity: 0.35,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide
      });

      if (redCurbPos.length > 0) {
        redCurbGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(redCurbPos), 3));
        redCurbGeom.setIndex(redCurbIndex);
        redCurbGeom.computeVertexNormals();
        const redCurbMesh = new THREE.Mesh(redCurbGeom, redCurbMat);
        this.environmentGroup.add(redCurbMesh);
      }

      if (whiteCurbPos.length > 0) {
        whiteCurbGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(whiteCurbPos), 3));
        whiteCurbGeom.setIndex(whiteCurbIndex);
        whiteCurbGeom.computeVertexNormals();
        const whiteCurbMesh = new THREE.Mesh(whiteCurbGeom, whiteCurbMat);
        this.environmentGroup.add(whiteCurbMesh);
      }
    }

    // 7.5. Create Grass Ribbon (after curb but before fence)
    if (HaveGrass) {
      const grassGeom = new THREE.BufferGeometry();
      const grassPos: number[] = [];
      const grassIndex: number[] = [];
      let grassVertIndex = 0;

      const innerOffset = roadWidth / 2 + (HaveCrub ? this.curbWidth : 0);
      const outerOffset = innerOffset + this.grassWidth;

      const innerHeight = 0.05 + (HaveCrub ? this.curbHeight : 0);
      const outerHeight = 0.02;

      for (let i = 0; i < samplePoints.length; i++) {
        const next_i = (i + 1) % samplePoints.length;
        const pt = samplePoints[i];
        const ptNext = samplePoints[next_i];
        const normal = normals[i];
        const normalNext = normals[next_i];

        // Left grass vertices (sloped from innerHeight down to outerHeight)
        const l_in = new THREE.Vector3(pt.x, innerHeight, pt.z).addScaledVector(normal, innerOffset);
        const l_out = new THREE.Vector3(pt.x, outerHeight, pt.z).addScaledVector(normal, outerOffset);
        const l_in_next = new THREE.Vector3(ptNext.x, innerHeight, ptNext.z).addScaledVector(normalNext, innerOffset);
        const l_out_next = new THREE.Vector3(ptNext.x, outerHeight, ptNext.z).addScaledVector(normalNext, outerOffset);

        // Right grass vertices
        const r_in = new THREE.Vector3(pt.x, innerHeight, pt.z).addScaledVector(normal, -innerOffset);
        const r_out = new THREE.Vector3(pt.x, outerHeight, pt.z).addScaledVector(normal, -outerOffset);
        const r_in_next = new THREE.Vector3(ptNext.x, innerHeight, ptNext.z).addScaledVector(normalNext, -innerOffset);
        const r_out_next = new THREE.Vector3(ptNext.x, outerHeight, ptNext.z).addScaledVector(normalNext, -outerOffset);

        // Left side grass ground
        grassPos.push(l_in.x, l_in.y, l_in.z);
        grassPos.push(l_out.x, l_out.y, l_out.z);
        grassPos.push(l_in_next.x, l_in_next.y, l_in_next.z);
        grassPos.push(l_out_next.x, l_out_next.y, l_out_next.z);

        grassIndex.push(grassVertIndex + 0, grassVertIndex + 1, grassVertIndex + 2);
        grassIndex.push(grassVertIndex + 1, grassVertIndex + 3, grassVertIndex + 2);
        grassVertIndex += 4;

        // Right side grass ground
        grassPos.push(r_in.x, r_in.y, r_in.z);
        grassPos.push(r_out.x, r_out.y, r_out.z);
        grassPos.push(r_in_next.x, r_in_next.y, r_in_next.z);
        grassPos.push(r_out_next.x, r_out_next.y, r_out_next.z);

        grassIndex.push(grassVertIndex + 0, grassVertIndex + 2, grassVertIndex + 1);
        grassIndex.push(grassVertIndex + 1, grassVertIndex + 2, grassVertIndex + 3);
        grassVertIndex += 4;
      }

      grassGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grassPos), 3));
      grassGeom.setIndex(grassIndex);
      grassGeom.computeVertexNormals();

      const grassMat = new THREE.MeshStandardMaterial({
        color: 0x7bb369, // User-requested fresh sage green ground
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      const uniforms = this.grassUniforms;
      grassMat.customProgramCacheKey = () => 'grass_ground';
      grassMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = `
          uniform float uTime;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          // Slight ground wave animation
          float wave = sin(position.x * 0.12 + position.z * 0.12 + uTime * 2.8) * 0.05;
          transformed.y += wave;
          `
        );
      };

      const grassMesh = new THREE.Mesh(grassGeom, grassMat);
      this.environmentGroup.add(grassMesh);

      // Create 3D Grass Leaves/Blades growing out of the sloped ground
      const bladeGeom = new THREE.BufferGeometry();
      const bladeVertices = new Float32Array([
        -0.07, 0, 0,   // bottom left
        0.07, 0, 0,   // bottom right
        0.0, 0.55, 0  // top tip
      ]);
      bladeGeom.setAttribute('position', new THREE.BufferAttribute(bladeVertices, 3));
      bladeGeom.computeVertexNormals();

      const leavesMat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      leavesMat.customProgramCacheKey = () => 'grass_leaves';
      leavesMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = `
          uniform float uTime;
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          // Wind waving effect: tip waves back and forth, base remains fixed
          float wave = sin(position.x * 0.12 + position.z * 0.12 + uTime * 2.8) * 0.22;
          float factor = position.y; // 0 at base, 0.55 at tip
          transformed.x += wave * factor * 1.5;
          transformed.z += wave * factor * 1.5;
          `
        );
      };

      const bladesPerSegment = 150;
      const totalInstances = samplePoints.length * bladesPerSegment * 2;
      const grassBladesMesh = new THREE.InstancedMesh(bladeGeom, leavesMat, totalInstances);

      const leafColors = [
        new THREE.Color(0x2ecc71), // fresh spring green
        new THREE.Color(0x27ae60), // rich green
        new THREE.Color(0xa3e635), // fresh lime green
        new THREE.Color(0x4ade80), // bright neon light green
        new THREE.Color(0x10b981), // vibrant emerald
        new THREE.Color(0x7bb369)  // user-requested fresh green
      ];

      let bladeIndex = 0;
      const dummy = new THREE.Object3D();

      for (let i = 0; i < samplePoints.length; i++) {
        const pt = samplePoints[i];
        const normal = normals[i];

        const tangent = new THREE.Vector3();
        if (i < samplePoints.length - 1) {
          tangent.subVectors(samplePoints[i + 1], pt).normalize();
        } else {
          tangent.subVectors(samplePoints[1], samplePoints[0]).normalize();
        }

        for (let side = 0; side < 2; side++) {
          const sideSign = side === 0 ? 1 : -1;

          for (let b = 0; b < bladesPerSegment; b++) {
            // Scatter randomly within the grass strip
            const randomNormOffset = innerOffset + Math.random() * this.grassWidth;
            const randomTangOffset = (Math.random() - 0.5) * 4.0;

            const bladePos = new THREE.Vector3()
              .copy(pt)
              .addScaledVector(normal, sideSign * randomNormOffset)
              .addScaledVector(tangent, randomTangOffset);

            // Interpolate height on the slope
            const t = (randomNormOffset - innerOffset) / this.grassWidth;
            bladePos.y = THREE.MathUtils.lerp(innerHeight, outerHeight, t);

            dummy.position.copy(bladePos);
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);

            const randomHeightScale = 0.7 + Math.random() * 0.6;
            const randomWidthScale = 0.8 + Math.random() * 0.4;
            dummy.scale.set(randomWidthScale, randomHeightScale, randomWidthScale);

            dummy.updateMatrix();
            grassBladesMesh.setMatrixAt(bladeIndex, dummy.matrix);

            // Set color
            const randColor = leafColors[Math.floor(Math.random() * leafColors.length)];
            grassBladesMesh.setColorAt(bladeIndex, randColor);

            bladeIndex++;
          }
        }
      }

      if (grassBladesMesh.instanceColor) {
        grassBladesMesh.instanceColor.needsUpdate = true;
      }
      this.environmentGroup.add(grassBladesMesh);
    }

    // 8. Create Normal Racing Fences (Motorsport Steel Guardrails or Silverstone Catch Fences on Concrete Barriers)
    if (HaveFence) {
      const leftBoundPoints: THREE.Vector3[] = [];
      const rightBoundPoints: THREE.Vector3[] = [];

      for (let i = 0; i < samplePoints.length; i++) {
        const pt = samplePoints[i];
        const normal = normals[i];
        const halfWidth = roadWidth / 2;
        const totalOffset = halfWidth + (HaveCrub ? this.curbWidth : 0) + (HaveGrass ? this.grassWidth : 0);

        // Left boundary point
        const leftBound = new THREE.Vector3(pt.x, 0.05, pt.z).addScaledVector(normal, totalOffset);
        // Right boundary point
        const rightBound = new THREE.Vector3(pt.x, 0.05, pt.z).addScaledVector(normal, -totalOffset);

        leftBoundPoints.push(leftBound);
        rightBoundPoints.push(rightBound);
      }

      // Render Concrete Barriers under the fences (only for Silverstone)
      const isSilverstone = FenceType === 'silverstone';
      const activeBlockHeight = isSilverstone ? this.concreteHeight : 0.0;

      const createConcreteBlock = (boundPts: THREE.Vector3[], normalSigns: number[]): THREE.Mesh => {
        const geom = new THREE.BufferGeometry();
        const vertices = new Float32Array(boundPts.length * 4 * 3);
        const indices: number[] = [];

        for (let i = 0; i < boundPts.length; i++) {
          const base = boundPts[i];
          const normalL = normals[i];
          const sign = normalSigns[i];

          const inB = base;
          const outB = base.clone().addScaledVector(normalL, sign * this.concreteBaseWidth);
          const inT = new THREE.Vector3(inB.x, inB.y + this.concreteHeight, inB.z);
          const outT = new THREE.Vector3(inB.x, inB.y + this.concreteHeight, inB.z).addScaledVector(normalL, sign * this.concreteTopWidth);

          const idx = i * 4;
          vertices[idx * 3] = inB.x;
          vertices[idx * 3 + 1] = inB.y;
          vertices[idx * 3 + 2] = inB.z;

          vertices[(idx + 1) * 3] = outB.x;
          vertices[(idx + 1) * 3 + 1] = outB.y;
          vertices[(idx + 1) * 3 + 2] = outB.z;

          vertices[(idx + 2) * 3] = inT.x;
          vertices[(idx + 2) * 3 + 1] = inT.y;
          vertices[(idx + 2) * 3 + 2] = inT.z;

          vertices[(idx + 3) * 3] = outT.x;
          vertices[(idx + 3) * 3 + 1] = outT.y;
          vertices[(idx + 3) * 3 + 2] = outT.z;
        }

        for (let i = 0; i < boundPts.length; i++) {
          const next_i = (i + 1) % boundPts.length;

          const c_inB = i * 4;
          const c_inT = i * 4 + 2;
          const c_outT = i * 4 + 3;

          const n_inB = next_i * 4;
          const n_inT = next_i * 4 + 2;
          const n_outT = next_i * 4 + 3;

          // Inner Face (inB, inT, n_inB, n_inT)
          indices.push(c_inB, c_inT, n_inB);
          indices.push(c_inT, n_inT, n_inB);

          // Top Face (inT, outT, n_inT, n_outT)
          indices.push(c_inT, c_outT, n_inT);
          indices.push(c_outT, n_outT, n_inT);

          // Outer Face (outT, outB, n_outT, n_outB)
          const c_outB = i * 4 + 1;
          const n_outB = next_i * 4 + 1;
          indices.push(c_outT, c_outB, n_outT);
          indices.push(c_outB, n_outB, n_outT);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const concreteMat = new THREE.MeshStandardMaterial({
          color: 0xc4c4ca, // Silver concrete
          roughness: 0.95,
          metalness: 0.05,
          side: THREE.DoubleSide
        });

        return new THREE.Mesh(geom, concreteMat);
      };

      if (isSilverstone) {
        const leftConcreteSigns = Array(samplePoints.length).fill(1);
        const leftConcrete = createConcreteBlock(leftBoundPoints, leftConcreteSigns);
        this.environmentGroup.add(leftConcrete);

        const rightConcreteSigns = Array(samplePoints.length).fill(-1);
        const rightConcrete = createConcreteBlock(rightBoundPoints, rightConcreteSigns);
        this.environmentGroup.add(rightConcrete);
      }

      if (FenceType === 'silverstone') {
        // --- SILVERSTONE CATCH FENCE (on top of concrete wall) ---
        const postMat = new THREE.MeshStandardMaterial({
          color: 0x4a4a50, // Dark grey poles
          metalness: 0.85,
          roughness: 0.3
        });

        const fenceMat = new THREE.MeshStandardMaterial({
          color: 0xcccccc, // Light grey wire mesh
          metalness: 0.5,
          roughness: 0.5,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });

        const cableMat = new THREE.MeshStandardMaterial({
          color: 0x333338, // Dark steel cables
          metalness: 0.9,
          roughness: 0.2,
          side: THREE.DoubleSide
        });

        // 1. Draw leaning posts (InstancedMesh)
        const postGeom = new THREE.BoxGeometry(0.12, 3.0, 0.12); // Tall 3.0 height posts
        const totalPosts = Math.ceil(samplePoints.length / 3) * 2;
        const instancedPosts = new THREE.InstancedMesh(postGeom, postMat, totalPosts);

        let postCount = 0;
        const tempObj = new THREE.Object3D();

        for (let i = 0; i < samplePoints.length; i += 3) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];
          const tangent = new THREE.Vector3();

          if (i < samplePoints.length - 1) {
            tangent.subVectors(samplePoints[i + 1], samplePoints[i]).normalize();
          } else {
            tangent.subVectors(samplePoints[1], samplePoints[0]).normalize();
          }

          // Left leaning post (tilted inwards, base shifted up to concrete top)
          tempObj.position.set(l_base.x, l_base.y + activeBlockHeight, l_base.z);
          tempObj.lookAt(tempObj.position.clone().add(tangent));
          tempObj.rotateZ(-0.25); // tilt inwards (right)
          tempObj.translateY(1.5); // position half-height up
          tempObj.updateMatrix();
          instancedPosts.setMatrixAt(postCount++, tempObj.matrix);

          // Right leaning post (tilted inwards, base shifted up to concrete top)
          tempObj.position.set(r_base.x, r_base.y + activeBlockHeight, r_base.z);
          tempObj.lookAt(tempObj.position.clone().add(tangent));
          tempObj.rotateZ(0.25); // tilt inwards (left)
          tempObj.translateY(1.5);
          tempObj.updateMatrix();
          instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
        }
        this.environmentGroup.add(instancedPosts);

        // 2. Draw wire catch fence meshes
        const leftFenceGeom = new THREE.BufferGeometry();
        const leftFencePos = new Float32Array(samplePoints.length * 2 * 3);
        const leftFenceIndex: number[] = [];

        const rightFenceGeom = new THREE.BufferGeometry();
        const rightFencePos = new Float32Array(samplePoints.length * 2 * 3);
        const rightFenceIndex: number[] = [];

        for (let i = 0; i < samplePoints.length; i++) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Leaning top coordinates: offset inwards from base
          const normalL = normals[i];
          const l_top = new THREE.Vector3(l_base.x, l_base.y + activeBlockHeight + 2.8, l_base.z).addScaledVector(normalL, -0.6); // lean inwards
          const r_top = new THREE.Vector3(r_base.x, r_base.y + activeBlockHeight + 2.8, r_base.z).addScaledVector(normalL, 0.6);  // lean inwards

          // Left fence top and bottom vertices
          leftFencePos[i * 6] = l_top.x;
          leftFencePos[i * 6 + 1] = l_top.y;
          leftFencePos[i * 6 + 2] = l_top.z;

          leftFencePos[i * 6 + 3] = l_base.x;
          leftFencePos[i * 6 + 4] = l_base.y + activeBlockHeight; // bottom starts at concrete top
          leftFencePos[i * 6 + 5] = l_base.z;

          // Right fence top and bottom vertices
          rightFencePos[i * 6] = r_top.x;
          rightFencePos[i * 6 + 1] = r_top.y;
          rightFencePos[i * 6 + 2] = r_top.z;

          rightFencePos[i * 6 + 3] = r_base.x;
          rightFencePos[i * 6 + 4] = r_base.y + activeBlockHeight; // bottom starts at concrete top
          rightFencePos[i * 6 + 5] = r_base.z;
        }

        for (let i = 0; i < samplePoints.length; i++) {
          const next_i = (i + 1) % samplePoints.length;
          const currTop = 2 * i;
          const currBottom = 2 * i + 1;
          const nextTop = 2 * next_i;
          const nextBottom = 2 * next_i + 1;

          leftFenceIndex.push(currTop, currBottom, nextTop);
          leftFenceIndex.push(currBottom, nextBottom, nextTop);

          rightFenceIndex.push(currTop, currBottom, nextTop);
          rightFenceIndex.push(currBottom, nextBottom, nextTop);
        }

        leftFenceGeom.setAttribute('position', new THREE.BufferAttribute(leftFencePos, 3));
        leftFenceGeom.setIndex(leftFenceIndex);
        leftFenceGeom.computeVertexNormals();
        const leftFenceMesh = new THREE.Mesh(leftFenceGeom, fenceMat);
        this.environmentGroup.add(leftFenceMesh);

        rightFenceGeom.setAttribute('position', new THREE.BufferAttribute(rightFencePos, 3));
        rightFenceGeom.setIndex(rightFenceIndex);
        rightFenceGeom.computeVertexNormals();
        const rightFenceMesh = new THREE.Mesh(rightFenceGeom, fenceMat);
        this.environmentGroup.add(rightFenceMesh);

        // 3. Draw horizontal cables (thin bands) running at y = concreteTop + 1.0, 2.0, 2.8
        const cableHeights = [1.0, 2.0, 2.8];
        cableHeights.forEach(h => {
          const leftCableGeom = new THREE.BufferGeometry();
          const leftCablePos = new Float32Array(samplePoints.length * 2 * 3);
          const leftCableIndex: number[] = [];

          const rightCableGeom = new THREE.BufferGeometry();
          const rightCablePos = new Float32Array(samplePoints.length * 2 * 3);
          const rightCableIndex: number[] = [];

          for (let i = 0; i < samplePoints.length; i++) {
            const l_base = leftBoundPoints[i];
            const r_base = rightBoundPoints[i];
            const normalL = normals[i];

            // Interpolate lean offset based on height fraction
            const leanOffsetFrac = h / 2.8;
            const l_pos = new THREE.Vector3(l_base.x, l_base.y + activeBlockHeight + h, l_base.z).addScaledVector(normalL, -0.6 * leanOffsetFrac);
            const r_pos = new THREE.Vector3(r_base.x, r_base.y + activeBlockHeight + h, r_base.z).addScaledVector(normalL, 0.6 * leanOffsetFrac);

            // Left cable vertices
            leftCablePos[i * 6] = l_pos.x;
            leftCablePos[i * 6 + 1] = l_pos.y + 0.02; // thin band
            leftCablePos[i * 6 + 2] = l_pos.z;

            leftCablePos[i * 6 + 3] = l_pos.x;
            leftCablePos[i * 6 + 4] = l_pos.y - 0.02;
            leftCablePos[i * 6 + 5] = l_pos.z;

            // Right cable vertices
            rightCablePos[i * 6] = r_pos.x;
            rightCablePos[i * 6 + 1] = r_pos.y + 0.02;
            rightCablePos[i * 6 + 2] = r_pos.z;

            rightCablePos[i * 6 + 3] = r_pos.x;
            rightCablePos[i * 6 + 4] = r_pos.y - 0.02;
            rightCablePos[i * 6 + 5] = r_pos.z;
          }

          for (let i = 0; i < samplePoints.length; i++) {
            const next_i = (i + 1) % samplePoints.length;
            const currTop = 2 * i;
            const currBottom = 2 * i + 1;
            const nextTop = 2 * next_i;
            const nextBottom = 2 * next_i + 1;

            leftCableIndex.push(currTop, currBottom, nextTop);
            leftCableIndex.push(currBottom, nextBottom, nextTop);

            rightCableIndex.push(currTop, currBottom, nextTop);
            rightCableIndex.push(currBottom, nextBottom, nextTop);
          }

          leftCableGeom.setAttribute('position', new THREE.BufferAttribute(leftCablePos, 3));
          leftCableGeom.setIndex(leftCableIndex);
          leftCableGeom.computeVertexNormals();
          const leftCableMesh = new THREE.Mesh(leftCableGeom, cableMat);
          this.environmentGroup.add(leftCableMesh);

          rightCableGeom.setAttribute('position', new THREE.BufferAttribute(rightCablePos, 3));
          rightCableGeom.setIndex(rightCableIndex);
          rightCableGeom.computeVertexNormals();
          const rightCableMesh = new THREE.Mesh(rightCableGeom, cableMat);
          this.environmentGroup.add(rightCableMesh);
        });

      } else {
        // --- MOTORSPORT STEEL GUARDRAILS ---
        const railMat = new THREE.MeshStandardMaterial({
          color: 0x8c8c94, // Steel gray
          metalness: 0.9,
          roughness: 0.25,
          side: THREE.DoubleSide
        });

        const postMat = new THREE.MeshStandardMaterial({
          color: 0x5a5a60, // Darker steel gray
          metalness: 0.8,
          roughness: 0.3
        });

        // Render Left Guardrail
        const leftRailGeom = new THREE.BufferGeometry();
        const leftRailPos = new Float32Array(samplePoints.length * 2 * 3);
        const leftRailIndex: number[] = [];

        // Render Right Guardrail
        const rightRailGeom = new THREE.BufferGeometry();
        const rightRailPos = new Float32Array(samplePoints.length * 2 * 3);
        const rightRailIndex: number[] = [];

        for (let i = 0; i < samplePoints.length; i++) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Left top and bottom rail vertices
          leftRailPos[i * 6] = l_base.x;
          leftRailPos[i * 6 + 1] = l_base.y + activeBlockHeight + 0.9; // top of rail (0.9 units above ground / barrier)
          leftRailPos[i * 6 + 2] = l_base.z;

          leftRailPos[i * 6 + 3] = l_base.x;
          leftRailPos[i * 6 + 4] = l_base.y + activeBlockHeight + 0.3; // bottom of rail
          leftRailPos[i * 6 + 5] = l_base.z;

          // Right top and bottom rail vertices
          rightRailPos[i * 6] = r_base.x;
          rightRailPos[i * 6 + 1] = r_base.y + activeBlockHeight + 0.9;
          rightRailPos[i * 6 + 2] = r_base.z;

          rightRailPos[i * 6 + 3] = r_base.x;
          rightRailPos[i * 6 + 4] = r_base.y + activeBlockHeight + 0.3;
          rightRailPos[i * 6 + 5] = r_base.z;
        }

        for (let i = 0; i < samplePoints.length; i++) {
          const next_i = (i + 1) % samplePoints.length;
          const currTop = 2 * i;
          const currBottom = 2 * i + 1;
          const nextTop = 2 * next_i;
          const nextBottom = 2 * next_i + 1;

          leftRailIndex.push(currTop, currBottom, nextTop);
          leftRailIndex.push(currBottom, nextBottom, nextTop);

          rightRailIndex.push(currTop, currBottom, nextTop);
          rightRailIndex.push(currBottom, nextBottom, nextTop);
        }

        leftRailGeom.setAttribute('position', new THREE.BufferAttribute(leftRailPos, 3));
        leftRailGeom.setIndex(leftRailIndex);
        leftRailGeom.computeVertexNormals();
        const leftRailMesh = new THREE.Mesh(leftRailGeom, railMat);
        this.environmentGroup.add(leftRailMesh);

        rightRailGeom.setAttribute('position', new THREE.BufferAttribute(rightRailPos, 3));
        rightRailGeom.setIndex(rightRailIndex);
        rightRailGeom.computeVertexNormals();
        const rightRailMesh = new THREE.Mesh(rightRailGeom, railMat);
        this.environmentGroup.add(rightRailMesh);

        // Render Guardrail Posts using InstancedMesh for performance (placed every 3 segments)
        const postGeom = new THREE.BoxGeometry(0.16, 1.2, 0.16); // 1.2 units height
        const totalPosts = Math.ceil(samplePoints.length / 3) * 2;
        const instancedPosts = new THREE.InstancedMesh(postGeom, postMat, totalPosts);

        let postCount = 0;
        const tempObj = new THREE.Object3D();
        for (let i = 0; i < samplePoints.length; i += 3) {
          const l_base = leftBoundPoints[i];
          const r_base = rightBoundPoints[i];

          // Left post (slightly offset outwards along normal direction)
          const normalL = normals[i];
          const postL_pos = l_base.clone().addScaledVector(normalL, 0.05); // push post behind the rail
          tempObj.position.set(postL_pos.x, postL_pos.y + activeBlockHeight + 0.6, postL_pos.z); // center of post
          tempObj.updateMatrix();
          instancedPosts.setMatrixAt(postCount++, tempObj.matrix);

          // Right post (slightly offset outwards along negative normal direction)
          const postR_pos = r_base.clone().addScaledVector(normalL, -0.05);
          tempObj.position.set(postR_pos.x, postR_pos.y + activeBlockHeight + 0.6, postR_pos.z);
          tempObj.updateMatrix();
          instancedPosts.setMatrixAt(postCount++, tempObj.matrix);
        }
        this.environmentGroup.add(instancedPosts);
      }
    }
  }

  public getTrackInfo(x: number, z: number): { dist: number; closestPt: THREE.Vector3 } {
    if (this.roadSamplePoints.length === 0) {
      return { dist: 0, closestPt: new THREE.Vector3(x, 0, z) };
    }

    let minDistSq = Infinity;
    let closestIdx = 0;
    const px = x;
    const pz = z;
    const len = this.roadSamplePoints.length;

    // Two-pass search: coarse pass checking every 10th point
    for (let i = 0; i < len; i += 10) {
      const spt = this.roadSamplePoints[i];
      const dx = spt.x - px;
      const dz = spt.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }

    // Fine pass checking a local window around the closest coarse index
    const start = Math.max(0, closestIdx - 10);
    const end = Math.min(len - 1, closestIdx + 10);
    for (let i = start; i <= end; i++) {
      const spt = this.roadSamplePoints[i];
      const dx = spt.x - px;
      const dz = spt.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestIdx = i;
      }
    }

    return {
      dist: Math.sqrt(minDistSq),
      closestPt: this.roadSamplePoints[closestIdx].clone()
    };
  }

  public getGroundHeight(x: number, z: number): number {
    if (this.roadSamplePoints.length === 0) return 0;
    if (!this.haveFence) {
      // If we don't have a fence, wait, we might still have a curb!
      // But actually, we only check ground height if HaveCrub is true
    }

    const info = this.getTrackInfo(x, z);
    const halfWidth = this.roadWidth / 2;

    // If we are beyond the asphalt road but within the curb width, return curbHeight
    if (info.dist >= halfWidth && info.dist <= halfWidth + this.curbWidth) {
      return this.curbHeight;
    }

    return 0;
  }
}
