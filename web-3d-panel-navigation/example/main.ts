import { ZoomPlaneNavigator } from '../dist/index.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

function initializeNavigation(): void {
  const sceneContainer = document.getElementById('scene-container');
  const contentContainer = document.getElementById('page-content-container');
  const planesSource = document.getElementById('zoom-planes-source');
  const backButton = document.getElementById('back-button');

  if (!sceneContainer || !contentContainer || !planesSource) {
    throw new ReferenceError('Required example containers not found');
  }

  new ZoomPlaneNavigator({
    sceneContainer,
    contentContainer,
    planesSource,
    backButton,
  });
}

onReady(initializeNavigation);
