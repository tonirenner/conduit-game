# Planet And Star System Roadmap

## Zielbild

Das Projekt soll von einem einzelnen Planet-Renderer zu einer kleinen, glaubwuerdigen Sonnensystem-Simulation wachsen.

Endzustand:

- mehrere klar unterscheidbare Planetentypen
- stabile LOD-Pipeline fuer Naehe, Orbit und Systemansicht
- visuell hochwertiger, moeglichst photorealistischer Look
- WebGPU als Hauptpfad, WebGL als robuster Fallback
- ein kleines Sonnensystem mit Stern, 4+ Planeten, Orbits, Ringen, Monden und optional Asteroidenguertel
- keine Runtime-Crashes, wenn einzelne Renderfeatures nicht unterstuetzt werden

## Grundsatzentscheidung

Nicht jeder Planetentyp bekommt einen komplett eigenen Kugelrenderer.

Der stabile Aufbau ist:

- feste Planeten mit Terrain nutzen immer `CubeSphere` + `TerrainPatch`
- feste Planetentypen unterscheiden sich ueber Material-/Shader-Varianten und Renderprofile
- Spezialplaneten duerfen eigene Layer haben, wenn sie strukturell anders sind

Spezial-Layer:

- `GasGiantLayer` fuer `gas_giant` und `ice_giant`
- `ToxicHazeLayer` als optionale Atmosphaeren-/Haze-Ergaenzung fuer `toxic`
- keine festen Planetentypen mehr als eigener Kugelrenderer am `CubeSphere`-/TerrainPatch-Pfad vorbei

Patch-basierte feste Planeten:

- `barren`
- `rocky`
- `terrestrial`
- `ocean`
- `desert`
- `ice`
- `lava`
- `toxic`
- `carbon`
- `metal_rich`

Diese Typen muessen die Terrain-Patches behalten, damit LOD, Horizon-Culling, Terrain-Stats und Near-Surface-Skalierung funktionieren.

## Aktueller Stand

Schon vorhanden:

- `PlanetDefinition`
- `PlanetGenerator`
- `PlanetRenderProfile`
- `SurfaceRenderProfile`
- `CubeSphere`
- `TerrainPatch`
- `CachedTerrainSource`
- WebGPU Surface Material
- WebGL Surface Material
- Atmosphere/Cloud Layer
- Gas/Lava/Ice Spezial-Layer
- Postprocessing-Pipeline
- `StarSystemDefinition`
- `StarSystemGenerator`

Noch nicht sauber geloest:

- Surface-Material ist zu stark ein grosser Mischshader
- Planetentypen sind visuell nicht hart genug getrennt
- WebGL und WebGPU sehen noch unterschiedlich aus
- Ocean braucht bessere Wasser-/Land-Verteilung und Specular
- Klimasystem beeinflusst manche Typen noch zu generisch
- Star-System-Definition wird noch nicht als echte Szene gerendert

## Planet Class Visual Targets

Status: in Arbeit

Diese Ziele leiten die Generator-, Klima-, Terrain- und Renderprofile.

