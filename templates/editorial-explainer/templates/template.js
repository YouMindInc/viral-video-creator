/* Standalone deterministic composition. Playback controls are separate from seek(). */
(() => {
  'use strict';
  const config = window.NEWS_TEMPLATE;
  if (!config) throw new Error('Missing config.js');
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const renderOnly = params.has('render');
  let mode = params.get('mode') === 'source' ? 'source' : 'template';
  let time = 0, playing = false, previousTick = null, raf = null;
  const customMedia = [];
  const audio = $('source-audio');
  const duration = config.duration;
  const error = message => { $('error-message').textContent = message; $('error-message').hidden = false; };

  function validateTimeline(items, name) {
    const frames = Math.round(duration * config.fps);
    if (!items.length || items[0].startFrame !== 0 || items.at(-1).endFrame !== frames) throw new Error(`${name} must cover frames 0–${frames}.`);
    items.forEach((item, i) => {
      if (item.endFrame <= item.startFrame || (i && item.startFrame !== items[i - 1].endFrame)) throw new Error(`${name} has a gap or overlap at item ${i}.`);
    });
  }
  validateTimeline(config.scenes, 'Scenes');
  validateTimeline(config.captions, 'Captions');

  function mediaFor(spec, container) {
    if (!spec.src) return null;
    const isVideo = spec.type === 'video';
    const media = document.createElement(isVideo ? 'video' : 'img');
    media.src = spec.src;
    media.style.objectFit = spec.objectFit || 'contain';
    if (isVideo) {
      media.muted = true; media.playsInline = true; media.preload = 'auto';
      customMedia.push(media);
    } else media.alt = container.id === 'persona-custom' ? 'Presenter' : 'Visual content';
    media.addEventListener('error', () => error(`Could not load ${spec.src}. Check the asset path in config.js.`));
    container.append(media); container.hidden = false;
    return media;
  }
  if (mediaFor(config.persona, $('persona-custom'))) {
    $('persona-placeholder').hidden = true;
    $('persona-custom').classList.toggle('boxed', !config.persona.cutout);
  }
  mediaFor(config.visual, $('custom-visual'));
  $('brand-text').textContent = config.brand;
  audio.src = config.sourceAudio;
  audio.addEventListener('error', () => { if ($('audio-enabled').checked) error('Source audio is unavailable. The visual template still works.'); });
  $('seek').max = duration;
  $('seek').step = 1 / config.fps;
  document.body.classList.toggle('render-only', renderOnly);

  function fitHeadline(lines) {
    const el = $('headline');
    if (el.dataset.lines !== JSON.stringify(lines)) {
      el.replaceChildren(...lines.map(line => { const span = document.createElement('span'); span.textContent = line; return span; }));
      el.dataset.lines = JSON.stringify(lines);
    }
    el.style.fontSize = '80px';
    let size = 80;
    while (Math.max(...[...el.children].map(child => child.scrollWidth)) > 960 && size > 42) el.style.fontSize = `${--size}px`;
  }
  function fitSubtitle(text, accent) {
    const el = $('subtitle');
    el.textContent = text;
    el.classList.toggle('accent', Boolean(accent));
    el.style.fontSize = '44px';
    let size = 44;
    while (el.scrollWidth > 940 && size > 24) el.style.fontSize = `${--size}px`;
  }
  function imageAt(el, src) {
    if (el.dataset.src !== src) { el.src = src; el.dataset.src = src; }
  }
  function seek(requestedTime) {
    time = Math.max(0, Math.min(duration, Number(requestedTime) || 0));
    // End is exclusive. Hold the last actual video frame when parked at duration.
    const frame = Math.min(Math.round(duration * config.fps) - 1, Math.floor(time * config.fps + 1e-7));
    const source = mode === 'source';
    $('visual-placeholder').hidden = source || Boolean(config.visual.src);
    $('custom-visual').hidden = source || !config.visual.src;
    $('visual-current').hidden = !source;
    $('visual-previous').hidden = !source;
    if (source) {
      const index = config.scenes.findIndex(scene => frame >= scene.startFrame && frame < scene.endFrame);
      const scene = config.scenes[index];
      const prior = config.scenes[Math.max(0, index - 1)];
      const elapsed = time - scene.startFrame / config.fps;
      const progress = Math.max(0, Math.min(1, elapsed / ((scene.endFrame - scene.startFrame) / config.fps)));
      fitHeadline(scene.title);
      $('visual-label').textContent = scene.label;
      imageAt($('visual-current'), scene.asset);
      imageAt($('visual-previous'), prior.asset);
      const blend = index === 0 ? 1 : Math.min(1, Math.max(0, elapsed / .16));
      $('visual-current').style.opacity = blend;
      $('visual-previous').style.opacity = 1 - blend;
      $('visual-current').style.transform = `scale(${scene.motion === 'push' ? 1 + .025 * progress : 1})`;
      $('visual-previous').style.transform = `scale(${prior.motion === 'push' ? 1.025 : 1})`;
      const caption = config.captions.find(item => frame >= item.startFrame && frame < item.endFrame);
      fitSubtitle(caption.text, caption.accent);
    } else {
      fitHeadline(config.headline);
      $('visual-label').textContent = config.visualLabel;
      fitSubtitle(config.subtitle, false);
    }
    if (!playing) {
      for (const media of customMedia) {
        if (Number.isFinite(media.duration)) media.currentTime = Math.min(time, Math.max(0, media.duration - 1 / config.fps));
      }
    }
    $('seek').value = time;
    $('time').value = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
    return { time, frame, mode };
  }
  function audioWanted() { return mode === 'source' && $('audio-enabled').checked; }
  function pause() {
    playing = false; previousTick = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; audio.pause(); customMedia.forEach(media => media.pause());
    $('play').textContent = 'Play'; $('play').setAttribute('aria-label', 'Play preview');
  }
  function tick(now) {
    if (!playing) return;
    if (previousTick !== null) seek(time + (now - previousTick) / 1000);
    previousTick = now;
    if (time >= duration) { pause(); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (playing) return;
    if (time >= duration) seek(0);
    playing = true; previousTick = null;
    $('play').textContent = 'Pause'; $('play').setAttribute('aria-label', 'Pause preview');
    if (audioWanted()) {
      audio.currentTime = time;
      audio.play().catch(() => { error('Audio could not start. Press Play again or turn off Source audio.'); pause(); });
    }
    customMedia.forEach(media => {
      if (Number.isFinite(media.duration)) media.currentTime = Math.min(time, Math.max(0, media.duration - 1 / config.fps));
      media.play().catch(() => error('A replacement video could not start. Check its format.'));
    });
    raf = requestAnimationFrame(tick);
  }
  function setMode(value) {
    pause(); mode = value === 'source' ? 'source' : 'template';
    $('mode').value = mode;
    $('audio-enabled').disabled = mode !== 'source';
    if (mode !== 'source') $('audio-enabled').checked = false;
    $('mode-note').textContent = mode === 'source'
      ? 'Reference copy and extracted stills. The persona stays replaceable; the source’s continuous visual animations are not reconstructed.'
      : 'Replace the visual, subtitle, and persona independently in config.js.';
    seek(time);
  }
  function resize() {
    const width = Math.max(180, window.innerWidth - (window.innerWidth <= 760 ? 24 : 60));
    const height = Math.max(300, window.innerHeight - (window.innerWidth <= 760 ? 245 : 185));
    document.documentElement.style.setProperty('--scale', Math.min(width / 1080, height / 1920, .55));
  }
  $('play').addEventListener('click', () => playing ? pause() : play());
  $('restart').addEventListener('click', () => { pause(); seek(0); });
  $('seek').addEventListener('input', event => { pause(); seek(event.target.value); });
  $('mode').addEventListener('change', event => setMode(event.target.value));
  $('guides').addEventListener('change', event => $('composition').classList.toggle('show-guides', event.target.checked));
  $('audio-enabled').addEventListener('change', () => {
    if (!audioWanted()) audio.pause();
    else if (playing) { audio.currentTime = time; audio.play().catch(() => error('Source audio could not start.')); }
  });
  window.addEventListener('resize', resize);
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && event.target === document.body && !renderOnly) { event.preventDefault(); playing ? pause() : play(); }
  });
  resize(); setMode(mode); seek(Number(params.get('t')) || 0);
  // Exposed solely for deterministic capture, independent of playback wall time.
  window.newsChannel = { seek, play, pause, setMode, config, get state() { return { time, playing, mode }; } };
  window.newsChannel.ready = Promise.all(config.scenes.map(scene => new Promise(resolve => {
    const image = new Image(); image.onload = () => resolve(true); image.onerror = () => { error(`Missing visual: ${scene.asset}`); resolve(false); }; image.src = scene.asset;
  })));
})();
