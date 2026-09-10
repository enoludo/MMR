import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { buildCardTexture, CARD_TEXTURE_SIZE } from './cardTexture.js';
import { extractMoodColor } from './cardColor.js';
import { getPeriod, wrapHeight, helixPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();
const CARD_DEPTH = 0.04;
const EDGE_COLOR = 0x14110d;

const BLUR_START = (CONFIG.blurStartDeg * Math.PI) / 180;
const BLUR_FULL = (CONFIG.blurFullDeg * Math.PI) / 180;
const CARD_TILT = (CONFIG.cardTiltDeg * Math.PI) / 180;
const CENTERED_SCALE_RANGE = (CONFIG.centeredScaleAngleDeg * Math.PI) / 180;

function angularDistanceToZero(angle) {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(normalized, 2 * Math.PI - normalized);
}

/** 0 at/before BLUR_START, 1 at/past BLUR_FULL, smoothstep-eased in between. */
function blurAmountAt(distance) {
  const t = Math.min(1, Math.max(0, (distance - BLUR_START) / (BLUR_FULL - BLUR_START)));
  const eased = t * t * (3 - 2 * t);
  return eased * CONFIG.maxBlurTexels;
}

/**
 * 1 at angle 0 (dead center), ramping smoothly down to CONFIG.centeredScale
 * at CENTERED_SCALE_RANGE and beyond — recomputed fresh from the card's
 * current angle every frame, so as the helix keeps rotating this reads as
 * a smooth grow/shrink animation without any separate tween or state to
 * track per card.
 */
function centeredScaleAt(distance) {
  const t = Math.min(1, distance / CENTERED_SCALE_RANGE);
  const eased = t * t * (3 - 2 * t);
  return CONFIG.centeredScale - (CONFIG.centeredScale - 1) * eased;
}

// Rounded corners: a signed-distance-field rounded-box mask in the card's
// own world-unit space, assuming `cardP` (that space's local xy) is
// already defined by whichever call site splices this in. Front/back
// faces derive it from vMapUv (remapped from [0,1] to [-cardSize/2,
// cardSize/2]); the edge faces derive the equivalent from the raw local
// vertex position instead, since their UVs map to (depth, height) or
// (width, depth), not the (width, height) this mask needs — see
// createEdgeMaterial. Either way the result is a true circular arc rather
// than an ellipse on a non-square card, and `discard`, not just a low
// alpha, keeps a fully-masked corner from still writing depth and
// occluding whatever card sits behind it.
const CORNER_MASK_CORE = `
  vec2 cardB = uCardSize * 0.5 - vec2( uCornerRadius );
  vec2 cardQ = abs( cardP ) - cardB;
  float cardDist = length( max( cardQ, 0.0 ) ) + min( max( cardQ.x, cardQ.y ), 0.0 ) - uCornerRadius;
  float cornerMask = 1.0 - smoothstep( 0.0, 0.004, cardDist );
  diffuseColor.a *= cornerMask;
  if ( diffuseColor.a < 0.01 ) discard;
`;

const CORNER_MASK_UNIFORMS_GLSL = 'uniform vec2 uCardSize;\nuniform float uCornerRadius;';

// A 25-tap (3-ring) blur with a uniform, continuously variable radius (in
// texels), injected into MeshStandardMaterial's own fragment shader in
// place of its single texture2D lookup. At `uBlur == 0` every tap lands on
// the same texel, so this is pixel-identical to no blur at all — meaning
// the sharp-to-blurred transition is a smooth, continuous ramp as `uBlur`
// grows, rather than a jump between fixed pre-baked tiers.
const BLUR_MAP_FRAGMENT = `
#ifdef USE_MAP
  vec2 texel = uTexel * uBlur;
  vec4 sampledDiffuseColor = texture2D( map, vMapUv ) * 0.2;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 1.0,  0.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-1.0,  0.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0,  1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0, -1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 1.0,  1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 1.0, -1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-1.0,  1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-1.0, -1.0) ) * 0.055;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 2.0,  0.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-2.0,  0.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0,  2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0, -2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 2.0,  2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 2.0, -2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-2.0,  2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-2.0, -2.0) ) * 0.03;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 3.0,  0.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-3.0,  0.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0,  3.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 0.0, -3.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 3.0,  3.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2( 3.0, -3.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-3.0,  3.0) ) * 0.015;
  sampledDiffuseColor += texture2D( map, vMapUv + texel * vec2(-3.0, -3.0) ) * 0.015;
  diffuseColor *= sampledDiffuseColor;

  vec2 cardP = ( vMapUv - 0.5 ) * uCardSize;
  ${CORNER_MASK_CORE}
#endif
`;

/** A card face material whose blur radius (`uBlur`, in texels) can be set continuously, per instance, every frame. */
function createCardFaceMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBlur = { value: 0 };
    shader.uniforms.uTexel = {
      value: new THREE.Vector2(1 / CARD_TEXTURE_SIZE.width, 1 / CARD_TEXTURE_SIZE.height),
    };
    shader.uniforms.uCardSize = { value: new THREE.Vector2(CONFIG.cardWidth, CONFIG.cardHeight) };
    shader.uniforms.uCornerRadius = { value: CONFIG.cardCornerRadius };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\nuniform float uBlur;\nuniform vec2 uTexel;\n${CORNER_MASK_UNIFORMS_GLSL}`)
      .replace('#include <map_fragment>', BLUR_MAP_FRAGMENT);
    material.userData.shader = shader;
  };
  return material;
}

/**
 * The thin edge/side faces get the same rounded-corner treatment as the
 * front/back (see CORNER_MASK_CORE), but can't derive card-space xy from
 * their own UVs (those map to depth×height or width×depth, not
 * width×height) — so a local-position varying is threaded through from
 * the vertex shader instead. BoxGeometry's local `position.xy` already IS
 * that card-space coordinate on every one of the box's faces, edges
 * included, so this needs no per-face-direction special-casing: the exact
 * same test that rounds a corner on the front face also correctly rounds
 * the matching corner where the two edge faces meet it.
 */
function createEdgeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: EDGE_COLOR,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCardSize = { value: new THREE.Vector2(CONFIG.cardWidth, CONFIG.cardHeight) };
    shader.uniforms.uCornerRadius = { value: CONFIG.cardCornerRadius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCardXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCardXY = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vCardXY;\n${CORNER_MASK_UNIFORMS_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nvec2 cardP = vCardXY;\n${CORNER_MASK_CORE}`);
  };
  return material;
}