- `barren`: luftarm bis atmosphaerelos, trocken, grau/braun, kraterartig, harte Reliefs, keine Wolken, keine Ozeane
- `rocky`: feste Felswelt, wenig bis keine Atmosphaere, Gebirge/Ridges, graue bis rostige Flaechen, selten Eis
- `terrestrial`: erdaehnlich, Kontinente/Ozeane, moderate Wolken, blaue Atmosphaere, Vegetation/Drylands gemischt
- `ocean`: wasserreich, sehr hoher Wasseranteil, wenige Inseln, weiche Bathymetrie, wolkenreich, blau/tuerkis
- `desert`: trocken, staubig, wenig Wolken, warme Sand-/Felsfarben, erodierte Plateaus, kaum Wasser
- `ice`: gefrorene Kruste, helle Eisplatten, Risse, sehr kalt, duenne Atmosphaere/Eisnebel
- `lava`: extreme Hitze, Basalt, Magma/Emission, Vulkanismus, Asche/Haze, keine Ozeane
- `toxic`: dichte Atmosphaere, gelb/gruenliche Haze- und Wolkenbaender, chemische Becken, flachere Topologie
- `carbon`: dunkel, niedrige Albedo, trockene kohlenstoffreiche Ebenen, dunkle Fissuren, wenig Atmosphaere
- `metal_rich`: trocken, dicht, harte metallische Ridges, niedrige Atmosphaere, grau/goldene Reflexe
- `gas_giant`: keine harte Oberflaeche, H/He-Atmosphaere, breite Wolkenbaender, Wirbel, oft Ringe/Monde
- `ice_giant`: keine harte Oberflaeche, blau/cyan, methanartige Haze, weichere Baender als Gas Giant

Referenz-Mapping aus den aktuellen Bildvorgaben:

- trockene Fels-/Barren-Welten: harte graue bis braune Reliefs, wenig Gruen, matte Atmosphaere oder keine Atmosphaere
- Toxic: cyan-graue Chemiebecken, milchige Haze, rostbraune Hochlaender, nicht erdaehnlich gruen
- Ice: helles Blau/Weiss, kalte Risse, hoher Albedo-Wert, aus der Systemansicht klar heller als Rocky/Carbon
- Metal-rich: grau/goldene airless Ridges, trockener Look, kein Vegetationsgruen
- Lava: schwarze Basaltflaechen mit roten/orangen Emissionsrissen, aus der Entfernung sofort als Hot-World lesbar
- Ocean/Terrestrial: Ocean deutlich blau/tuerkis mit wenigen Inseln, Terrestrial gruene/braune Kontinente plus blaue Ozeane
- Gas Giant: grosse Baender-/Ring-Silhouette bleibt, keine Partikelhuelle ausser Ring-/Bandstruktur

Recherche-Leitlinien:

- terrestrische/innere Planeten sind feste Oberflaechenwelten
- Ocean/Ice worlds werden durch viel Wasser/Eis, Eisdecken, Risse und hohe/unterirdische Wasseranteile gepraegt
- Gas Giants haben keine harte Oberflaeche, sondern Atmosphaeren mit Baendern/Wolken
- Lava worlds sind extreme heisse Felswelten mit Magma-Oberflaechen und teils dichter Atmosphaere

## Phase 10: Type Material Architecture

Status: in Arbeit

Fortschritt:

