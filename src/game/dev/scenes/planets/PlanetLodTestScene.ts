import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { generatePlanetDefinition, generatePlanetResourceProfile } from '@conduit/planet/generation';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { Planet, createPlanetRenderProfile, getPlanetClassVisualProfile, OCEAN_COASTLINE_PROFILE, type PlanetRenderProfile, type SurfacePaletteKind } from '@conduit/planet/rendering';
import { getPlanetRadiusMeters } from '@conduit/planet/near-view';
import { PLANET_CLIMATE_DEBUG_MODES, createPlanetClimateDiagnostics, drawPlanetClimateDebugMap, type PlanetClimateDiagnostics } from '@conduit/planet/diagnostics';
import type { ClimateDebugMode } from '@conduit/planet/climate';
import { getPlanetScaleDiagnostics, getSystemPlanetRenderRadius } from '../../../spatial/SpatialRenderScale';

const LAB_PLANET_RADIUS = 3;
const SURFACE_TRANSITION_START_METERS = 1_500_000;
const SURFACE_TRANSITION_END_METERS = 120_000;

const PLANET_CLASSES: PlanetClass[] = ['barren','rocky','terrestrial','ocean','desert','ice','lava','toxic','carbon','metal_rich','gas_giant','ice_giant'];
type PlanetLayerToggles = { surface:boolean; ocean:boolean; atmosphere:boolean; clouds:boolean; gasParticles:boolean; rings:boolean; moons:boolean; nearSurfaceTerrain:boolean; toxicHaze:boolean; };

export class PlanetLodTestScene implements FeatureTestScene {
  readonly id='planet-lod'; readonly name='Planet LOD'; readonly category='Planets' as const; readonly description='Production Planet renderer with LOD stats.';
  private context:FeatureTestContext|null=null; private readonly root=new THREE.Group(); private planet:Planet|null=null; private definition:PlanetDefinition|null=null; private profile:PlanetRenderProfile|null=null; private climateDiagnostics:PlanetClimateDiagnostics|null=null; private stats:HTMLElement|null=null; private climateCanvas:HTMLCanvasElement|null=null; private seed=3001; private planetClass:PlanetClass='ocean'; private climateDebugMode:ClimateDebugMode='biome';
  private readonly layerToggles:PlanetLayerToggles={surface:true,ocean:true,atmosphere:true,clouds:true,gasParticles:true,rings:true,moons:true,nearSurfaceTerrain:true,toxicHaze:true};
  init(context:FeatureTestContext):void{this.context=context;this.root.name='PlanetLodTestScene';context.scene.add(this.root);context.camera.position.set(0,3.2,9.5);context.controls.target.set(0,0,0);context.controls.enablePan=false;context.controls.update();this.createUi(context.uiRoot);this.createPlanet();}
  update(deltaSeconds:number):void{if(!this.context||!this.planet)return;this.planet.update(this.context.camera.position,deltaSeconds);this.planet.setRenderQuality('idle');this.updateStats();}
  dispose():void{this.planet?.dispose();this.planet=null;this.context?.scene.remove(this.root);disposeObject3D(this.root);this.root.clear();this.context=null;}
  reset():void{this.createPlanet();}

  private createUi(root:HTMLElement):void{
    root.innerHTML=`<label style="display:block;margin:6px 0;">Class <select data-planet-class>${PLANET_CLASSES.map(p=>`<option value="${p}"${p===this.planetClass?' selected':''}>${formatPlanetClass(p)}</option>`).join('')}</select></label><label style="display:block;margin:6px 0;">Seed <input data-seed type="number" value="${this.seed}" style="width:110px;"></label><label style="display:block;margin:6px 0;">Climate Map <select data-climate-debug>${PLANET_CLIMATE_DEBUG_MODES.map(mode=>`<option value="${mode}"${mode===this.climateDebugMode?' selected':''}>${formatDebugMode(mode)}</option>`).join('')}</select></label><button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button><canvas data-climate-map width="240" height="120" style="display:block;width:240px;height:120px;margin-top:8px;border:1px solid rgba(120,180,255,.35);border-radius:4px;image-rendering:pixelated;background:#05070a;"></canvas><div data-planet-stats style="margin-top:8px;opacity:.78"></div>`;
    this.stats=root.querySelector<HTMLElement>('[data-planet-stats]');
    this.climateCanvas=root.querySelector<HTMLCanvasElement>('[data-climate-map]');

    root.querySelector<HTMLButtonElement>('[data-apply-planet]')?.addEventListener('click',()=>{
      const input=root.querySelector<HTMLInputElement>('[data-seed]');
      const select=root.querySelector<HTMLSelectElement>('[data-planet-class]');
      const nextSeed=Number(input?.value??this.seed);
      this.seed=Number.isFinite(nextSeed)?Math.max(1,Math.floor(nextSeed)):this.seed;
      this.planetClass=isPlanetClass(select?.value)?select.value:this.planetClass;
      this.createPlanet();
    });

    root.querySelector<HTMLSelectElement>('[data-climate-debug]')?.addEventListener('change',(event)=>{
      this.climateDebugMode=(event.currentTarget as HTMLSelectElement).value as ClimateDebugMode;
      this.updateClimateMap();
    });
  }

