'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Flag } from 'lucide-react';
import { buildDealerWorld, DealerCityKey, DealerWorld } from '../objects/DealerWorld';
import { sampleDayNight } from '../engine/dayNight';
import { CareerMapGraphics } from '../engine/CareerMapGraphics';
import { loadMapGraphics, MAP_GRAPHICS_EVENT, MapGraphicsSettings } from '../option';

/* ============================================================================
   Dealer District map. Same scale, render pipeline and live clock as the
   career map, so travelling between the two reads as one road trip: the
   career map drives out of the valley along road_approach and fades into the
   haze of the hour; here the camera comes out of that haze on the highway in
   the pass and lifts to the overview. Leaving runs the same way in reverse.
   ========================================================================== */

export interface DealerWorldMapProps {
  cities: { id: DealerCityKey; name: string }[];
  selectedCity: DealerCityKey | null;
  lastSelectedCity: DealerCityKey | null;
  hoveredCity: DealerCityKey | null;
  onHoverCity: (city: DealerCityKey | null) => void;
  onClickCity: (city: DealerCityKey) => void;
  /** Play the arrival along the highway (coming from the career map). */
  arrivingFromCareer?: boolean;
  /** Drive out along the highway; onDepartComplete fires once the screen is hazed over. */
  departingToCareer?: boolean;
  onDepartComplete?: () => void;
  /** Fires when the arrival flight has settled on the overview. */
  onArrivalComplete?: () => void;
  /** The pin over the highway was clicked: head back to the career valley. */
  onRequestCareer?: () => void;
  /** Home (the cottage in the village at the centre) was clicked. */
  onClickHome?: () => void;
}

interface Flight {
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  start: number;
  duration: number;
  /** Haze overlay: 'in' clears it at the start, 'out' fills it at the end. */
  haze: 'in' | 'out';
  done?: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function DealerWorldMap({
  cities,
  selectedCity,
  lastSelectedCity,
  hoveredCity,
  onHoverCity,
  onClickCity,
  arrivingFromCareer = false,
  departingToCareer = false,
  onDepartComplete,
  onArrivalComplete,
  onRequestCareer,
  onClickHome,
}: DealerWorldMapProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const hazeRef = useRef<HTMLDivElement | null>(null);
  const gatePinRef = useRef<HTMLButtonElement | null>(null);
  const selectedRef = useRef(selectedCity);
  const hoveredRef = useRef(hoveredCity);
  const departRef = useRef(departingToCareer);
  const callbacks = useRef({ onHoverCity, onClickCity, onDepartComplete, onArrivalComplete, onClickHome });
  // Read once: the render loop drives the haze from here on.
  const [initialHaze] = React.useState(() => ({
    opacity: arrivingFromCareer ? 1 : 0,
    backgroundColor: `#${sampleDayNight(new Date()).fog.getHexString()}`,
  }));
  const citiesRef = useRef(cities);

  useEffect(() => { selectedRef.current = selectedCity; }, [selectedCity]);
  useEffect(() => { hoveredRef.current = hoveredCity; }, [hoveredCity]);
  useEffect(() => { departRef.current = departingToCareer; }, [departingToCareer]);
  useEffect(() => { callbacks.current = { onHoverCity, onClickCity, onDepartComplete, onArrivalComplete, onClickHome }; }, [onHoverCity, onClickCity, onDepartComplete, onArrivalComplete, onClickHome]);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let width = Math.max(1, mount.clientWidth);
    let height = Math.max(1, mount.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x7fb4dd);
    scene.fog = new THREE.FogExp2(0xa8cbe4, 0.0011);
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 2600);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    // Light rig mirrors the career map's, and so does the pipeline that grades it.
    const hemi = new THREE.HemisphereLight(0xbfe4ff, 0x33632f, 0.62);
    const sun = new THREE.DirectionalLight(0xffe9c4, 1.55);
    const fill = new THREE.DirectionalLight(0x9ec4e8, 0.34);
    const bounce = new THREE.DirectionalLight(0x86b36a, 0.2);
    bounce.position.set(0, -40, 30);
    scene.add(hemi, sun, fill, bounce);