- [x] Architekturregel festgelegt: patch-basierte feste Planeten bleiben auf `CubeSphere` + `TerrainPatch`
- [x] fehlerhaften Ersatz-Sphere-Layer fuer normale feste Planetentypen wieder entfernt
- [x] `PlanetSurfaceMaterialFactory` einfuehren
- [x] `Planet.ts` auf Material-Factory umstellen
- [x] Ocean als ersten patch-basierten Typ sichtbar verbessern: WebGPU-Palette mit tieferem Wasser, Shelf-Maske, Inselmaske und Polarice
- [x] erste staerkere WebGPU-Type-Paletten fuer Ocean, Desert, Barren/Rocky, Toxic, Metal, Carbon
- [x] reines Palette-Tuning als nicht ausreichend erkannt: Typen blieben visuell zu aehnlich
- [x] WebGPU Final-Type-Overrides nach Lighting fuer Ocean, Desert, Barren, Rocky, Toxic, Metal und Carbon eingebaut
- [x] gemeinsame Surface-Helligkeit angehoben: Ambient/Exposure/Night-Tint fuer WebGPU und WebGL moderat heller
- [x] WebGL-Helligkeit nachjustiert: WebGL wieder dunkler als die WebGPU-Aufhellung, damit der alte Referenzlook nicht ausbrennt
- [x] Toxic nach Referenz angepasst: matte tuerkis-graue Haze/Becken, rostbraune Verfaerbungen, dichtere helle Atmosphaere
- [x] WebGL Toxic-Profil angebunden: `PlanetSurfaceMaterial` erkennt `SurfaceRenderProfile.palette === toxic`
- [x] WebGPU Toxic weiter Richtung Referenz verschoben: weniger Earthlike-Gruen, mehr cyan-graue Chemiebecken und milchige Haze
- [x] Toxic aus Ocean-/Wasserprofil entfernt: Toxic rendert chemische Becken statt blauer Ozeane
- [x] Toxic Standardwolken deaktiviert und durch `ToxicHazeLayer` ersetzt
- [x] Toxic-Oberflaeche auf desert-artiges Hoehen-/Reliefprofil umgestellt: keine Kontinent-/Wasser-Maske mehr fuer Toxic-Farben
- [x] WebGPU-Helligkeit nach WebGL-Vergleich angehoben: Ambient, Exposure, Terminator und Nachtanteil im NodeMaterial angepasst
- [ ] Helligkeit getrennt pro Renderer final abstimmen: dafuer jeweils konkrete `renderer=gpu` und `renderer=gl` Screenshots vergleichen
- [ ] nach Screenshot-Vergleich pro Typ gezielt nachjustieren
- [ ] WebGL-Palette an WebGPU-Type-Paletten angleichen

Ziel:

Planetentypen sollen die Terrain-Patches behalten, aber visuell klar getrennt sein.

Massnahmen:

- neues Modul `src/planet/materials/PlanetSurfaceMaterialFactory.ts`
- eindeutige Material-Strategie pro Planetentyp
- keine weiteren Type-Hacks direkt in `Planet.ts`
- gemeinsames Interface fuer WebGPU und WebGL:
  - `setTerrainSeed(seed)`
  - `setSurfaceProfile(profile)`
  - `setRenderQuality(quality)`
  - `setBakedTerrainBlend(value)`
  - `dispose()`

Material-Varianten:

- `earthlike`
- `oceanic`
- `desert`
- `barren`
- `rocky`
- `toxic`
- `carbon`
- `metallic`

Akzeptanz:

- alle festen Standardtypen nutzen weiterhin `CubeSphere`
- `getTerrainStats()` zeigt sichtbare Patches
- `class=ocean` sieht klar nach Ocean-Planet aus
- `class=desert` sieht nicht wie Earthlike aus
- `class=metal_rich` hat metallischen, trockenen Look
- `class=carbon` wirkt dunkel, kohlenstoffreich, nicht einfach nur grau

## Phase 11: Terrain Profiles Per Planet Type

Status: begonnen

Fortschritt:

