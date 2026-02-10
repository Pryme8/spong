/**
 * Sun configuration generation for level instances.
 * Uses seeded RNG to deterministically generate sun position, light color,
 * and sky parameters based on the level seed.
 * 
 * Both client and server can call generateSunConfig(seed) to get
 * identical results — the seed is the source of truth.
 */
import { SeededRandom } from './rng.js';

export interface SunConfig {
  /** Light direction (normalized, pointing FROM sun toward scene) */
  dirX: number;
  dirY: number;
  dirZ: number;

  /** Sun elevation in degrees (15-75) — stored for reference */
  elevation: number;

  /** Sun azimuth in degrees (0-360) — stored for reference */
  azimuth: number;

  /** Directional light color (RGB 0-1) */
  lightR: number;
  lightG: number;
  lightB: number;

  /** Directional light intensity */
  lightIntensity: number;

  /** Sky material: turbidity */
  turbidity: number;

  /** Sky material: rayleigh scattering */
  rayleigh: number;

  /** Sky material: mie coefficient */
  mieCoefficient: number;

  /** Sky material: mie directional g */
  mieDirectionalG: number;

  /** Sky material: luminance */
  luminance: number;

  /** Hemispheric fill light intensity */
  hemiIntensity: number;

  /** Hemispheric diffuse color (RGB 0-1) */
  hemiR: number;
  hemiG: number;
  hemiB: number;

  /** Hemispheric ground color (RGB 0-1) */
  groundR: number;
  groundG: number;
  groundB: number;

  /** Scene ambient color (RGB 0-1) */
  ambientR: number;
  ambientG: number;
  ambientB: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Generate a deterministic sun configuration from a level seed.
 * 
 * The sun elevation is randomized between 15° (golden hour) and 75° (high noon-ish).
 * The azimuth is full 360°. Light color, sky parameters, and ambient lighting
 * all shift based on how close the sun is to the horizon.
 * 
 * Low sun (15-30°): Warm golden light, high turbidity, strong scattering
 * Mid sun (30-55°): Normal daylight, balanced parameters
 * High sun (55-75°): Bright white light, clear sky, low turbidity
 */
export function generateSunConfig(seed: string): SunConfig {
  const rng = new SeededRandom(seed + '_sun');

  // Sun elevation: 15° to 75° above horizon
  const elevation = rng.range(15, 75);
  const elevationRad = elevation * Math.PI / 180;

  // Azimuth: full 360° range
  const azimuth = rng.range(0, 360);
  const azimuthRad = azimuth * Math.PI / 180;

  // Convert spherical to direction vector (pointing DOWN from sun toward scene)
  const cosElev = Math.cos(elevationRad);
  const dirX = -(cosElev * Math.sin(azimuthRad));
  const dirY = -Math.sin(elevationRad);
  const dirZ = -(cosElev * Math.cos(azimuthRad));

  // Normalize factor: 0 = horizon (15°), 1 = zenith (75°)
  const t = (elevation - 15) / 60;

  // ── Directional light color ──
  // Low sun: warm golden (1.0, 0.72, 0.42)
  // High sun: cool white  (1.0, 0.97, 0.92)
  const lightR = 1.0;
  const lightG = lerp(0.72, 0.97, t);
  const lightB = lerp(0.42, 0.92, t);

  // Intensity: lower near horizon due to atmosphere, higher when overhead
  const lightIntensity = lerp(0.6, 0.9, t);

  // ── Sky material parameters ──
  // Turbidity: hazier near horizon, clearer at zenith
  const turbidity = lerp(25, 5, t);

  // Rayleigh: stronger scattering near horizon
  const rayleigh = lerp(4, 1.5, t);

  // Mie: more forward scattering near horizon (haze/glow around sun)
  const mieCoefficient = lerp(0.015, 0.003, t);
  const mieDirectionalG = lerp(0.9, 0.76, t);

  // Luminance: slightly higher near horizon for golden glow
  const luminance = lerp(1.15, 1.0, t);

  // ── Hemispheric fill light ──
  // Low sun: warmer, dimmer fill
  // High sun: cooler sky tint, brighter fill
  const hemiIntensity = lerp(0.15, 0.3, t);
  const hemiR = lerp(0.6, 0.5, t);
  const hemiG = lerp(0.5, 0.5, t);
  const hemiB = lerp(0.4, 0.7, t);

  // Ground bounce color: warm at low sun, dark at high sun
  const groundR = lerp(0.15, 0.1, t);
  const groundG = lerp(0.1, 0.08, t);
  const groundB = lerp(0.06, 0.15, t);

  // ── Scene ambient ──
  // Slightly warmer ambient at low sun
  const ambientR = lerp(0.08, 0.05, t);
  const ambientG = lerp(0.06, 0.05, t);
  const ambientB = lerp(0.04, 0.08, t);

  return {
    dirX, dirY, dirZ,
    elevation, azimuth,
    lightR, lightG, lightB,
    lightIntensity,
    turbidity, rayleigh,
    mieCoefficient, mieDirectionalG,
    luminance,
    hemiIntensity,
    hemiR, hemiG, hemiB,
    groundR, groundG, groundB,
    ambientR, ambientG, ambientB
  };
}
