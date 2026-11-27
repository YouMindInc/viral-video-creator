/* Edit this file to reuse the template. All coordinates use a 1080 × 1920 canvas. */
window.NEWS_TEMPLATE = {
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 563 / 30,
  brand: 'YOUR BRAND',
  headline: ['Your headline.', 'One clear idea.'],
  visualLabel: 'CONTENT LABEL',
  subtitle: 'Your subtitle goes here',
  // Set src to a local PNG, WebP, MP4, or transparent WebM, relative to index.html.
  // cutout: true lets the head rise above the backdrop; false clips to the backdrop.
  persona: { src: '', type: 'image', cutout: true, objectFit: 'contain' },
  // Replace the placeholder with your own still or video. Empty src shows the placeholder.
  visual: { src: '', type: 'image', objectFit: 'cover' },
  // This is source-reference copy, not independently verified product information.
  sourceAudio: '../source/free-skills-share.mp4',
  scenes: [
    { startFrame: 0, endFrame: 87, title: ['18 free skills.', 'One animation studio.'], label: 'ANIMATION TOOLKIT', asset: 'assets/visuals/01-hook.jpg', motion: 'push' },
    { startFrame: 87, endFrame: 119, title: ['Built with', 'Claude Opus 5.5.'], label: 'ANIMATION TOOLKIT', asset: 'assets/visuals/02-attribution.jpg', motion: 'hold' },
    { startFrame: 119, endFrame: 182, title: ['Built with', 'Claude Opus 5.5.'], label: 'REPOSITORY LIST', asset: 'assets/visuals/03-repository-list.jpg', motion: 'hold' },
    { startFrame: 182, endFrame: 241, title: ['Built with', 'Claude Opus 5.5.'], label: 'REPOSITORY LIST', asset: 'assets/visuals/04-repository-scroll.jpg', motion: 'hold' },
    { startFrame: 241, endFrame: 269, title: ['Scenes, vectors', 'and more.'], label: 'MOTION CANVAS', asset: 'assets/visuals/05-scenes.jpg', motion: 'push' },
    { startFrame: 269, endFrame: 296, title: ['Scenes, vectors', 'and more.'], label: 'TWEENJS', asset: 'assets/visuals/06-timelines.jpg', motion: 'hold' },
    { startFrame: 296, endFrame: 320, title: ['Scenes, vectors', 'and more.'], label: 'TWO.JS', asset: 'assets/visuals/07-vectors.jpg', motion: 'push' },
    { startFrame: 320, endFrame: 346, title: ['Scenes, vectors', 'and more.'], label: 'PROTON', asset: 'assets/visuals/08-particles.jpg', motion: 'hold' },
    { startFrame: 346, endFrame: 373, title: ['Scenes, vectors', 'and more.'], label: 'GIFENC', asset: 'assets/visuals/09-export.jpg', motion: 'push' },
    { startFrame: 373, endFrame: 480, title: ['A full animation studio', 'in 18 repos.'], label: 'ANIMATION TOOLKIT', asset: 'assets/visuals/10-summary.jpg', motion: 'push' },
    { startFrame: 480, endFrame: 563, title: ['Get all 18', 'animation repos.'], label: 'ANIMATION TOOLKIT', asset: 'assets/visuals/11-call-to-action.jpg', motion: 'hold' }
  ],
  // Measured from burned-in caption changes at 30 fps, not a speech transcript.
  captions: [
    { startFrame: 0, endFrame: 31, text: 'None of these animations' },
    { startFrame: 31, endFrame: 87, text: 'were made in After Effects.' },
    { startFrame: 87, endFrame: 119, text: 'They were all built with' },
    { startFrame: 119, endFrame: 182, text: '18 free open-source skills' },
    { startFrame: 182, endFrame: 241, text: 'for Opus 5.5.' },
    { startFrame: 241, endFrame: 269, text: 'Scenes,' },
    { startFrame: 269, endFrame: 296, text: 'timelines,' },
    { startFrame: 296, endFrame: 320, text: 'vectors,' },
    { startFrame: 320, endFrame: 346, text: 'particles,' },
    { startFrame: 346, endFrame: 373, text: 'export.' },
    { startFrame: 373, endFrame: 426, text: 'A full animation design studio' },
    { startFrame: 426, endFrame: 480, text: 'in 18 repos.' },
    { startFrame: 480, endFrame: 503, text: 'Comment “Skill”', accent: true },
    { startFrame: 503, endFrame: 563, text: 'and I’ll send you all 18.' }
  ]
};