- [x] `TerrainProfileKind` und zentrale Profilsettings in `utils/noise.ts` angelegt
- [x] Planetklassen ueber `resolveTerrainProfileKind()` auf Terrainprofile gemappt
- [x] `Planet.ts` gibt das Terrainprofil an `createTerrainSeedConfig()` weiter
- [x] WebGPU Terrain-Bake nimmt `terrainProfile` an
- [x] WebGPU Surface-Procedural-Sample nutzt Profil-Bias fuer Ocean/Desert/Rocky/etc.
- [x] Klima-, Atmosphaeren- und Surface-Generator pro Planetklasse deutlich typisiert
- [x] Terrainprofile fuer Ocean, Desert, Barren/Rocky, Toxic, Carbon und Metal staerker getrennt
- [x] Carbon visuell von "nur dunkel" auf Graphit-/Asche-Oberflaeche mit helleren Hochlaendern und Bruchadern umgestellt
- [x] WebGL Surface-Helligkeit naeher an WebGPU angepasst: niedrigeres Exposure, weniger Horizon Glow, neutraleres Final-Gamma
- [x] Planet-Erzeugung vereinheitlicht: alle Solid-Planeten laufen ueber SurfaceMaterial + CubeSphere/TerrainPatch, Spezial-Layer sind nicht mehr der primaere Erzeugungspfad
- [x] WebGL/WebGPU Atmosphaeren- und Cloud-Profile angeglichen: beide Pfade nehmen Coverage/Density/Haze aus dem RenderProfile
- [x] Gemeinsame Basishelligkeit nachgezogen: WebGPU weniger ueberstrahlt, WebGL weiterhin lesbar aber weniger hell
- [x] Render-Tuning-Panel per `?tuning=1` eingebaut: Ambient, Exposure, Horizon Glow, Surface Detail, Color Mix, Texture und Bake Blend live vergleichbar
- [x] Ocean im WebGL-Surface-Pfad als eigene Palette verdrahtet: Tiefwasser, Shelf-Farbe, Inselmasken und subtile Wellenstruktur
- [x] Quadtree-Audit begonnen: `TerrainPatchLeaf` traegt stabile Patch-Adressen und Edge-IDs fuer LOD-/Randdiagnose
- [x] `CubeSphere` 2:1-Balance beruecksichtigt auch Cube-Face-Grenzen statt nur Face-lokale Nachbarn
- [x] `TerrainPatch`-Normalen an Patchraendern auf terrainSource-basierte Tangential-Samples umgestellt
- [ ] CPU-Terrain und WebGPU-Bake noch weiter angleichen: randomisierte Skalen/Bias-Werte auch im Bake pflegen
- [ ] Terrainprofile fuer Desert, Barren/Rocky, Toxic, Metal, Carbon gezielt visuell tunen

Rendering-Referenzen:

- Maxime Heckel, "On Rendering the Sky, Sunsets, and Planets" (2026):
  - Relevant fuer uns: Rayleigh/Mie getrennt denken, optische Tiefe/Transmittance als Grundlage, Atmosphaere als eigenes Profil statt hart codierter Farbe.
  - Kurzfristig uebernommen: Profil-Hooks fuer WebGL/WebGPU-Atmosphaere angleichen und Basishelligkeit stabilisieren.
  - Spaeter sinnvoll: echte transmittance-/scattering-naehere Atmosphaerenschale oder LUT-Ansatz.
- Sebastian Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique":
  - Relevant fuer spaeter: LUT-/multi-scattering-nahe Atmosphaere, performant von Boden bis Orbit.
- Bruneton/Neyret, "Precomputed Atmospheric Scattering":
  - Relevant fuer spaeter: hoehere physikalische Qualitaet, aber fuer den aktuellen Browser-Prototyp vermutlich erst nach stabilen Planetentypen/LOD sinnvoll.
- jsulpis, `realtime-planet-shader`:
  - GPL-3.0, daher keine Code-Uebernahme.
  - Relevant fuer uns: analytisches Sphere-Raycasting als Referenz fuer Preview-/Screenshot-Modus, FBM-basierte Normal-/Farbdetails, Fake-Atmosphaere ueber Distanzfunktionen und eine Uniform-Tuning-GUI.
  - Kurzfristig sinnvoll: Debug-/Tuning-Panel fuer Surface-/Atmosphere-Uniforms, damit Helligkeit, Atmosphaere und Typ-Paletten vergleichbar einstellbar werden.
- GameDev.net, "Baby's First Planet Renderer":
  - Relevant fuer uns: grosse Skalen brauchen lokale Referenzframes statt globaler Float-Koordinaten.
  - Planetentiles sollten ueber stabile Cube-Sphere-Adressen deterministische Seeds bekommen.
  - Tile-Raender brauchen eindeutige Edge-/Vertex-IDs oder Overlap, damit LOD-Uebergaenge, Interpolation und Normalen nicht reissen.
  - Triplanare Texturierung in Tile-/Local-Space ist robuster als World-Space, sobald Referenzframes oder grosse Skalen ins Spiel kommen.
  - Kurzfristig sinnvoll: TerrainPatch-Adressen, Nachbar-/Randdaten und Normal-Berechnung explizit auditieren, bevor Near-Surface-LOD und Sonnensystem-Skala wachsen.
