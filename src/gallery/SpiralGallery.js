import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { spiralPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();

/**
 * Renders the spiral of cards. Each slot has a fixed identity/card and a
 * fixed starting offset along the spiral path (`baseOffset`), but its
 * position is recomputed every frame from `(baseOffset + globalT) mod 1`
 * (see #update) — the slot itself travels the whole spiral and recycles
 * back to the start, rather than the gallery being a rigid shape that
 * spins in place. The mapping from slot -> card data is
 * `slotIndex % cardsData.length`, so the number of real cards can grow (4
 * today, ~20 later) without touching any of the 3D logic here.
 */
export class SpiralGallery {
  constructor({ container, cardsData }) {
    this.container = container;
    this.cardsData = cardsData;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.cameraFov,
      1,
      0.1,
      100
    );
    // Camera is fixed for the lifetime of the app: no orbit/pan/zoom
    // controls, no repositioning. Only the slots' positions are animated,
    // driven by the virtual scroll value.
    this.camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    this.camera.lookAt(0, CONFIG.cameraLookAtY, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(2, 4, 5);
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
      slot.mesh.geometry.dispose();
      slot.mesh.material.map?.dispose();
      slot.mesh.material.dispose();
    }
    this.slots = [];
    this.slotCount = slotCount;

    const geometry = new THREE.PlaneGeometry(CONFIG.cardWidth, CONFIG.cardHeight);

    for (let i = 0; i < slotCount; i += 1) {
      const card = this.cardsData[i % this.cardsData.length];

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        roughness: 0.9,
        metalness: 0,
        transparent: true,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);

      const slot = { index: i, baseOffset: i / slotCount, angle: 0, mesh, cardId: card.id };
      this.slots.push(slot);

      this.loadSlotTexture(mesh.material, card);
    }
  }

  loadSlotTexture(material, card) {
    textureLoader.load(
      card.image,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      () => {
        material.map = createPlaceholderTexture(card.title);
        material.needsUpdate = true;
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
    }
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
