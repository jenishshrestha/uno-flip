// ─── Sound effects ───
// Pre-load audio so it plays instantly when triggered
const unoSound = new Audio("/sounds/uno.mp3");
unoSound.volume = 0.8;

export function playUnoSound() {
  // Reset to start in case it's already playing
  unoSound.currentTime = 0;
  unoSound.play().catch(() => {
    // Browser may block autoplay until user interacts — ignore silently
  });
}