- Florian Michelic, "Real-Time Rendering of Procedurally Generated Planets":
  - Relevant fuer uns: Terrain, Ocean, volumetrische Clouds und Atmosphaere sollten als zusammenhaengende Planet-Pipeline gedacht werden, nicht als unabhaengige Effekte.
  - Projected/persistent grid ist eine Alternative oder Ergaenzung fuer extreme Naehe/Fluggeschwindigkeit; unser CubeSphere-LOD bleibt aber vorerst der stabile Basispfad.
  - Sphaerische Ocean-Waves/Gerstner-artige Wellen sind fuer `ocean` spaeter wichtiger als nur eine blaue Oberflaeche.
  - Kurzfristig sinnvoll: Ocean als eigener Profil-Schwerpunkt mit Wasseroberflaeche, Fresnel, Wellen-Normalen und klarer Trennung von Land-Terrain behandeln.

Ziel:

Nicht nur Farben, sondern auch Hoehen, Landmassen und Details muessen zum Typ passen.

Massnahmen:

- `TerrainSeedConfig` um Type-Parameter erweitern
- Terrain-Sampling typisieren:
  - ocean: grosser Wasseranteil, wenige Inselketten
  - terrestrial: Kontinente, Kuesten, Gebirge
  - desert: trockene Plateaus, Duenen-/Erosionsmuster
  - barren/rocky: Krater, Bruchkanten, starke Reliefs
  - toxic: flache, chemische Becken, dichte Atmosphaere
  - metal_rich: harte Ridges, scharfes Relief, wenig Wasser
  - carbon: dunkle Ebenen, Fissuren, geringe Albedo

Technische Richtung:

- `getTerrainSample(normal, terrainSeedConfig)` darf nicht nur seedbasiert sein
- `TerrainSeedConfig` bekommt `planetClass` oder `terrainProfile`
- CPU-Terrain und GPU-Material muessen dieselben Profilparameter nutzen

Akzeptanz:

- LOD-Patches stimmen mit Shader-Look ueberein
- Kuestenlinien liegen optisch auf der Geometrie
- Ocean hat plausible Inseln und Wasserflaechen
- Desert/Ocean/Terrestrial haben klar verschiedene Topologie

## Phase 12: WebGPU/WebGL Visual Parity

Ziel:

WebGPU soll nicht schlechter wirken als WebGL.

Massnahmen:

- gemeinsame Farbpaletten und Surface-Profile auslagern
- WebGL ShaderMaterial und WebGPU NodeMaterial aus denselben Profilwerten speisen
- Coastlines, Wasser, Eis, Specular und Atmosphere-Tints angleichen
- Debug-HUD fuer aktive Palette/Profile-Werte ausbauen

Akzeptanz:

- gleiche Seed/Class-Kombination ist in WebGL und WebGPU erkennbar derselbe Planet
- Unterschiede duerfen technisch sein, aber nicht stilistisch falsch
- Coastlines in WebGPU wirken mindestens so klar wie in WebGL

## Phase 13: Photoreal Surface Detail

Ziel:

Mehr Glaubwuerdigkeit aus Orbit und Near-Orbit.

Massnahmen:

- bessere Bathymetry fuer Ocean
- Coast foam/shelf tint sehr subtil
- Atmosphere scattering pro Atmosphaerentyp
- Wolkenprofile pro Typ:
  - earthlike: Wasserwolken
  - ocean: breite Wettersysteme
  - toxic: gelbliche/schweflige Dunstschichten
  - ice: duenne Eisnebel
  - lava: Asche/Dunst
- Normal-/roughness-artige Details pro Materialprofil
- PostFX nur subtil:
  - Bloom fuer Lava/Stern
  - Vignette sehr mild
  - Color Grading moderat