/**
 * Renders the gallery as a true helix — a single constant radius, like a
 * spring/coil (see spiralPath.js) — that visibly translates vertically as
 * the user scrolls, rather than a ring that spins in place. Each slot has
 * a fixed identity/card and a fixed baseline height along the coil, but
 * its actual height each frame is `wrapHeight(baseHeight - scrollY,
 * period)` (see #update): once a card scrolls past the top or bottom of
 * the rendered span it reappears at the opposite end, `period` (an exact
 * number of full turns) further along — seamless, because the screw
 * relationship means that position already lines up with a neighboring
 * card. The mapping from slot -> card data is
 * `slotIndex % cardsData.length`, so the number of real cards can grow (4
 * today, ~20 later) without touching any of the 3D logic here.
 *
 * Each card is a thin box, not a single-sided plane: as a slot rotates
 * past the camera-facing angle and on toward the back, it should still be
 * visible — showing the same image on its back face — rather than vanish
 * outright. Both the front and back faces carry the card's texture, blurred
 * continuously by a live shader based on angular distance from the front
 * (see createCardFaceMaterial); only the thin edge faces use a plain
 * shared-look material.
 */
export class SpiralGallery {
  constructor({ container, cardsData }) {
    this.container = container;
    this.cardsData = cardsData;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.cameraFov, 1, 0.1, 100);
    // Camera is fixed for the lifetime of the app: no orbit/pan/zoom
    // controls, no repositioning. It IS pulled back on narrow/portrait
    // viewports (see #resize). Only the slots' positions are otherwise
    // animated, driven by the virtual scroll value.
    this.basePosition = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(0, CONFIG.cameraLookAtY, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(2, 4, 6);
    this.scene.add(key);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.slots = [];
    this.cardColors = new Map();
    this.slotCount = getSlotCountForWidth(window.innerWidth);
    this.buildSlots(this.slotCount);

    this.resize();
  }