    const world: DealerWorld = buildDealerWorld();
    scene.add(world.root);
    sun.target.position.copy(world.focus);
    scene.add(sun.target);

    const graphics = new CareerMapGraphics(renderer, scene, camera, { sun, hemi, fill, bounce }, loadMapGraphics());
    graphics.prepareModel(world.root);
    const onGraphics = (e: Event) => graphics.setSettings((e as CustomEvent<MapGraphicsSettings>).detail ?? loadMapGraphics());
    window.addEventListener(MAP_GRAPHICS_EVENT, onGraphics);

    let lampsLit = false;
    let hazeColor = '#a8cbe4';
    const applyClock = () => {
      const sky = sampleDayNight(new Date(), lampsLit);
      lampsLit = sky.lampsOn;
      sun.position.copy(sky.sunDirection).multiplyScalar(420).add(sun.target.position);
      fill.position.set(-sky.sunDirection.x * 300, 180, -sky.sunDirection.z * 300);
      graphics.applyDayNight(sky);
      world.setLampsOn(sky.lampsOn);
      hazeColor = `#${sky.fog.getHexString()}`;
      if (hazeRef.current) hazeRef.current.style.backgroundColor = hazeColor;
    };
    applyClock();

    // ---------------------------------------------------------- camera
    const focus = world.focus.clone();
    const overviewDistance = () => (camera.aspect < 1 ? 540 / Math.max(0.55, camera.aspect) : 540);
    const mouse = new THREE.Vector2(0, 0);
    const overviewPose = (t: number, pos: THREE.Vector3, look: THREE.Vector3) => {
      const az = Math.sin(t * 0.07) * 0.06 + mouse.x * 0.07;
      const el = 0.6 + mouse.y * 0.03;
      const r = overviewDistance();
      pos.set(focus.x + r * Math.cos(el) * Math.sin(az), focus.y + r * Math.sin(el), focus.z + r * Math.cos(el) * Math.cos(az));
      look.copy(focus);
    };
    const cityPose = (key: DealerCityKey, pos: THREE.Vector3, look: THREE.Vector3) => {
      const c = world.cities[key].centre;
      look.set(c.x, c.y + 6, c.z);
      pos.set(c.x + 18, c.y + 62, c.z + 88);
    };

    let flight: Flight | null = null;
    const now = () => performance.now() / 1000;
    const gate = world.entry;
    const g = (fwd: number, up: number, side = 0) => {
      const n = new THREE.Vector3(-gate.forward.z, 0, gate.forward.x);
      return gate.position.clone().addScaledVector(gate.forward, fwd).addScaledVector(n, side).setY(gate.position.y + up);
    };
    const startArrival = () => {
      const endPos = new THREE.Vector3(), endLook = new THREE.Vector3();
      overviewPose(0, endPos, endLook);
      flight = {
        // Down the highway out of the pass, then lifting over the district.
        pos: new THREE.CatmullRomCurve3([g(-70, 6.5), g(-30, 6.5), g(20, 8), g(110, 30, 20), g(190, 80, 60), endPos]),
        look: new THREE.CatmullRomCurve3([g(0, 7), g(40, 6), g(90, 6), g(170, 8), focus.clone().lerp(g(200, 0), 0.4), endLook]),
        start: now(), duration: 5.0, haze: 'in',
        done: () => callbacks.current.onArrivalComplete?.(),
      };
    };
    const startDeparture = () => {
      const fromPos = camera.position.clone();
      const fromLook = new THREE.Vector3();
      camera.getWorldDirection(fromLook);
      fromLook.multiplyScalar(120).add(fromPos);
      flight = {
        pos: new THREE.CatmullRomCurve3([fromPos, g(170, 60, 40), g(60, 14, 4), g(12, 6.5), g(-30, 6.5)]),
        look: new THREE.CatmullRomCurve3([fromLook, g(40, 4), g(-10, 5), g(-60, 6), g(-110, 7)]),
        start: now(), duration: 3.0, haze: 'out',
        done: () => callbacks.current.onDepartComplete?.(),
      };
    };

