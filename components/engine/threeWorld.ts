import * as THREE from 'three';
import { PostProcessing } from '../PostProcessing';
import { Sky } from '../objects/Sky';

export interface ThreeWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rearCamera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  ambientLight: THREE.AmbientLight;
  dirLight: THREE.DirectionalLight;
  sky: Sky;
  postProcessing: PostProcessing;
  environmentGroup: THREE.Group;
}

export function createThreeWorld(canvas: HTMLCanvasElement): ThreeWorld {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 4000);
  const rearCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const savedQuality = getSavedGraphicsQuality();
  renderer.shadowMap.enabled = savedQuality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ambientLight = new THREE.AmbientLight(0x24244d, 1.0);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(0, 100, -100);
  dirLight.castShadow = savedQuality !== 'low';

  const shadowMapSize = savedQuality === 'medium' ? 1024 : 2048;
  dirLight.shadow.mapSize.width = shadowMapSize;
  dirLight.shadow.mapSize.height = shadowMapSize;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 400;

  const shadowCameraSize = 120;
  dirLight.shadow.camera.left = -shadowCameraSize;
  dirLight.shadow.camera.right = shadowCameraSize;
  dirLight.shadow.camera.top = shadowCameraSize;
  dirLight.shadow.camera.bottom = -shadowCameraSize;
  dirLight.shadow.bias = -0.0005;

  scene.add(dirLight);
  scene.add(dirLight.target);

  const sky = new Sky(scene, renderer, ambientLight, dirLight);
  const postProcessing = new PostProcessing(renderer, scene, camera);

  const environmentGroup = new THREE.Group();
  scene.add(environmentGroup);

  return {
    scene,
    camera,
    rearCamera,
    renderer,
    ambientLight,
    dirLight,
    sky,
    postProcessing,
    environmentGroup,
  };
}

function getSavedGraphicsQuality(): 'low' | 'medium' | 'high' {
  if (typeof window === 'undefined') return 'high';
  const savedQuality = localStorage.getItem('cyberdrive_graphics_quality');
  return savedQuality === 'low' || savedQuality === 'medium' || savedQuality === 'high'
    ? savedQuality
    : 'high';
}
