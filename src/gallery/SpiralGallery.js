import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { buildTextureTiers } from './textureTiers.js';
import { spiralPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();

const SHARP_THRESHOLD = (CONFIG.sharpAngleDeg * Math.PI) / 180;
const SOFT_THRESHOLD = (CONFIG.softAngleDeg * Math.PI) / 180;

function angularDistanceToZero(angle) {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(normalized, 2 * Math.PI - normalized);
}

/**
 * Renders the spiral of cards. Each slot has a fixed identity/card and a
 * fixed starting offset along the spiral path (`baseOffset`), but its
 * position is recomputed every frame from `(baseOffset + globalT) mod 1`
 * (see #update) — the slot itself travels the whole spiral and recycles
 * back to the start, rather than the gallery being a rigid shape that
 * spins in place. The mapping from slot -> card data is
 * `slotIndex % cardsData.length`, so the number of real cards can grow (4
 * today, ~20 later) without touching any of the 3D logic here.
 *
 * Depth cueing comes from swapping each card's texture between three
 * pre-blurred tiers based on its live angular distance from the front
 * (see textureTiers.js), rather than a real-time depth-of-field render
 * pass — cheaper, and reliable across devices.
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
      slot.mesh.material.dispose();
    }
    this.slots = [];
    this.slotCount = slotCount;

    if (!this.cardGeometry) {
      this.cardGeometry = new THREE.PlaneGeometry(CONFIG.cardWidth, CONFIG.cardHeight);
    }

    for (let i = 0; i < slotCount; i += 1) {
      const card = this.cardsData[i % this.cardsData.length];

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });

      const mesh = new THREE.Mesh(this.cardGeometry, material);
      this.group.add(mesh);

      const slot = {
        index: i,
        baseOffset: i / slotCount,
        angle: 0,
        mesh,
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

  /** Rebuild the slot layout if the responsive slot count changed. */
  refreshSlotCountForWidth(width) {
    const nextCount = getSlotCountForWidth(width);
    if (nextCount !== this.slotCount) {
      this.buildSlots(nextCount);
    }
  }

  /** Advance every slot along the spiral path to reflect the current scroll value. */
  update(globalT) {
    for (const slot of this.slots) {
      const t = (((slot.baseOffset + globalT) % 1) + 1) % 1;
      const point = spiralPointAt(t);

      slot.mesh.position.set(point.x, point.y, point.z);
      // Faces outward, away from the spiral's axis, so a slot near the
      // camera-facing angle (~0 mod 2*PI) faces the viewer.
      slot.mesh.rotation.y = point.angle;
      slot.angle = point.angle;

      const fade = recycleFadeAt(t);
      slot.mesh.material.opacity = fade;
      slot.mesh.scale.setScalar(0.6 + 0.4 * fade);

      if (!slot.textures) continue;
      const distance = angularDistanceToZero(point.angle);
      const tier =
        distance < SHARP_THRESHOLD ? 'sharp' : distance < SOFT_THRESHOLD ? 'soft' : 'heavy';
      if (tier !== slot.currentTier) {
        slot.currentTier = tier;
        slot.mesh.material.map = slot.textures[tier];
        slot.mesh.material.needsUpdate = true;
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
