// 3D game scene setup and animation loop are implemented in main.js (GameScene class)
// This module can be extended for additional scene types (e.g. lobby 3D, gacha 3D stage).
function createDefaultScene(renderer, canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1220);
  const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  return { scene, camera };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createDefaultScene };
