// Keep both the page controls and system controls attached to the native player.
export function setupPlayer(audio) {
  setupMediaSession(audio);
  return import("./vendor/plyr/plyr.js?v=3.8.4").then(({ default: Plyr }) => {
    const player = new Plyr(audio, {
      iconUrl: new URL("./vendor/plyr/plyr.svg?v=3.8.4", import.meta.url).href,
      controls: ["play", "rewind", "progress", "current-time", "duration", "settings"],
      seekTime: 10,
      settings: ["speed"],
      storage: { enabled: false },
      mediaMetadata: false,
      speed: { selected: audio.playbackRate, options: [.75, 1, 1.25, 1.5, 2] },
    });
    // Plyr saves a clone for destroy(); a MediaSource cannot feed two elements.
    player.elements.original.removeAttribute("src");
    player.elements.original.load();
    return player;
  }).catch(() => { audio.controls = true; return null; });
}

function setupMediaSession(audio) {
  const media = navigator.mediaSession;
  if (!media) return;
  const attempt = action => { try { action(); } catch {} };
  const seek = (position, fast = false) => {
    if (!Number.isFinite(position) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    position = Math.max(0, Math.min(position, audio.duration));
    attempt(() => fast && audio.fastSeek ? audio.fastSeek(position) : audio.currentTime = position);
  };
  const offset = value => Number.isFinite(value) && value > 0 ? value : 10;
  const actions = {
    play: () => { audio.play().catch(() => {}); },
    pause: () => audio.pause(),
    seekbackward: details => seek(audio.currentTime - offset(details.seekOffset)),
    seekforward: details => seek(audio.currentTime + offset(details.seekOffset)),
    seekto: details => seek(details.seekTime, details.fastSeek),
  };
  for (const [name, handler] of Object.entries(actions)) attempt(() => media.setActionHandler(name, handler));

  let active = false;
  let lastPositionUpdate = -Infinity;
  const update = event => {
    const hasSource = Boolean(audio.getAttribute("src"));
    if (hasSource !== active) {
      active = hasSource;
      attempt(() => { media.metadata = active && window.MediaMetadata ? new MediaMetadata({ title: "narrate.sh", artist: "Kitten Micro" }) : null; });
    }
    attempt(() => { media.playbackState = !active ? "none" : audio.paused || audio.ended ? "paused" : "playing"; });
    const now = performance.now();
    if (event?.type === "timeupdate" && now - lastPositionUpdate < 1000) return;
    lastPositionUpdate = now;
    attempt(() => {
      const { duration, currentTime, playbackRate } = audio;
      if (!active || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime) || !Number.isFinite(playbackRate) || playbackRate <= 0) media.setPositionState();
      else media.setPositionState({ duration, position: Math.max(0, Math.min(currentTime, duration)), playbackRate });
    });
  };
  for (const event of ["loadedmetadata", "durationchange", "play", "playing", "pause", "ended", "emptied", "seeked", "ratechange", "timeupdate"]) audio.addEventListener(event, update);
  update();
}
