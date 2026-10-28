import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { useEtat } from '../store'

/**
 * Décentre l'image pour que l'œuvre reste au milieu de l'espace laissé libre par
 * le popup Maladie ou Manifeste : à gauche du popup sur ordinateur, au-dessus sur
 * mobile (le popup et le premier écran y sont en bas). Sur ordinateur, le premier
 * écran, sans fond, se pose sur la scène : l'œuvre reste centrée (maquette Figma).
 * On décale la fenêtre de projection (setViewOffset) : la caméra ne bouge pas,
 * la perspective reste la même, seul le cadrage glisse.
 */
export function Decentrage() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const taille = useThree((s) => s.size)
  const onglet = useEtat((e) => e.onglet)
  const cible = useRef({ x: 0, y: 0 })
  const actuel = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const mesurer = () => {
      const p = document.querySelector(onglet === 'info' ? '.salle-accueil' : '.popup--ouvert')
      if (!p) {
        cible.current = { x: 0, y: 0 }
        return
      }
      const r = p.getBoundingClientRect()
      const lateral = r.width < window.innerWidth * 0.6
      if (!lateral) cible.current = { x: 0, y: Math.max(0, window.innerHeight - r.top) / 2 }
      else if (onglet === 'info') cible.current = { x: 0, y: 0 }
      else cible.current = { x: -Math.max(0, window.innerWidth - r.left) / 2, y: 0 }
    }
    mesurer()
    // Le popup apparaît en 0,5 s : on remesure à la fin
    const t = setTimeout(mesurer, 600)
    window.addEventListener('resize', mesurer)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', mesurer)
    }
  }, [onglet, taille.width, taille.height])

  useFrame((_, delta) => {
    const a = actuel.current
    const c = cible.current
    const k = 1 - Math.exp(-4 * Math.min(delta, 0.1))
    a.x += (c.x - a.x) * k
    a.y += (c.y - a.y) * k
    if (Math.abs(a.x) < 0.5 && Math.abs(a.y) < 0.5 && c.x === 0 && c.y === 0) {
      if (camera.view?.enabled) camera.clearViewOffset()
      return
    }
    const { width: w, height: h } = taille
    camera.setViewOffset(w, h, -a.x, a.y, w, h)
  }, -1.5) // après la navigation (-2), avant le reflet (-1) qui recopie la projection
  return null
}
