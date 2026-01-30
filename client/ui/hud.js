// HUD update helpers; main HUD logic runs in main.js GameScene.updateHUD and updateAbilityHUD
function setHudBar(elementId, ratio) {
  const el = document.getElementById(elementId);
  if (el) el.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
}
function setHudText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text;
}
