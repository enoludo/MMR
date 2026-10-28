/**
 * Occlusion ambiante de la sculpture, calculée par sommet (la sculpture et le sol
 * bloquent la lumière du ciel), écrite dans l'attribut _OCCLUSION du GLB.
 * Le site s'en sert pour assombrir les creux et le bas des pieds (voir src/scene/Reflet.tsx).
 *
 *   node blender/occlusion.mjs public/models/sculpture.glb public/models/sculpture.glb 0.015
 *
 * Le dernier argument est l'enfoncement de l'œuvre dans le sol (ENFONCE dans salle.py).
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
const [src, dst, enfonceArg] = process.argv.slice(2)
const ENFONCE = +(enfonceArg ?? 0.015), N = 160, DMAX = 2.5
await MeshoptDecoder.ready; await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(src)
const node = doc.getRoot().listNodes().find(n => n.getMesh())
const prim = node.getMesh().listPrimitives()[0]
const M = new THREE.Matrix4().fromArray(node.getWorldMatrix())
const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ia = prim.getIndices()
const n = pa.getCount(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), v = [0, 0, 0]
const t = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(M)
for (let i = 0; i < n; i++) {
  pa.getElement(i, v); t.fromArray(v).applyMatrix4(M); t.toArray(pos, i * 3)
  na.getElement(i, v); t.fromArray(v).applyMatrix3(nm).normalize(); t.toArray(nor, i * 3)
}
const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(new Uint32Array(ia.getArray()), 1))
const bvh = new MeshBVH(geo)
const sol = ENFONCE // en repère local, le sol est à +ENFONCE (l'œuvre est enfoncée)
const ray = new THREE.Ray(), o = new THREE.Vector3(), nn = new THREE.Vector3(), d = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3()
const ao = new Float32Array(n)
let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
for (let i = 0; i < n; i++) {
  nn.fromArray(nor, i * 3); o.fromArray(pos, i * 3).addScaledVector(nn, 0.004)
  // repère tangent
  tA.set(Math.abs(nn.x) < 0.9 ? 1 : 0, Math.abs(nn.x) < 0.9 ? 0 : 1, 0).cross(nn).normalize(); tB.crossVectors(nn, tA)
  let occ = 0
  for (let k = 0; k < N; k++) {
    const u1 = (k + rand()) / N, u2 = rand(), r = Math.sqrt(u1), phi = 2 * Math.PI * u2
    d.copy(nn).multiplyScalar(Math.sqrt(1 - u1)).addScaledVector(tA, r * Math.cos(phi)).addScaledVector(tB, r * Math.sin(phi))
    let dist = Infinity
    if (d.y < 0 && o.y > sol) dist = (o.y - sol) / -d.y
    else if (o.y <= sol) dist = 0 // sous le sol (partie enfoncée)
    ray.set(o, d)
    const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, Math.min(dist, DMAX))
    if (h) dist = Math.min(dist, h.distance)
    if (dist < DMAX) occ += 1 - (dist / DMAX) ** 2 // les obstacles proches comptent plus
  }
  ao[i] = 1 - occ / N
}
// lissage léger sur les voisins (bruit d'échantillonnage)
const idx = ia.getArray(), somme = new Float32Array(n), cnt = new Float32Array(n)
for (let pass = 0; pass < 2; pass++) {
  somme.fill(0); cnt.fill(0)
  for (let f = 0; f < idx.length; f += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { somme[idx[f + a]] += ao[idx[f + b]]; cnt[idx[f + a]]++ }
  for (let i = 0; i < n; i++) ao[i] = somme[i] / cnt[i]
}
const u8 = new Uint8Array(n); for (let i = 0; i < n; i++) u8[i] = Math.round(Math.min(1, Math.max(0, ao[i])) * 255)
const acc = doc.createAccessor('occlusion').setType('SCALAR').setArray(u8).setNormalized(true).setBuffer(doc.getRoot().listBuffers()[0])
prim.getAttribute('_OCCLUSION')?.dispose() // relance : on remplace l'ancienne occlusion
prim.setAttribute('_OCCLUSION', acc)
await io.write(dst, doc)
const s = [...ao].sort((a, b) => a - b); console.log('AO min', s[0].toFixed(2), 'p10', s[n * 0.1 | 0].toFixed(2), 'med', s[n / 2 | 0].toFixed(2))
// AO près du sol
const bas = [...ao].filter((_, i) => pos[i * 3 + 1] < 0.1); console.log('AO pieds (<10 cm)', (bas.reduce((a, b) => a + b, 0) / bas.length).toFixed(2))
