import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';

const textureLoader = new THREE.TextureLoader();

/**
 * Renders the spiral of cards. Slots are a fixed, purely-visual layout
 * (position/rotation computed from slot index) that never changes shape;
 * the mapping from slot -> card data is `slotIndex % cardsData.length`, so
 * the number of real cards can grow (4 today, ~20 later) without touching
 * any of the 3D logic here.
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
    // controls are ever attached to it. Only `this.group.rotation.y`
    // is animated, driven by the virtual scroll value.
    this.camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    this.camera.lookAt(0, 0, 0);

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

  /** Angle (radians) of a slot's base position, before group rotation. */
  getSlotAngle(slotIndex) {
    return (slotIndex / this.slotCount) * Math.PI * 2;
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
      const angle = this.getSlotAngle(i);
      const card = this.cardsData[i % this.cardsData.length];

      const radius =
        CONFIG.radius +
        Math.sin(angle * CONFIG.spiralLoops) * CONFIG.radiusAmplitude;
      const y =
        Math.cos(angle * CONFIG.spiralLoops + CONFIG.spiralPhase) *
        CONFIG.verticalAmplitude;

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        roughness: 0.9,
        metalness: 0,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      // Faces outward, away from the ring's center, so the slot nearest
      // the camera (angle ~ 0 once the group is rotated) faces the viewer.
      mesh.rotation.y = angle;

      this.group.add(mesh);
      this.slots.push({ index: i, angle, mesh, cardId: card.id });

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

  setRotation(radians) {
    this.group.rotation.y = radians;
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