Akzeptanz:

- Screenshots wirken besser, ohne ueberfiltert zu sein
- keine Instagram-Saettigung
- dunkle Seiten bleiben lesbar
- Lava glowt, Ocean reflektiert, Ice wirkt kalt, Desert trocken

## Phase 14: Near Surface Detail

Ziel:

Lokales High-Detail-Terrain nur dort aktivieren, wo Bodennähe echte Geometrie
und Materialdetails braucht.

Massnahmen:

- `NearSurfaceTerrainLayer` nur in Bodennähe aktivieren
- alten objektbasierten `NearSurfaceDetailLayer` entfernen
- lokales Terrainfenster aus denselben Terrain-Samples wie der Planet erzeugen
- in Kamera-/Bodennähe höher aufgelöste lokale Geometrie nachführen
- Type-spezifische lokale Terrainfarben und spaeter Materialregeln:
  - terrestrial: Fels, Boden, Grasland-Andeutung
  - desert: Duenen-/Erosionsfarben und trockene Plateaus
  - barren/rocky: harte Ridges, Krater-/Geruellsfarben
  - ice: Frost-/Rissfarben
  - lava: Basalt-/Aschefarben
  - ocean: nur Insel/Kueste, keine Unterwasser-Details
- Near-Surface nur ab passender LOD/Distanz

Fortschritt:

- [x] objektbasierten `NearSurfaceDetailLayer` entfernt
- [x] `NearSurfaceTerrainLayer` als lokales Terrainfenster in Bodennähe eingebaut
- [x] HUD-Stats auf `near terrain` umgestellt
- [ ] triplanare Near-Surface-Materialien einbauen
- [ ] lokale Patch-Übergänge zum Planetmesh weicher blenden
- [ ] Detailnormalen/Materialrauschen pro Planettyp ergänzen

Akzeptanz:

- kein Objekt-Detail-Layer auf Lava/Ice/Ocean
- lokales Terrain poppt nicht hart rein
- Performance bleibt stabil

## Phase 15: Star System Scene

Ziel:

`StarSystemDefinition` wird als echte Szene gerendert.

Massnahmen:

- neues Modul `src/system/StarSystemScene.ts`
- Sternmesh mit emissivem Material
- 4 Planeten aus `generateStarSystemDefinition(seed, { planetCount: 4 })`
- skalierte Orbits
- Orbit-Linien optional per URL/Debug
- Planeteninstanzen als `Planet`
- Camera Modes:
  - system view
  - focus planet
  - free orbit
- Auswahl per URL:
  - `?system=1`
  - `?systemSeed=...`
  - `?planet=2`

Skalierung:

- echte astronomische Distanzen muessen visuell komprimiert werden
- Planetenradius und Orbitradius getrennt skalieren
- Rendering darf nicht wegen riesiger Koordinaten instabil werden

Akzeptanz:

- eine Szene mit Stern und 4 Planeten startet stabil
- jeder Planet nutzt seine Klasse und sein Renderprofil
- Kamera kann zwischen System und Einzelplanet wechseln
- bestehender Einzelplanet-Modus bleibt erhalten

## Phase 16: Simulation Layer

Ziel:

Das Sonnensystem soll leicht simuliert wirken, ohne gleich ein voll physikalischer Simulator zu sein.

Massnahmen:

- Orbitbewegung pro Planet aus `orbitalPeriod`
- Rotation pro Planet aus `rotationSpeed`
- Monde bewegen sich um Planet
- Ringe bleiben korrekt orientiert
- Sim-Speed:
  - Pause
  - 1x
  - 10x
  - 100x
- deterministic seed-based start phase

Akzeptanz:

- Bewegung ist ruhig und nachvollziehbar
- Simulation bleibt deterministisch pro Seed
- keine Drift durch kaputte Parent-Transforms

