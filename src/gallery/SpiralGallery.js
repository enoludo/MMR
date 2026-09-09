import * as THREE from 'three';
import { CONFIG, getColumnCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { buildTextureTiers } from './textureTiers.js';

const textureLoader = new THREE.TextureLoader();

const SHARP_THRESHOLD = (25 * Math.PI) / 180;
const SOFT_THRESHOLD = (55 * Math.PI) / 180;

function angularDistanceToZero(angle) {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(normalized, 2 * Math.PI - normalized);
}

/**
 * A tall wall of cards wrapped around a cylinder: `columnCount` columns
 * evenly spaced by angle, each holding `CONFIG.rowCount` cards stacked
 * vertically. The whole wall is one rigid group that spins around its own
 * (vertical) axis — because the radius is constant, the shape is periodic
 * in angle, so it can rotate indefinitely with no seam to hide, unlike a
 * true growing spiral.
 *
 * Only the "hero" row (row 0, at eye height) maps directly to
 * `cardsData[column % cardsData.length]` and drives the centered-card
 * overlay; the other rows use a shifted mapping so the wall isn't just the
 * same handful of images stacked identically on repeat.
 *
 * Depth cueing comes from swapping each card's texture between three
 * pre-blurred tiers based on its angular distance from the front (see
 * textureTiers.js) rather than a real-time depth-of-field render pass —
 * cheaper, and reliable across devices.
 */
export class SpiralGallery {
  constructor({ container, cardsData }) {
    this.container = container;
    this.cardsData = cardsData;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.cameraFov, 1, 0.1, 100);
    // Camera is fixed for the lifetime of the app: no orbit/pan/zoom
    // controls, no repositioning. It IS pulled back on narrow/portrait
    // viewports (see #resize) — a perspective camera's FOV is vertical
    // only, so on a narrow aspect ratio the horizontal FOV shrinks hard,
    // shoving the wall almost entirely out of frame. Only the wall's
    // rotation is otherwise animated, driven by the virtual scroll value.
    this.basePosition = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(0, CONFIG.cameraHeight, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(2, 4, 6);
    this.scene.add(key);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.slots = [];
    this.columnCount = getColumnCountForWidth(window.innerWidth);
    this.buildSlots(this.columnCount);

    this.resize();
  }

  buildSlots(columnCount) {
    // Tear down any previous layout (e.g. on a breakpoint change).
    for (const slot of this.slots) {
      this.group.remove(slot.mesh);
      slot.textures.sharp.dispose();
      slot.textures.soft.dispose();
      slot.textures.heavy.dispose();
      slot.mesh.material.dispose();
    }
    this.slots = [];
    this.columnCount = columnCount;

    if (!this.cardGeometry) {
      this.cardGeometry = new THREE.PlaneGeometry(CONFIG.cardWidth, CONFIG.cardHeight);
    }

    const rowOffset = (CONFIG.rowCount - 1) / 2;

    for (let col = 0; col < columnCount; col += 1) {
      const angle = (col / columnCount) * Math.PI * 2;

      for (let row = 0; row < CONFIG.rowCount; row += 1) {
        const isHeroRow = row === 0;
        const cardIndex = isHeroRow ? col : col + row * 7;
        const card = this.cardsData[cardIndex % this.cardsData.length];

        const material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          side: THREE.FrontSide,
          roughness: 0.9,
          metalness: 0,
        });

        const mesh = new THREE.Mesh(this.cardGeometry, material);
        mesh.position.set(
          Math.sin(angle) * CONFIG.radius,
          (row - rowOffset) * CONFIG.rowSpacing,
          Math.cos(angle) * CONFIG.radius
        );
        // Faces outward, away from the cylinder's axis, so the column
        // rotated to angle ~ 0 faces the viewer.
        mesh.rotation.y = angle;

        this.group.add(mesh);

        const slot = {
          col,
          row,
          angle,
          worldAngle: angle,
          isHeroRow,
          mesh,
          cardId: card.id,
          textures: null,
          currentTier: null,
        };
        this.slots.push(slot);

        this.loadSlotTexture(slot, card);
      }
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

  /** Rebuild the wall if the responsive column count changed. */
  refreshColumnCountForWidth(width) {
    const nextCount = getColumnCountForWidth(width);
    if (nextCount !== this.columnCount) {
      this.buildSlots(nextCount);
    }
  }

  setRotation(radians) {
    this.group.rotation.y = radians;

    for (const slot of this.slots) {
      slot.worldAngle = slot.angle + radians;
      if (!slot.textures) continue;

      const distance = angularDistanceToZero(slot.worldAngle);
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

    // Pull the camera back along its own line of sight on a narrow aspect
    // ratio, to compensate for the shrinking horizontal FOV — keeps the
    // wall centered and visible instead of squeezed almost entirely
    // out of frame.
    const pullBack = aspect < 1 ? Math.sqrt(1 / aspect) : 1;
    this.camera.position.copy(this.basePosition).multiplyScalar(pullBack);
    this.camera.lookAt(0, CONFIG.cameraHeight, 0);

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
