import * as THREE from "three";
import type { Skybox } from "./skybox";

/**
 * Cubemap provider. `cubeUrls` order is [+X, -X, +Y, -Y, +Z, -Z] as required
 * by THREE.CubeTextureLoader. Each image should be square; all six must share
 * the same dimensions.
 */
export interface ImageSkyboxOptions {
  cubeUrls: [string, string, string, string, string, string];
}

export function createImageSkybox(options: ImageSkyboxOptions): Skybox {
  const root = new THREE.Group();
  let texture: THREE.CubeTexture | null = null;
  let attachedScene: THREE.Scene | null = null;
  let disposed = false;

  const loader = new THREE.CubeTextureLoader();
  const ready = loader.loadAsync(options.cubeUrls).then((loaded) => {
    if (disposed) {
      loaded.dispose();
      return;
    }
    texture = loaded;
    if (attachedScene) {
      attachedScene.background = texture;
    }
  });

  return {
    root,
    ready,
    attach(scene) {
      attachedScene = scene;
      if (texture) {
        scene.background = texture;
      }
    },
    detach(scene) {
      if (scene.background === texture) {
        scene.background = null;
      }
      attachedScene = null;
    },
    dispose() {
      disposed = true;
      if (texture) {
        texture.dispose();
        texture = null;
      }
    },
  };
}
