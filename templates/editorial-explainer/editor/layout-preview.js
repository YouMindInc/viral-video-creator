// This script is injected only into the editor's still preview, never into a HyperFrames render.
const stageTime = 1;
const names = { brand: '品牌', headline: '標題', visual: '上方內容', label: '內容標籤', captions: '字幕', persona: '人物區' };
const selectors = { brand: '#brand', headline: '#headline', visual: '#visual-shell', label: '#visual-label', captions: '#subtitle-zone', persona: '#persona' };
const guidesStyle = document.createElement('style');
guidesStyle.textContent = '.show-guides .positioned{outline:2px dashed #b07960;position:relative}.show-guides .positioned::after{content:attr(data-guide);position:absolute;top:-29px;left:0;background:#e9eae1e8;color:#675747;font:20px/26px sans-serif;padding:0 7px;z-index:20;pointer-events:none}';
document.head.append(guidesStyle);
function sampleTime() {
  window.__timelines?.['news-channel']?.seek(stageTime, true);
  document.querySelectorAll('.caption').forEach(el => { const t = Number(el.dataset.start), d = Number(el.dataset.duration); el.style.display = stageTime >= t && stageTime < t + d ? 'flex' : 'none'; });
  document.querySelectorAll('video').forEach(video => { video.muted = true; const seek = () => { video.pause(); video.currentTime = Math.min(stageTime, Math.max(0, video.duration - .05)); }; if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true }); });
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== 'layout-update') return;
  const { config: c, guides, mode } = event.data;
  document.body.classList.toggle('show-guides', guides);
  document.body.style.background = c.background; document.querySelector('#news-channel').style.background = c.background;
  document.querySelector('#news-channel').style.color = c.ink; document.querySelector('#brand svg').style.color = c.accent;
  document.querySelector('#brand span').textContent = c.brand;
  const title = document.querySelector('#headline'); title.replaceChildren(...c.headline.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
  document.querySelector('#visual-label').textContent = c.visual.label;
  document.querySelectorAll('#visual-video,#visual-poster').forEach(el => { el.style.objectFit = c.visual.fit; });
  Object.entries(c.layout).forEach(([key, box]) => {
    const el = document.querySelector(selectors[key]); el.dataset.guide = names[key];
    Object.assign(el.style, { marginLeft: box.x + 'px', marginTop: box.y + 'px', width: box.width + 'px', height: box.height + 'px' });
    if (box.fontSize !== undefined) el.style.fontSize = box.fontSize + 'px';
    if (box.radius !== undefined) el.style.borderRadius = box.radius + 'px';
  });
  document.querySelector('#persona-inner').style.transform = 'scale(' + c.layout.persona.width / 1080 + ')';
  if (mode === 'original') {
    const video = document.querySelector('#persona-scene');
    if (video) video.style.top = -Math.floor(c.persona.cropY / 2) * 2 + 'px';
  }
  if (!c.captions) {
    const zone = document.querySelector('#subtitle-zone'); zone.replaceChildren();
    if (c.fallbackCaption) { const div = document.createElement('div'); div.className = 'caption'; div.style.display = 'flex'; const span = document.createElement('span'); span.className = 'caption-text'; span.textContent = c.fallbackCaption; div.append(span); zone.append(div); }
  }
  document.querySelectorAll('#headline span').forEach(el => fitLine(el, title.clientWidth));
  const brand = document.querySelector('#brand span'); brand.style.fontSize = ''; fitLine(brand, c.layout.brand.width - 70);
  document.querySelectorAll('.caption-text').forEach(el => { el.style.fontSize = c.layout.captions.fontSize + 'px'; fitLine(el, c.layout.captions.width - 46); });
});
window.addEventListener('load', sampleTime);
sampleTime();
parent.postMessage({ type: 'layout-ready' }, location.origin);
