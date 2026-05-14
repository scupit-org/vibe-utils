import type { ContainerRefs } from './types';

/**
 * Required element IDs that both the bundled stylesheet and this helper
 * rely on. Host pages must include elements with these IDs.
 */
export const REQUIRED_CONTAINER_IDS = {
  sceneContainer: 'scene-container',
  contentContainer: 'page-content-container',
  planesSource: 'zoom-planes-source',
  backButton: 'back-button',
} as const;

/**
 * Resolves the {@link ContainerRefs} struct by locating the package's
 * required elements in the current document by ID.
 *
 * The three required containers (`#scene-container`,
 * `#page-content-container`, `#zoom-planes-source`) throw a
 * `ReferenceError` listing any that are missing. The `#back-button` is
 * optional and resolves to `null` when absent.
 *
 * The IDs are part of the package contract — the bundled stylesheet
 * targets the same selectors. Do not rename them in your markup.
 *
 * @example
 * ```ts
 * const navigation = new ZoomPlaneNavigator(resolveContainerRefs());
 * ```
 */
export function resolveContainerRefs(): ContainerRefs {
  const sceneContainer = document.getElementById(REQUIRED_CONTAINER_IDS.sceneContainer);
  const contentContainer = document.getElementById(REQUIRED_CONTAINER_IDS.contentContainer);
  const planesSource = document.getElementById(REQUIRED_CONTAINER_IDS.planesSource);
  const backButton = document.getElementById(REQUIRED_CONTAINER_IDS.backButton);

  const missing: string[] = [];
  if (!sceneContainer) missing.push(`#${REQUIRED_CONTAINER_IDS.sceneContainer}`);
  if (!contentContainer) missing.push(`#${REQUIRED_CONTAINER_IDS.contentContainer}`);
  if (!planesSource) missing.push(`#${REQUIRED_CONTAINER_IDS.planesSource}`);

  if (missing.length > 0) {
    throw new ReferenceError(
      `resolveContainerRefs: required element(s) not found: ${missing.join(', ')}. ` +
      `The @scupit/web-3d-panel-navigation package requires these IDs to be present in the document.`,
    );
  }

  return {
    sceneContainer: sceneContainer!,
    contentContainer: contentContainer!,
    planesSource: planesSource!,
    backButton,
  };
}
