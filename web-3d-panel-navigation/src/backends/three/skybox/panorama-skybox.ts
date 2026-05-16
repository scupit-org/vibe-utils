import { Group, Texture, Scene, TextureLoader, EquirectangularReflectionMapping, SRGBColorSpace } from "three";
import type { Skybox } from "./skybox";

/**
 * Equirectangular panorama provider. `url` points to a 2:1-aspect image
 * (e.g. 4096x2048 JPG/PNG). For HDR panoramas, use a dedicated RGBELoader-
 * backed provider in a follow-up; standard TextureLoader handles LDR only.
 */
export interface PanoramaSkyboxOptions {
  url: string;
}

export function createPanoramaSkybox(options: PanoramaSkyboxOptions): Skybox {
  const root = new Group();
  let texture: Texture | null = null;
  let attachedScene: Scene | null = null;
  let disposed = false;

  const loader = new TextureLoader();
  const ready = loader.loadAsync(options.url).then((loaded) => {
    if (disposed) {
      loaded.dispose();
      return;
    }
    loaded.mapping = EquirectangularReflectionMapping;
    loaded.colorSpace = SRGBColorSpace;
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