  buildSlots(slotCount) {
    // Tear down any previous layout (e.g. on a breakpoint change).
    for (const slot of this.slots) {
      this.group.remove(slot.mesh);
      slot.texture?.dispose();
      slot.frontMaterial.dispose();
      slot.backMaterial.dispose();
      slot.edgeMaterial.dispose();
    }
    this.slots = [];
    this.slotCount = slotCount;
    this.period = getPeriod(slotCount);

    if (!this.cardGeometry) {
      this.cardGeometry = new THREE.BoxGeometry(CONFIG.cardWidth, CONFIG.cardHeight, CARD_DEPTH);
    }

    for (let i = 0; i < slotCount; i += 1) {
      const card = this.cardsData[i % this.cardsData.length];

      const frontMaterial = createCardFaceMaterial();
      const backMaterial = createCardFaceMaterial();
      const edgeMaterial = createEdgeMaterial();

      // BoxGeometry face groups, in order: +x, -x, +y, -y, +z (front), -z (back).
      const mesh = new THREE.Mesh(this.cardGeometry, [
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        frontMaterial,
        backMaterial,
      ]);
      this.group.add(mesh);

      const slot = {
        index: i,
        baseHeight: (i / slotCount - 0.5) * this.period,
        angle: 0,
        mesh,
        frontMaterial,
        backMaterial,
        edgeMaterial,
        cardId: card.id,
        texture: null,
      };
      this.slots.push(slot);

      this.loadSlotTexture(slot, card);
    }
  }

  /** Records `card`'s mood color once, the first time any slot loads it (see cardColor.js). */
  recordCardColor(card, source) {
    if (this.cardColors.has(card.id)) return;
    this.cardColors.set(card.id, extractMoodColor(source));
  }

  loadSlotTexture(slot, card) {
    textureLoader.load(
      card.image,
      (loaded) => {
        slot.texture = buildCardTexture(loaded.image);
        slot.frontMaterial.map = slot.texture;
        slot.frontMaterial.needsUpdate = true;
        slot.backMaterial.map = slot.texture;
        slot.backMaterial.needsUpdate = true;
        this.recordCardColor(card, loaded.image);
        loaded.dispose();
      },
      undefined,
      () => {
        const placeholder = createPlaceholderTexture(card.title);
        slot.texture = buildCardTexture(placeholder.image);
        slot.frontMaterial.map = slot.texture;
        slot.frontMaterial.needsUpdate = true;
        slot.backMaterial.map = slot.texture;
        slot.backMaterial.needsUpdate = true;
        this.recordCardColor(card, placeholder.image);
        placeholder.dispose();
      }
    );
  }

  /** Rebuild the coil if the responsive slot count changed. */
  refreshSlotCountForWidth(width) {
    const nextCount = getSlotCountForWidth(width);
    if (nextCount !== this.slotCount) {
      this.buildSlots(nextCount);
    }
  }

  /** Translate the whole coil vertically to reflect the current scroll value. */
  update(scrollY) {
    for (const slot of this.slots) {
      const y = wrapHeight(slot.baseHeight - scrollY, this.period);
      const point = helixPointAt(y);

      slot.mesh.position.set(point.x, point.y, point.z);
      // Faces outward, away from the helix's axis: toward the viewer near
      // the front (angle ~ 0), showing its back once it's rotated past
      // ~90 degrees toward the rear.
      slot.mesh.rotation.y = point.angle;
      // A fixed roll around the card's own line of sight, in the same
      // rotational sense as the helix's own turn — a subtle bank into the
      // spiral rather than an upright, flat rectangle.
      slot.mesh.rotation.z = CARD_TILT;
      slot.angle = point.angle;

      const fade = recycleFadeAt(y, this.period);
      slot.recycleFade = fade;

      const distance = angularDistanceToZero(point.angle);
      slot.mesh.scale.setScalar((0.6 + 0.4 * fade) * centeredScaleAt(distance));

      const depthOpacity =
        CONFIG.frontOpacity - (CONFIG.frontOpacity - CONFIG.backOpacity) * (distance / Math.PI);
      const opacity = fade * depthOpacity;
      slot.frontMaterial.opacity = opacity;
      slot.backMaterial.opacity = opacity;
      slot.edgeMaterial.opacity = opacity;

      const blur = blurAmountAt(distance);
      if (slot.frontMaterial.userData.shader) slot.frontMaterial.userData.shader.uniforms.uBlur.value = blur;
      if (slot.backMaterial.userData.shader) slot.backMaterial.userData.shader.uniforms.uBlur.value = blur;
    }
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    // A perspective camera's FOV is vertical only; on a narrow/portrait
    // viewport the effective horizontal FOV shrinks with the aspect ratio,
    // so landscape cards balloon and overflow. Pulling the camera back
    // along its own line of sight (scaling its position vector) keeps the
    // same framing angle while compensating for that.
    const pullBack = aspect < 1 ? Math.sqrt(1 / aspect) : 1;
    this.camera.position.copy(this.basePosition).multiplyScalar(pullBack);
    this.camera.lookAt(0, CONFIG.cameraLookAtY, 0);

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
