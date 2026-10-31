import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { store, useEtat } from '../store'
import type { Vec3 } from '../salles/types'
import { regard } from './Effets'

/**
 * Vue libre (touche V, développement seulement) : on se déplace librement dans la salle pour régler
 * ses points de vue (panneau ui/VueLibre.tsx). La navigation de la visite s'arrête pendant ce temps.
 * Touches lues à leur place sur le clavier (AZERTY comme QWERTY) :
 * Z Q S D ou flèches = avancer, aller à gauche, reculer, à droite ; E / A = monter, descendre ;
 * glisser la souris = regarder ; molette = vitesse.
 */

/** Commandes de la vue libre, pour le panneau : aller à un point de vue, lire la vue actuelle */
export const volLibre = {
  aller: (_position: Vec3, _cible: Vec3) => {},
  /** Position de l'œil et direction du regard */
  vue: () => ({ position: [0, 0, 0] as Vec3, direction: [0, 0, -1] as Vec3 }),
  vitesse: 2,
  /** Image décalée comme dans la visite quand un popup est ouvert (Decentrage) */
  popup: false,
}

const AVANT = ['KeyW', 'ArrowUp']
const ARRIERE = ['KeyS', 'ArrowDown']
const GAUCHE = ['KeyA', 'ArrowLeft']
const DROITE = ['KeyD', 'ArrowRight']
const HAUT = ['KeyE']
const BAS = ['KeyQ']
const TOUTES = [...AVANT, ...ARRIERE, ...GAUCHE, ...DROITE, ...HAUT, ...BAS]

export function VolLibre() {
  const libre = useEtat((e) => e.libre)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const canvas = useThree((s) => s.gl.domElement)
  const etat = useRef({ lacet: 0, tangage: 0, touches: new Set<string>() }).current
  const tmp = useRef({ avant: new THREE.Vector3(), cote: new THREE.Vector3(), regard: new THREE.Vector3() }).current

  useEffect(() => {
    if (!libre) return
    const orienter = () => {
      const d = camera.getWorldDirection(tmp.regard)
      etat.lacet = Math.atan2(d.x, d.z)
      etat.tangage = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    }
    orienter()
    volLibre.aller = (position, cible) => {
      camera.position.set(...position)
      camera.lookAt(...cible)
      orienter()
    }
    volLibre.vue = () => {
      const d = camera.getWorldDirection(new THREE.Vector3())
      return { position: camera.position.toArray() as Vec3, direction: d.toArray() as Vec3 }
    }

    const appuyer = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || !TOUTES.includes(e.code)) return
      etat.touches.add(e.code)
      e.preventDefault()
    }
    const lacher = (e: KeyboardEvent) => etat.touches.delete(e.code)
    const perdre = () => etat.touches.clear()
    let glisse: { x: number; y: number } | null = null
    const saisir = (e: PointerEvent) => {
      glisse = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }
    const deplacer = (e: PointerEvent) => {
      if (!glisse) return
      etat.lacet -= (e.clientX - glisse.x) * 0.004
      etat.tangage = THREE.MathUtils.clamp(etat.tangage - (e.clientY - glisse.y) * 0.004, -1.5, 1.5)
      glisse = { x: e.clientX, y: e.clientY }
    }
    const relacher = () => (glisse = null)
    const molette = (e: WheelEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return
      e.preventDefault()
      volLibre.vitesse = THREE.MathUtils.clamp(volLibre.vitesse * Math.pow(1.15, -Math.sign(e.deltaY)), 0.2, 20)
      store.set({}) // le panneau affiche la vitesse
    }
    window.addEventListener('keydown', appuyer)
    window.addEventListener('keyup', lacher)
    window.addEventListener('blur', perdre)
    canvas.addEventListener('pointerdown', saisir)
    canvas.addEventListener('pointermove', deplacer)
    canvas.addEventListener('pointerup', relacher)
    canvas.addEventListener('pointercancel', relacher)
    window.addEventListener('wheel', molette, { passive: false })
    canvas.style.cursor = 'grab'
    return () => {
      window.removeEventListener('keydown', appuyer)
      window.removeEventListener('keyup', lacher)
      window.removeEventListener('blur', perdre)
      canvas.removeEventListener('pointerdown', saisir)
      canvas.removeEventListener('pointermove', deplacer)
      canvas.removeEventListener('pointerup', relacher)
      canvas.removeEventListener('pointercancel', relacher)
      window.removeEventListener('wheel', molette)
      canvas.style.cursor = ''
      etat.touches.clear()
    }
  }, [libre, camera, canvas, etat, tmp])

  useFrame((_, delta) => {
    if (!libre) return
    const dt = Math.min(delta, 0.1)
    const t = etat.touches
    const k = (liste: string[]) => (liste.some((c) => t.has(c)) ? 1 : 0)
    // Déplacements à l'horizontale (comme en marchant), montée et descente à part
    tmp.avant.set(Math.sin(etat.lacet), 0, Math.cos(etat.lacet))
    tmp.cote.set(-Math.cos(etat.lacet), 0, Math.sin(etat.lacet))
    const v = volLibre.vitesse * dt
    camera.position
      .addScaledVector(tmp.avant, (k(AVANT) - k(ARRIERE)) * v)
      .addScaledVector(tmp.cote, (k(DROITE) - k(GAUCHE)) * v)
    camera.position.y = Math.max(0.2, camera.position.y + (k(HAUT) - k(BAS)) * v)
    tmp.regard
      .set(Math.sin(etat.lacet) * Math.cos(etat.tangage), Math.sin(etat.tangage), Math.cos(etat.lacet) * Math.cos(etat.tangage))
      .add(camera.position)
    camera.lookAt(tmp.regard)
    // Mise au point (Effets.tsx) : là où le regard passe au plus près de l'axe de l'œuvre de la salle
    // (centre de la scène), à 2 m au moins
    const d = tmp.regard.sub(camera.position)
    const avance = Math.max(2, -(camera.position.x * d.x + camera.position.z * d.z) / Math.max(1e-6, d.x * d.x + d.z * d.z))
    regard.copy(camera.position).addScaledVector(d, avance)
  }, -2)

  return null
}