## Phase 17: Performance And LOD For System View

Ziel:

Mehrere Planeten duerfen die Performance nicht zerstoeren.

Massnahmen:

- Planet LOD je nach Kamera/Fokus
- entfernte Planeten als impostor/low-poly sphere
- aktive High-LOD-Patches nur fuer Fokusplanet
- Atmosphere/Cloud/Raymarch Steps pro Distanz reduzieren
- Terrain baking nur fuer sichtbare/fokussierte Planeten

Akzeptanz:

- 4 Planeten laufen stabil
- Systemansicht rendert fluessig
- Fokusplanet behaelt hohe Qualitaet
- keine unnötigen Terrain-Bakes fuer entfernte Planeten

## Phase 18: Tooling And Debug UX

Ziel:

Schnell pruefen koennen, ob Klassen, Seeds, LOD und Profile stimmen.

Massnahmen:

- Debug Panel:
  - planet class
  - renderer kind
  - material profile
  - terrain patch stats
  - LOD profile
  - postfx on/off
  - WebGPU/WebGL mode
- URL Controls:
  - `class=...`
  - `seed=...`
  - `renderer=gpu|gl`
  - `postfx=0`
  - `system=1`
  - `systemSeed=...`
  - `planet=...`
- Screenshot presets fuer Vergleich

Akzeptanz:

- Fehler wie "Ocean nutzt keine Patches" sind sofort sichtbar
- Seeds und Klassen sind reproduzierbar
- Testszenen lassen sich per URL teilen

## Phase 19: RTS Game Foundation

Ziel:

Aus dem Planet-/Systemrenderer wird ein spielbarer Space-RTS-Prototyp:
strategische Entscheidungen ueber ein Systemnetz und taktische 3D-Navigation
innerhalb eines Systems.

Designrichtung:

- strategische Ebene inspiriert von Sektor-/Lane-Kontrolle:
  Systeme sind Knoten, Sprungverbindungen sind begrenzte Routen, Flotten
  werden ueber Frontlinien und Chokepoints verschoben
- taktische Ebene mit freier 3D-Raumbewegung:
  Schiffe/Fleet-Gruppen bekommen echte 3D-Ziele inklusive Hoehenoffset
- eigene Regeln, Daten, UI und Assets; keine Uebernahme fremder Inhalte

Fortschritt:

