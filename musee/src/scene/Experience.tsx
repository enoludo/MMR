import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import { useControls } from 'leva'
import { useLocation } from 'react-router-dom'
import * as THREE from 'three'
import { Eclairage, Salle } from './Salle'
import { Navigation } from './Navigation'
import { Decentrage } from './Decentrage'
import { Couloir } from './Couloir'
import { ORIGINE, groupesSalles, placementArrivee, portesDuPassage, type Placement } from './passage'
import { store, useEtat, type SalleVisitee } from '../store'
import { oeuvres } from '../oeuvres'
import { captureSalle } from '../transition'

const salleDe = (v: SalleVisitee) => (oeuvres.find((o) => o.id === v.oeuvre) ?? oeuvres[0]).salle

/**
 * Le canvas 3D des salles. Il reste monté tant qu'on navigue d'œuvre en œuvre ;
 * la page d'accueil (spirale) a son propre canvas, démonté en entrant dans une salle.
 *
 * La salle où l'on se trouve est à l'origine, un couloir derrière chacune de ses portes.
 * Pendant un passage, la salle d'arrivée est chargée au bout du couloir emprunté (voir
 * passage.ts) ; ce couloir est celui de la salle de départ, la salle d'arrivée n'en
 * montre donc pas à la porte par laquelle on entre.
 */
export function Experience() {
  const visitee = useEtat((e) => e.salle)
  const passage = useEtat((e) => e.passage)
  // Entrée depuis la spirale : la salle se prépare, puis attend la fin du zoom de la carte sans être dessinée
  const enPreparation = useEtat(
    (e) => e.transition?.sens === 'entree' && (e.transition.phase === 'preparation' || e.transition.phase === 'zoom'),
  )
  // Retour vers la spirale : la salle quittée attend, cachée, d'être démontée (main.tsx)
  const quittee = !useLocation().pathname.startsWith('/oeuvre/')
  const rendu = useControls('Rendu', {
    exposition: { value: 3.4, min: 0.5, max: 15, step: 0.1 },
    focale: { value: 55, min: 30, max: 90, step: 1, label: 'champ de vision (°)' },
  })
  if (!visitee) return null
  const salle = salleDe(visitee)
  const arrivee = passage && { visite: passage, config: salleDe(passage) }
  const portes = arrivee && portesDuPassage(salle, arrivee.config, arrivee.visite.sens)

  return (
    <Canvas
      // Ombres filtrées (PCF) : le flou (shadow.radius) y est pris en compte, contrairement aux
      // ombres « douces » par défaut, dont le bord crénelait l'épaule de l'œuvre
      shadows="percentage"
      frameloop={enPreparation || quittee ? 'never' : 'always'}
      className="canvas3d"
      dpr={[1, 2]}
      camera={{ fov: rendu.focale, near: 0.05, far: 150, position: [0, 0, 0] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        // Hors développement, pas de lecture des journaux de compilation : chacune attend la
        // carte graphique (≈ 0,3 s en tout au premier dessin d'une salle)
        gl.debug.checkShaderErrors = import.meta.env.DEV
      }}
    >
      <ReglagesRendu exposition={rendu.exposition} />
      <Capture />
      <color attach="background" args={['#0d0b0a']} />
      {/* Baisse automatiquement la résolution si la machine peine */}
      <PerformanceMonitor />
      <AdaptiveDpr pixelated={false} />
      {/* Chaque salle a son propre chargement : la salle d'arrivée ne suspend pas l'autre */}
      <SalleEnPlace key={visitee.cle} cle={visitee.cle} placement={ORIGINE}>
        <Salle config={salle} />
        {salle.portes.map((p) => (
          <Couloir key={p.id} config={salle} porte={p} traverse={p === portes?.porte} />
        ))}
      </SalleEnPlace>
      {arrivee && portes && (
        <SalleEnPlace
          key={arrivee.visite.cle}
          cle={arrivee.visite.cle}
          placement={placementArrivee(portes.porte, portes.porteArrivee)}
        >
          <Salle config={arrivee.config} />
          {arrivee.config.portes
            .filter((p) => p !== portes.porteArrivee)
            .map((p) => (
              <Couloir key={p.id} config={arrivee.config} porte={p} traverse={false} />
            ))}
        </SalleEnPlace>
      )}
      <Eclairage config={salle} />
      <Navigation config={salle} configArrivee={arrivee?.config ?? null} focale={rendu.focale} />
      <Decentrage />
    </Canvas>
  )
}


