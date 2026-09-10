import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { buildTextureTiers } from './textureTiers.js';
import { getPeriod, wrapHeight, helixPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();
const CARD_DEPTH = 0.04;
const EDGE_COLOR = 0x14110d;

const SHARP_THRESHOLD = (CONFIG.sharpAngleDeg * Math.PI) / 180;
const SOFT_THRESHOLD = (CONFIG.softAngleDeg * Math.PI) / 180;

function angularDistanceToZero(angle) {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(normalized, 2 * Math.PI - normalized);
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
 * outright. Both the front and back faces carry the card's texture
 * (swapped between three pre-blurred tiers based on live angular distance
 * from the front, see textureTiers.js); only the thin edge faces use a
 * plain shared-look material.
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
    this.slotCount = getSlotCountForWidth(window.innerWidth);
    this.buildSlots(this.slotCount);

    this.resize();
  }

  buildSlots(slotCount) {
    // Tear down any previous layout (e.g. on a breakpoint change).
    for (const slot of this.slots) {
      this.group.remove(slot.mesh);
      slot.textures?.sharp.dispose();
      slot.textures?.soft.dispose();
      slot.textures?.heavy.dispose();
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

      const frontMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });
      const backMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: EDGE_COLOR,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });

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
        textures: null,
        currentTier: null,
      };
      this.slots.push(slot);

      this.loadSlotTexture(slot, card);
    }
  }

  loadSlotTexture(slot, card) {
    textureLoader.load(
      card.image,
      (texture) => {
        slot.textures = buildTextureTiers(texture.image);
        texture.dispose();
      },
      undefined,
      () => {
        const placeholder = createPlaceholderTexture(card.title);
        slot.textures = buildTextureTiers(placeholder.image);
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
      slot.angle = point.angle;

      const fade = recycleFadeAt(y, this.period);
      slot.frontMaterial.opacity = fade;
      slot.backMaterial.opacity = fade;
      slot.edgeMaterial.opacity = fade;
      slot.mesh.scale.setScalar(0.6 + 0.4 * fade);

      if (!slot.textures) continue;
      const distance = angularDistanceToZero(point.angle);
      const tier =
        distance < SHARP_THRESHOLD ? 'sharp' : distance < SOFT_THRESHOLD ? 'soft' : 'heavy';
      if (tier !== slot.currentTier) {
        slot.currentTier = tier;
        slot.frontMaterial.map = slot.textures[tier];
        slot.frontMaterial.needsUpdate = true;
        slot.backMaterial.map = slot.textures[tier];
        slot.backMaterial.needsUpdate = true;
      }
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
