import { Color, NoToneMapping, PCFShadowMap, PMREMGenerator, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createRenderer(container: HTMLElement): { renderer: WebGLRenderer; scene: Scene } {
  const renderer = new WebGLRenderer({
    antialias: false, // the post-processing chain handles the final image
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Tone mapping happens in the post-processing chain (ToneMappingEffect).
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#000000');
  // A soft studio environment gives wet tissue and steel something to reflect.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.14;
  pmrem.dispose();

  return { renderer, scene };
}