- [x] `GameWorld`-Datenmodell fuer Nodes, Lanes, Fleets, Ships und Orders angelegt
- [x] deterministischen `generateGameWorld()`-Startzustand mit Homeworlds, Ressourcen- und Chokepoint-Systemen angelegt
- [x] erste taktische Move-Simulation fuer Flotten/Schiffe mit Formation und weichem Ankommen angelegt
- [x] `TacticalNavigation`-State fuer Homeworld-artige 3D-Move-Drafts angelegt
- [x] `?game=1`-Modus an `GameWorld` angebunden, ohne Planet-Bake zu starten
- [x] einfache Node-/Lane-/Ship-Meshes und Fleet-Auswahl rendern
- [x] Mouse-Picking fuer Tactical Move Anchor
- [x] vertikale Move-Ebene/Height-Offset per Mausrad und Enter/Esc anschliessen
- [x] Systemansicht aus strategischem Knoten per Doppelklick/Enter oeffnen und per Esc/Backspace verlassen
- [x] Flotten in Systemansicht lokal 3D navigierbar machen
- [x] erste baubare Dummy-Orbitalstation (`shipyard`) ohne Ressourcen-/Builder-Voraussetzung anlegen
- [x] strategische Lane-Moves zwischen Systemen simulieren
- [x] Schiffswerft kann ersten Fighter ohne Ressourcen-/Builder-Voraussetzung bauen
- [x] Systemansicht nutzt echte `Planet`-Renderer aus `StarSystemDefinition` mit dem aktuellen Viewer-Renderer-Modus
- [x] Systemplaneten laden zuerst als leichte Preview-Spheres und werden danach lazy als echte `Planet`-Renderer aufgebaut
- [x] aufgebaute Systemplaneten werden pro System gecacht, damit ein erneuter Systemwechsel nicht wieder alle Planeten erzeugt
- [x] Systemplaneten nutzen die lokale Systemsonne als Shader-Sonnenrichtung statt der globalen Viewer-Sonnenrichtung
- [x] Systemansicht nutzt eigene sichtbare Planetenskala: feste Planeten groesser, Gas-/Eisriesen deutlich groesser, Orbits weiter auseinander
- [x] Systemansicht rendert feste Planeten mit visueller Mindestgroesse `3.0`, damit kleine Klassen taktisch lesbar bleiben
- [x] `StarSystemGenerator` verteilt Planetentypen zoniert und vermeidet direkte Wiederholungen gleichartiger Klassen
- [x] Systemscale nachjustiert: Planeten/Stern/Orbits groesser, Schiffe und Stationen in taktischer Ansicht kleiner
- [x] Planetentypen an plausible Orbit-Zonen relativ zur Stern-Luminositaet gebunden und Klassenfamilien pro System limitiert
- [x] `barren` im RenderProfile nicht mehr als `rocky` ausweisen
- [x] Gas-/Eisriesen behalten Ringe, aber der optionale Cloud-Particle-Schleier ist standardmaessig deaktiviert
- [x] Flottenauswahl in Systemansicht springt zum System der gewaehlten Flotte, damit initial gesetzte Flotten sichtbar/kommandierbar bleiben
- [x] Flottenmenue links mit direkter Auswahl und Selektions-Hervorhebung
- [x] einfache Fleet-vs-Fleet-Angriffe mit Huelle und Schaden
- [x] Systemausgaenge in der taktischen Ansicht als Sprungmarker anzeigen und Rechtsklick-Lane-Move anschliessen
- [x] erstes Schiff-Asset (`capital_ship.obj/.mtl`) per OBJ/MTL-Loader mit Dummy-Fallback in die Flottenansicht einbauen
- [x] WebGPU-Postprocessing vorerst auf direkten Render-Fallback setzen, damit keine `ShaderMaterial`-NodeBuilder-Fehler geloopt werden
- [ ] Ressourcen, Shipyard-Queue und einfache Gegnerlogik einfuehren

Akzeptanz:

- Spieler kann eine Flotte auswaehlen und im 3D-Raum bewegen
- strategische Karte zeigt verbundene Systeme und Besitz
- Flotten koennen zwischen verbundenen Systemen wechseln
- aktueller Planet-Viewer bleibt als Debug-/Inspektionsmodus erhalten

## Prioritaet Fuer Die Naechsten Schritte

1. Terrain-Patch-Pfad fuer feste Planeten unangetastet lassen.
2. Keine festen Planetentypen mehr am `CubeSphere`-/TerrainPatch-Pfad vorbei erzeugen.
3. Material-Factory und Renderprofile fuer patch-basierte Planetentypen weiter schaerfen.
4. Ocean, Ice, Lava, Desert, Toxic, Carbon, Metal visuell eindeutig machen.
5. Erst dann Star-System-Szene mit 4 Planeten aufsetzen.
6. Danach System-LOD und Simulation.

## Wichtigste Architekturregel

Wenn ein Planet feste Oberflaeche und LOD-Terrain haben soll, darf er nicht durch ein einfaches Sphere-Mesh ersetzt werden.

Eigene Type-Renderer muessen entweder:

- auf `CubeSphere`/`TerrainPatch` aufsetzen
- oder bewusst Spezialfaelle ohne Terrain-Patches sein

Diese Trennung verhindert, dass visuelle Verbesserungen versehentlich LOD, Patches, Terrain-Stats oder Near-Surface-Features kaputtmachen.
