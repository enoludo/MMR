import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { buildCardTexture, CARD_TEXTURE_SIZE } from './cardTexture.js';
import { extractMoodColor, extractAverageColor } from './cardColor.js';
import { getPeriod, wrapHeight, helixPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();
const CARD_DEPTH = 0.04;
const EDGE_COLOR = 0xffffff;

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

/**
 * A rounded rectangle, centered on the origin — the card's actual shape
 * (see buildCardGeometry), not a rectangle with its corners masked away
 * afterward. Traced as 4 straight edges joined by 4 quarter-circle arcs so
 * extruding it gives every face — front, back, *and* the side/edge faces
 * in between — the same true curve at each corner, rather than the edges
 * remaining a flat rectangular prism whose square corners either poke out
 * past a rounded front face or get abruptly clipped by a shader mask.
 */
function createRoundedCardShape(width, height, radius) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, (Math.PI * 3) / 2, false);
  return shape;
}

// ExtrudeGeometry's default UVGenerator returns raw local coordinates, not
// normalized 0..1 — this normalizes the front/back ("lid") faces against
// the card's own width/height so vUv behaves exactly like it would on a
// plane or box, which the blur shader (BLUR_MAP_FRAGMENT) assumes. The
// side (edge) faces don't carry a texture, so their UV isn't meaningful;
// still needs to return valid Vector2s.
function createCardUVGenerator(width, height) {
  const toUV = (vertices, i) => new THREE.Vector2(vertices[i * 3] / width + 0.5, vertices[i * 3 + 1] / height + 0.5);
  return {
    generateTopUV(geometry, vertices, a, b, c) {
      return [toUV(vertices, a), toUV(vertices, b), toUV(vertices, c)];
    },
    generateSideWallUV(geometry, vertices, a, b, c, d) {
      return [toUV(vertices, a), toUV(vertices, b), toUV(vertices, c), toUV(vertices, d)];
    },
  };
}

/**
 * The card's geometry: `createRoundedCardShape` extruded to CARD_DEPTH and
 * re-centered on all 3 axes (ExtrudeGeometry extrudes from z=0 to
 * z=depth by default) so the mesh's position/rotation still refer to the
 * card's true center, matching how the rest of this file already treats
 * it. Face groups: 0 = front+back together (ExtrudeGeometry puts both
 * "lid" caps in one group — front/back already always show the exact
 * same texture with the exact same blur/opacity, see #update, so one
 * shared material is a straight simplification, not a compromise), 1 =
 * the extruded sides (the edge, now genuinely curved at each corner).
 */
function buildCardGeometry() {
  const shape = createRoundedCardShape(CONFIG.cardWidth, CONFIG.cardHeight, CONFIG.cardCornerRadius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: CARD_DEPTH,
    bevelEnabled: false,
    curveSegments: 12,
    UVGenerator: createCardUVGenerator(CONFIG.cardWidth, CONFIG.cardHeight),
  });
  geometry.translate(0, 0, -CARD_DEPTH / 2);
  return geometry;
}

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
#endif
`;

/** The card's front+back material — blur radius (`uBlur`, in texels) can be set continuously, per instance, every frame. Rounded corners come from the geometry itself now (see buildCardGeometry), not a shader mask. */
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
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform float uBlur;\nuniform vec2 uTexel;')
      .replace('#include <map_fragment>', BLUR_MAP_FRAGMENT);
    material.userData.shader = shader;
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
    this.cardEdgeColors = new Map();
    this.slotCount = getSlotCountForWidth(window.innerWidth);
    this.buildSlots(this.slotCount);

    this.resize();
  }

  buildSlots(slotCount) {
    // Tear down any previous layout (e.g. on a breakpoint change).
    for (const slot of this.slots) {
      this.group.remove(slot.mesh);
      slot.texture?.dispose();
      slot.faceMaterial.dispose();
      slot.edgeMaterial.dispose();
    }
    this.slots = [];
    this.slotCount = slotCount;
    this.period = getPeriod(slotCount);

    if (!this.cardGeometry) {
      this.cardGeometry = buildCardGeometry();
    }

    for (let i = 0; i < slotCount; i += 1) {
      const card = this.cardsData[i % this.cardsData.length];

      const faceMaterial = createCardFaceMaterial();
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: EDGE_COLOR,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });

      // buildCardGeometry's face groups, in order: 0 = front+back ("lid"), 1 = the extruded sides.
      const mesh = new THREE.Mesh(this.cardGeometry, [faceMaterial, edgeMaterial]);
      this.group.add(mesh);

      const slot = {
        index: i,
        baseHeight: (i / slotCount - 0.5) * this.period,
        angle: 0,
        mesh,
        faceMaterial,
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

  /** Records `card`'s own average color once, the first time any slot loads it — see applyEdgeColor. */
  recordCardEdgeColor(card, source) {
    if (this.cardEdgeColors.has(card.id)) return;
    this.cardEdgeColors.set(card.id, extractAverageColor(source));
  }

  /**
   * Tints `slot`'s edge to `card`'s own average color instead of a flat
   * shared one, so the tranche reads as belonging to that card rather than
   * as a neutral frame around it. Every slot showing the same card (they
   * recur every `cardsData.length` slots) gets its own edgeMaterial
   * instance, so this sets `.color` per slot even though the underlying
   * average is computed and cached once per card (recordCardEdgeColor).
   */
  applyEdgeColor(slot, card) {
    const { r, g, b } = this.cardEdgeColors.get(card.id);
    // `r/g/b` are sRGB-encoded pixel values straight off a canvas (same
    // convention as a hex color like 0xffffff) — Color#setRGB otherwise
    // defaults to interpreting raw numbers as already-linear, which after
    // three.js's own linear-to-sRGB display conversion visibly washes out
    // and brightens every color.
    slot.edgeMaterial.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  }

  loadSlotTexture(slot, card) {
    textureLoader.load(
      card.image,
      (loaded) => {
        slot.texture = buildCardTexture(loaded.image);
        slot.faceMaterial.map = slot.texture;
        slot.faceMaterial.needsUpdate = true;
        this.recordCardColor(card, loaded.image);
        this.recordCardEdgeColor(card, loaded.image);
        this.applyEdgeColor(slot, card);
        loaded.dispose();
      },
      undefined,
      () => {
        const placeholder = createPlaceholderTexture(card.title);
        slot.texture = buildCardTexture(placeholder.image);
        slot.faceMaterial.map = slot.texture;
        slot.faceMaterial.needsUpdate = true;
        this.recordCardColor(card, placeholder.image);
        this.recordCardEdgeColor(card, placeholder.image);
        this.applyEdgeColor(slot, card);
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
      slot.faceMaterial.opacity = opacity;
      slot.edgeMaterial.opacity = opacity;

      const blur = blurAmountAt(distance);
      if (slot.faceMaterial.userData.shader) slot.faceMaterial.userData.shader.uniforms.uBlur.value = blur;
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