/**
 * Une salle posée dans la scène. Son groupe est enregistré (une fois la salle chargée)
 * pour que la navigation puisse la recaler à l'origine dans la même image qu'elle-même.
 */
function SalleEnPlace({ cle, placement, children }: { cle: number; placement: Placement; children: ReactNode }) {
  const groupe = useRef<THREE.Group>(null)
  return (
    <group ref={groupe} position={placement.position} rotation-y={placement.rotationY}>
      <Suspense fallback={null}>
        {children}
        <Enregistrer cle={cle} groupe={groupe} />
        <Affichee cle={cle} />
        <Preparation cle={cle} />
      </Suspense>
    </group>
  )
}

function Enregistrer({ cle, groupe }: { cle: number; groupe: React.RefObject<THREE.Group | null> }) {
  // Après le montage complet (le groupe parent est alors attaché)
  useEffect(() => {
    const g = groupe.current
    if (!g) return
    groupesSalles.set(cle, g)
    return () => {
      if (groupesSalles.get(cle) === g) groupesSalles.delete(cle)
    }
  }, [cle, groupe])
  return null
}

/**
 * Signale que la salle est à l'écran : chargée, et ses matières compilées (la première
 * image dessinée est lente). La transition depuis la spirale attend ce signal.
 */
function Affichee({ cle }: { cle: number }) {
  const images = useRef(0)
  useFrame(() => {
    if (++images.current === 3) store.set({ salleAffichee: cle })
  })
  return null
}

const imageSuivante = () => new Promise((ok) => requestAnimationFrame(ok))

/**
 * Entrée depuis la spirale, juste après le clic (le zoom de la carte attend) : la salle chargée
 * est préparée sans être montrée (le canvas ne tourne pas) : ses textures envoyées à la carte
 * graphique une par image, ses matières compilées en parallèle, puis deux images dessinées pour
 * tout le reste (reflet, ombres). Le zoom et le fondu se jouent ensuite sans à-coups.
 */
function Preparation({ cle }: { cle: number }) {
  const { gl, scene, camera, advance } = useThree()
  useEffect(() => {
    if (store.get().transition?.phase !== 'preparation') return
    let fini = false
    ;(async () => {
      const textures = new Set<THREE.Texture>()
      const ajouter = (v: unknown) => {
        if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture)
      }
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        for (const matiere of Array.isArray(m) ? m : m ? [m] : []) {
          Object.values(matiere).forEach(ajouter)
          const u = (matiere as THREE.ShaderMaterial).uniforms ?? matiere.userData.shader?.uniforms
          if (u) Object.values(u).forEach((x) => ajouter((x as THREE.IUniform).value))
        }
      })
      for (const t of textures) {
        if (fini) return
        gl.initTexture(t)
        await imageSuivante()
      }
      if (!fini) await gl.compileAsync(scene, camera)
      for (let i = 0; i < 2 && !fini; i++) {
        advance(performance.now())
        await imageSuivante()
      }
      if (!fini) store.set({ sallePrete: cle })
    })()
    return () => {
      fini = true
    }
  }, [gl, scene, camera, advance, cle])
  return null
}

/** Photographie de l'image affichée, pour la transition vers la spirale (voir transition.ts). */
function Capture() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    captureSalle.courante = () => {
      // Le tampon de dessin est vidé après chaque affichage : on redessine juste avant de le copier
      gl.render(scene, camera)
      const c = document.createElement('canvas')
      c.width = gl.domElement.width
      c.height = gl.domElement.height
      c.getContext('2d')?.drawImage(gl.domElement, 0, 0)
      return c
    }
    return () => {
      captureSalle.courante = null
    }
  }, [gl, scene, camera])
  return null
}

/** Exposition réglable en direct (le champ de vision est géré par la navigation). */
function ReglagesRendu({ exposition }: { exposition: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMappingExposure = exposition
  }, [gl, exposition])
  return null
}
