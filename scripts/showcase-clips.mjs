// Vitrine ZODIAK AI : liste versionnée des clips (prompts originaux, modèles, coûts).
// Changer un prompt ou le numéro de version puis relancer scripts/generate-showcase.mjs pour régénérer.
export const VERSION = 1;
export const MODELS = {
  image: { id: 'fal-ai/flux/schnell', sync: true, usdPerMegapixel: 0.003, license: 'Apache-2.0 (FLUX.1 [schnell])' },
  video: { id: 'fal-ai/wan/v2.2-a14b/image-to-video', usdPerSecond: 0.08, resolution: '720p', frames: 81, fps: 16, license: 'Apache-2.0 (Wan 2.2)' },
};
export const SECONDS = MODELS.video.frames / MODELS.video.fps;
export const COST_PER_CLIP = +(MODELS.video.usdPerSecond * SECONDS + MODELS.image.usdPerMegapixel).toFixed(3);
const L = 'landscape_16_9';
const P = 'portrait_16_9';
export const CLIPS = [
  { id: 'c01', title: 'Aurore sur le fjord', size: L, cam: 'drone-flyover', image: 'Aurora borealis in green and violet above a frozen fjord, snow-covered mountains, starry sky, cinematic wide shot, ultra detailed', motion: 'Slow drone flyover along the fjord, the aurora ribbons ripple and glow, stars twinkle, smooth cinematic camera movement' },
  { id: 'c02', title: 'Planète à anneaux', size: L, cam: 'orbit', image: 'A copper gas giant with thin glowing rings and a small moon, deep space, rim lighting, cinematic sci-fi illustration, highly detailed', motion: 'Slow orbit around the planet, the rings catch the light, the moon drifts in the foreground, smooth camera motion' },
  { id: 'c03', title: 'Soleil de minuit', size: L, cam: 'tilt-down', image: 'Calm ocean at sunset, golden reflections on the water, soft haze on the horizon, warm colors, photorealistic', motion: 'Camera tilts slowly down from the sun to the water, gentle waves, light sparkles on the surface' },
  { id: 'c04', title: 'Néons sous la pluie', size: L, cam: 'track-left', image: 'Futuristic city street at night in heavy rain, magenta and cyan neon signs, wet asphalt reflections, cinematic noir mood', motion: 'Camera tracks left along the street, rain falls, neon lights flicker and reflect on the wet ground' },
  { id: 'c05', title: 'Heure dorée', size: P, cam: 'dolly-in', image: 'Portrait of a woman with curly hair at golden hour, soft backlight, warm tones, shallow depth of field, photorealistic, an original fictional person', motion: 'Slow dolly-in on her face, hair moves gently in the breeze, warm light flickers, subtle natural expression' },
  { id: 'c06', title: 'Sneaker de studio', size: L, cam: 'orbit', image: 'A modern white and violet running sneaker on a dark reflective pedestal, studio product photography, dramatic rim light, generic design without logo', motion: 'Smooth 180 degree orbit around the sneaker, light sweeps across the surface, subtle reflections' },
  { id: 'c07', title: 'Cascade en forêt', size: P, cam: 'crane-up', image: 'A tall waterfall in a lush green forest, mist, sunbeams through the trees, photorealistic nature photography', motion: 'Camera cranes up along the waterfall, water flows, mist drifts, leaves sway' },
  { id: 'c08', title: 'Dunes au vent', size: L, cam: 'drone-flyover', image: 'Vast orange desert dunes at dawn, long shadows, sharp ridges, a few footprints, aerial photograph', motion: 'Drone flies forward over the dunes, wind blows sand along the crests, soft sunrise light' },
  { id: 'c09', title: 'Café en macro', size: L, cam: 'macro', image: 'Macro photo of a steaming cup of black coffee, crema swirling, dark wooden table, shallow depth of field, warm light', motion: 'Macro push-in towards the surface, steam rises and curls, the crema slowly swirls' },
  { id: 'c10', title: 'Astronaute', size: P, cam: 'handheld', image: 'Portrait of an astronaut in a white suit standing on a red desert planet, reflective visor, dust in the air, cinematic, generic suit without insignia', motion: 'Handheld camera with slight shake, dust blows across the frame, reflections move on the visor' },
  { id: 'c11', title: 'Nuages accélérés', size: L, cam: 'timelapse', image: 'Dramatic clouds over a snowy mountain range at sunset, wide landscape, saturated sky, photorealistic', motion: 'Time-lapse, clouds race across the sky, light changes from gold to pink, mountains stay still' },
  { id: 'c12', title: 'Marché de nuit', size: L, cam: 'track-right', image: 'Busy night market street with warm string lights, food stalls and steam, people as silhouettes, vivid colors, cinematic', motion: 'Camera tracks right through the market, steam rises, lights glow and sway, crowd moves softly' },
  { id: 'c13', title: 'Tunnel de vitesse', size: L, cam: 'dolly-in', image: 'A sleek futuristic car driving into a glowing tunnel of light rings, violet and cyan, motion blur, concept art, generic design without badge', motion: 'Fast forward travelling through the tunnel, light rings rush past, speed lines, smooth motion' },
  { id: 'c14', title: 'Encre dans l eau', size: L, cam: 'zoom-out', image: 'Abstract ink clouds in water, violet and teal swirls on a black background, macro photography, highly detailed', motion: 'Ink blooms and swirls slowly in the water while the camera zooms out, fluid motion' },
];
