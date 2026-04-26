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

const flipCardSound = new Audio("/sounds/card-flip.mp3");
flipCardSound.volume = 0.9;

const skipSound = new Audio("/sounds/card-skip.mp3");
skipSound.volume = 0.9;

const reverseSound = new Audio("/sounds/card-reverse.mp3");
reverseSound.volume = 0.9;

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

export function playFlipCardSound() {
  play(flipCardSound);
}

export function playSkipSound() {
  play(skipSound);
}

export function playReverseSound() {
  play(reverseSound);
}

// Light-side color voiceovers (UNO Mobile-style). Dark-side colors have no
// audio — playColorSound silently no-ops for orange/pink/purple/teal.
const colorSounds: Partial<Record<string, HTMLAudioElement>> = {
  red: new Audio("/sounds/color-red.mp3"),
  yellow: new Audio("/sounds/color-yellow.mp3"),
  green: new Audio("/sounds/color-green.mp3"),
  blue: new Audio("/sounds/color-blue.mp3"),
};
for (const a of Object.values(colorSounds)) {
  if (a) a.volume = 0.9;
}

export function playColorSound(color: string) {
  const a = colorSounds[color];
  if (a) play(a);
}