    // Where the camera starts.
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let zoom = selectedRef.current ? 1 : lastSelectedCity ? 1 : 0;
    let zoomCity: DealerCityKey | null = selectedRef.current ?? lastSelectedCity;
    if (arrivingFromCareer) {
      startArrival();
    } else {
      overviewPose(0, camPos, camLook);
      if (zoomCity) {
        const cp = new THREE.Vector3(), cl = new THREE.Vector3();
        cityPose(zoomCity, cp, cl);
        camPos.lerp(cp, zoom); camLook.lerp(cl, zoom);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    }
    let departed = false;

    // ---------------------------------------------------------- picking
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-9, -9);
    type PlaceKey = DealerCityKey | 'home';
    const hits = (Object.keys(world.cities) as DealerCityKey[]).map((key) => ({ key, obj: world.cities[key].hit }));
    let rayHover: PlaceKey | null = null;
    /** Home first: it sits inside the view of the big city volumes, and must win. */
    const pick = (): PlaceKey | null => {
      if (raycaster.intersectObject(world.home.hit, false).length) return 'home';
      const hit = raycaster.intersectObjects(hits.map((h) => h.obj), false)[0];
      return hit ? hits.find((h) => h.obj === hit.object)?.key ?? null : null;
    };
    let downAt: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      mouse.set(pointer.x, pointer.y);
    };
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
    const pickAt = (e: PointerEvent): PlaceKey | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(p, camera);
      return pick();
    };
    const onUp = (e: PointerEvent) => {
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 99;
      downAt = null;
      if (moved >= 6 || flight || selectedRef.current) return;
      // Pick at the release point: a quick click may land before the hover frame.
      const key = pickAt(e);
      if (key === 'home') callbacks.current.onClickHome?.();
      else if (key) callbacks.current.onClickCity(key);
    };
    const onLeave = () => {
      pointer.set(-9, -9);
      mouse.set(0, 0);
      if (rayHover) { rayHover = null; callbacks.current.onHoverCity(null); }
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const resize = () => {
      width = Math.max(1, mount.clientWidth);
      height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      graphics.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    // ---------------------------------------------------------- loop
    let frame = 0;
    let last = performance.now();
    const t0 = last;
    let nextClock = 1;
    const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3(), projected = new THREE.Vector3();

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const nowMs = performance.now();
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const t = (nowMs - t0) / 1000;
      if (t > nextClock) { nextClock = t + 1; applyClock(); }
      world.update(t, dt);

      if (departRef.current && !departed && !(flight && flight.haze === 'out')) startDeparture();

      if (flight) {
        const u = Math.min(1, (now() - flight.start) / flight.duration);
        const e = easeInOut(u);
        camera.position.copy(flight.pos.getPoint(e));
        camera.lookAt(flight.look.getPoint(e));
        if (hazeRef.current) {
          hazeRef.current.style.opacity = flight.haze === 'in'
            ? String(1 - Math.min(1, u / 0.14))
            : String(Math.max(0, (u - 0.8) / 0.2));
        }
        if (u >= 1) {
          const done = flight.done;
          if (flight.haze === 'out') departed = true;
          // Hand over to the overview camera exactly where the flight ended.
          camPos.copy(camera.position);
          camLook.copy(flight.look.getPoint(1));
          flight = null;
          done?.();
        }
      } else if (!departed) {
        // Overview, or zoomed into the selected city.
        const sel = selectedRef.current;
        if (sel) zoomCity = sel;
        zoom = THREE.MathUtils.clamp(zoom + (sel ? dt : -dt), 0, 1);
        overviewPose(t, tmpPos, tmpLook);
        if (zoomCity && zoom > 0) {
          const cp = new THREE.Vector3(), cl = new THREE.Vector3();
          cityPose(zoomCity, cp, cl);
          const e = easeInOut(zoom);
          tmpPos.lerp(cp, e);
          tmpLook.lerp(cl, e);
        }
        camPos.lerp(tmpPos, 0.08);
        camLook.lerp(tmpLook, 0.08);
        camera.position.copy(camPos);
        camera.lookAt(camLook);
      }

      // Hover picking (not while flying or zoomed in).
      let newHover: PlaceKey | null = null;
      if (!flight && !selectedRef.current && !departed) {
        raycaster.setFromCamera(pointer, camera);
        newHover = pick();
      }
      if (newHover !== rayHover) {
        rayHover = newHover;
        callbacks.current.onHoverCity(newHover === 'home' ? null : newHover);
      }
      renderer.domElement.style.cursor = rayHover ? 'pointer' : 'default';

      const active = hoveredRef.current ?? selectedRef.current;
      hits.forEach(({ key }) => world.cities[key].setHighlight(key === active ? 1 : 0));
      const homeHovered = rayHover === 'home';
      world.home.setHighlight(homeHovered ? 1 : 0);

      // Pin over the highway back to the valley: part of the map, not a panel.
      const gatePin = gatePinRef.current;
      if (gatePin) {
        const show = !flight && !departed && !selectedRef.current && zoom < 0.05;
        projected.copy(gate.position).add(new THREE.Vector3(0, 20, 0)).project(camera);
        const px = (projected.x * 0.5 + 0.5) * width, py = (-projected.y * 0.5 + 0.5) * height;
        const onScreen = projected.z < 1 && px > 30 && px < width - 30 && py > 60 && py < height - 30;
        gatePin.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px) translate(-50%, -100%)`;
        gatePin.style.opacity = show && onScreen ? '1' : '0';
        gatePin.style.pointerEvents = show && onScreen ? 'auto' : 'none';
      }

      // Floating name over the hovered city.
      const label = labelRef.current;
      if (label) {
        const key = hoveredRef.current;
        if ((key || homeHovered) && !flight && !selectedRef.current) {
          const at = homeHovered ? world.home.centre.clone().add(new THREE.Vector3(0, 16, 0)) : world.cities[key!].centre.clone().add(new THREE.Vector3(0, 46, 0));
          projected.copy(at).project(camera);
          label.style.opacity = '1';
          label.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
          label.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
          label.textContent = homeHovered ? 'Home' : citiesRef.current.find((c) => c.id === key)?.name ?? '';
        } else {
          label.style.opacity = '0';
        }
      }

      graphics.render();
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(MAP_GRAPHICS_EVENT, onGraphics);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      world.dispose();
      graphics.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The scene is built once per mount; live props are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-[1]">
      <div ref={mountRef} className="absolute inset-0" />
      <div
        ref={labelRef}
        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full border border-white/15 bg-black/85 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white opacity-0 shadow-[0_0_20px_rgba(0,0,0,0.55)] transition-opacity duration-200"
      />
      <button
        ref={gatePinRef}
        type="button"
        onClick={() => onRequestCareer?.()}
        className="group absolute left-0 top-0 z-20 flex flex-col items-center opacity-0 transition-opacity duration-500"
        aria-label="Drive back to the Career Resort"
        title="Take the highway back to the Career Resort"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-cyan-400 bg-slate-950/90 shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_16px_rgba(34,211,238,0.4)] backdrop-blur-md transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-110">
          <Flag className="h-5 w-5 text-cyan-300" />
        </span>
        <span className="mt-1.5 whitespace-nowrap rounded-full border border-slate-700/80 bg-slate-950/85 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-zinc-200 shadow-xl backdrop-blur-md transition-colors group-hover:border-white group-hover:bg-slate-900 group-hover:text-white">
          Career Resort
        </span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/0 transition-colors group-hover:text-cyan-300">
          West highway
        </span>
      </button>
      <div ref={hazeRef} className="pointer-events-none absolute inset-0 z-30" style={initialHaze} />
    </div>
  );
}