  private createPlanet():void{
    if(!this.context)return;
    this.planet?.dispose();this.planet=null;this.definition=null;this.profile=null;this.climateDiagnostics=null;this.root.clear();this.context.clearReport();
    const generatedDefinition=generatePlanetDefinition(this.seed,{name:`LOD ${this.seed}`,semiMajorAxis:1,starIrradiance:1,forcePlanetClass:this.planetClass});
    const definition=this.createDebugDefinition(generatedDefinition);
    const profile=this.createDebugRenderProfile(createPlanetRenderProfile(definition));
    this.definition=definition;this.profile=profile;this.climateDiagnostics=createPlanetClimateDiagnostics(definition);
    this.planet=new Planet(LAB_PLANET_RADIUS,this.context.rendererMode,null,{gasCloudParticles:this.layerToggles.gasParticles&&(definition.class==='gas_giant'||definition.class==='ice_giant'),moonSystem:this.layerToggles.moons,nearSurfaceTerrain:this.layerToggles.nearSurfaceTerrain},definition,profile);
    this.root.add(this.planet.group);
    this.context.report({status:'pass',label:'planet created',detail:`${definition.class} / seed ${definition.seed}`});
    this.updateClimateMap();
  }

  private createDebugDefinition(definition:PlanetDefinition):PlanetDefinition{if(this.layerToggles.ocean)return definition;const d={...definition,composition:{...definition.composition,water:0},surface:{...definition.surface,hasOcean:false,oceanLevel:-1},atmosphere:{...definition.atmosphere,cloudCoverage:this.layerToggles.clouds?definition.atmosphere.cloudCoverage:0}};return {...d,resources:generatePlanetResourceProfile({planetClass:d.class,composition:d.composition,atmosphere:d.atmosphere,surface:d.surface,climate:d.climate})};}
  private createDebugRenderProfile(profile:PlanetRenderProfile):PlanetRenderProfile{return {...profile,enableOcean:profile.enableOcean&&this.layerToggles.ocean,enableAtmosphere:profile.enableAtmosphere&&this.layerToggles.atmosphere,enableClouds:profile.enableClouds&&this.layerToggles.clouds,enableRings:profile.enableRings&&this.layerToggles.rings};}
  private updateStats():void{
    if(!this.planet||!this.context||!this.stats||!this.definition||!this.profile)return;
    const terrain=this.planet.getTerrainStats();
    const visualProfile=getPlanetClassVisualProfile(this.profile.surfacePalette as SurfacePaletteKind);
    const physicalRadiusMeters=getPlanetRadiusMeters(this.definition);
    const physicalRadiusKilometers=physicalRadiusMeters/1000;
    const gameRenderRadius=getSystemPlanetRenderRadius(physicalRadiusMeters,this.definition.class);
    const gameScale=getPlanetScaleDiagnostics(physicalRadiusMeters,gameRenderRadius);
    const cameraDistance=this.context.camera.position.length();
    const altitudeMeters=Math.max(0,(cameraDistance/LAB_PLANET_RADIUS-1)*physicalRadiusMeters);
    const transition=getSurfaceTransitionDebug(altitudeMeters);
    this.stats.innerHTML=`class: ${this.planetClass}<br>renderer: ${this.context.rendererMode}<br>real radius: ${formatKilometers(physicalRadiusKilometers)} km<br>game radius: ${gameRenderRadius.toFixed(1)}u (${formatScaleMultiplier(gameScale.visualScaleMultiplier)})<br>visual profile: ${format01(visualProfile.ambientBoost)}<br>coast: ${formatRange(OCEAN_COASTLINE_PROFILE.waterHintStart,OCEAN_COASTLINE_PROFILE.waterHintEnd)}<br>patches: ${terrain.visibleMeshes}/${terrain.totalPatches}<br>max lod: ${terrain.maxLevel}<br><br><b>surface transition debug</b><br>altitude: ${formatAltitude(altitudeMeters)}<br>phase: ${transition.phase}<br>blend: ${(transition.blend*100).toFixed(1)}%<br>orbit weight: ${(1-transition.blend).toFixed(2)} / surface weight: ${transition.blend.toFixed(2)}<br>thresholds: ${(SURFACE_TRANSITION_START_METERS/1000).toFixed(0)} km → ${(SURFACE_TRANSITION_END_METERS/1000).toFixed(0)} km`;
  }
  private updateClimateMap():void{if(!this.climateCanvas||!this.definition)return;drawPlanetClimateDebugMap(this.climateCanvas,this.definition,this.climateDebugMode);}
}

function getSurfaceTransitionDebug(altitudeMeters:number):{blend:number;phase:'orbit'|'transition'|'surface'}{
  const t=THREE.MathUtils.clamp((SURFACE_TRANSITION_START_METERS-altitudeMeters)/(SURFACE_TRANSITION_START_METERS-SURFACE_TRANSITION_END_METERS),0,1);
  const blend=t*t*(3-2*t);
  return {blend,phase:blend<=0?'orbit':blend>=1?'surface':'transition'};
}
function isPlanetClass(value:string|undefined):value is PlanetClass{return PLANET_CLASSES.includes(value as PlanetClass);}
function formatPlanetClass(v:PlanetClass):string{return v.split('_').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');}
function formatDebugMode(mode:ClimateDebugMode):string{return mode.replace(/([A-Z])/g,' $1').replace(/^./,f=>f.toUpperCase());}
function format01(v:number):string{return v.toFixed(2);}
function formatRange(a:number,b:number):string{return `${a.toFixed(2)}-${b.toFixed(2)}`;}
function formatKilometers(v:number):string{return Math.abs(v)>=100?v.toFixed(0):v.toFixed(1);}
function formatScaleMultiplier(v:number):string{return v===0||!Number.isFinite(v)?'n/a':`${v.toFixed(4)}x`;}
function formatAltitude(meters:number):string{return meters>=1_000_000?`${(meters/1_000_000).toFixed(2)} Mm`:`${(meters/1000).toFixed(1)} km`;}
