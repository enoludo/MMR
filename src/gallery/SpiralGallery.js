import * as THREE from 'three';
import { CONFIG, getSlotCountForWidth } from '../config.js';
import { createPlaceholderTexture } from './placeholderTexture.js';
import { spiralPointAt, recycleFadeAt } from './spiralPath.js';

const textureLoader = new THREE.TextureLoader();

/** Deterministic pseudo-random value in [0, 1) for a given integer seed. */
function hash(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A plane bowed outward along its width (a gentle parabolic curve), like a
 * sheet of paper curling toward the viewer — reused by every card, since
 * the curve amount is the same for all of them.
 */
function buildCardGeometry(width, height, curveDepth) {
  const geometry = new THREE.PlaneGeometry(width, height, 16, 1);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const nx = position.getX(i) / (width / 2); // -1..1 across the card's width
    position.setZ(i, curveDepth * (1 - nx * nx));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
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
    // controls, and never repositioned in response to interaction. It IS
    // pulled back on narrow/portrait viewports (see #resize) — otherwise a
    // fixed vertical FOV combined with landscape cards makes them fill and
    // overflow a tall, narrow screen. Only the slots' positions are
    // animated, driven by the virtual scroll value.
    this.basePosition = new THREE.Vector3(0, CONFIG.cameraHeight, CONFIG.cameraDistance);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(0, CONFIG.cameraLookAtY, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-3, 5, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(4, -2, -3);
    this.scene.add(rim);

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
      slot.mesh.material.map?.dispose();
      slot.mesh.material.dispose();
    }
    this.slots = [];
    this.slotCount = slotCount;

    if (this.cardGeometry) this.cardGeometry.dispose();
    this.cardGeometry = buildCardGeometry(CONFIG.cardWidth, CONFIG.cardHeight, CONFIG.cardCurveDepth);

    for (let i = 0; i < slotCount; i += 1) {
      const card = this.cardsData[i % this.cardsData.length];

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
      });

      const mesh = new THREE.Mesh(this.cardGeometry, material);
      this.group.add(mesh);

      // A fixed, per-slot random tilt on top of the base "face the camera"
      // orientation, so cards read as loosely tumbled rather than
      // mechanically aligned to the spiral.
      const tiltX = (hash(i * 2) - 0.5) * 2 * CONFIG.cardTiltJitter;
      const tiltZ = (hash(i * 2 + 1) - 0.5) * 2 * CONFIG.cardTiltJitter;

      const slot = { index: i, baseOffset: i / slotCount, angle: 0, tiltX, tiltZ, mesh, cardId: card.id };
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
      // Faces outward, away from the spiral's axis (so a slot near the
      // camera-facing angle faces the viewer), plus a fixed per-slot tilt.
      slot.mesh.rotation.set(slot.tiltX, point.angle, slot.tiltZ);
      slot.angle = point.angle;

      const fade = recycleFadeAt(t);
      slot.mesh.material.opacity = fade;
      slot.mesh.scale.setScalar(0.6 + 0.4 * fade);
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
