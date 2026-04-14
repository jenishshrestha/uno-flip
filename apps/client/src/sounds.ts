// ─── Sound effects ───
// Pre-load audio so it plays instantly when triggered
const unoSound = new Audio("/sounds/uno.mp3");
unoSound.volume = 0.8;

const throwSound = new Audio("/sounds/card-throw.mp3");
throwSound.volume = 0.9;

const pickSound = new Audio("/sounds/card-pick.mp3");
pickSound.volume = 0.9;

const drawSound = new Audio("/sounds/card-draw.mp3");
drawSound.volume = 0.9;

function play(a: HTMLAudioElement) {
  a.currentTime = 0;
  a.play().catch(() => {
    // Browser may block autoplay until user interacts — ignore silently
  });
}

export function playUnoSound() {
  play(unoSound);
}

export function playThrowSound() {
  play(throwSound);
}

export function playPickSound() {
  play(pickSound);
}

export function playDrawSound() {
  play(drawSound);
}
