import * as THREE from 'three';
import { disposeObject3D } from '@conduit/web3d/debug';
import type { FeatureTestContext, FeatureTestScene } from '../../FeatureTestScene';
import { generatePlanetDefinition, generatePlanetResourceProfile } from '@conduit/planet/generation';
import type { PlanetClass, PlanetDefinition } from '@conduit/planet/model';
import { Planet, createPlanetRenderProfile, getPlanetClassVisualProfile, OCEAN_COASTLINE_PROFILE, type PlanetRenderProfile, type SurfacePaletteKind } from '@conduit/planet/rendering';
import { getPlanetRadiusMeters, PlanetTerrainSampler } from '@conduit/planet/near-view';
import { PLANET_CLIMATE_DEBUG_MODES, createPlanetClimateDiagnostics, drawPlanetClimateDebugMap, type PlanetClimateDiagnostics } from '@conduit/planet/diagnostics';
import type { ClimateDebugMode } from '@conduit/planet/climate';
import { getPlanetScaleDiagnostics, getSystemPlanetRenderRadius } from '../../../spatial/SpatialRenderScale';

const LAB_PLANET_RADIUS = 3;
const SURFACE_TRANSITION_START_METERS = 9_000_000;
const SURFACE_TRANSITION_END_METERS = 500_000;
const REGIONAL_PATCH_FULL_METERS = 6_000_000;
const ORBIT_HIDE_METERS = 5_500_000;
const REGIONAL_PATCH_RELEASE_METERS = 10_000_000;

const PLANET_CLASSES: PlanetClass[] = ['barren','rocky','terrestrial','ocean','desert','ice','lava','toxic','carbon','metal_rich','gas_giant','ice_giant'];
type PlanetLayerToggles = { surface:boolean; ocean:boolean; atmosphere:boolean; clouds:boolean; gasParticles:boolean; rings:boolean; moons:boolean; nearSurfaceTerrain:boolean; toxicHaze:boolean; };

export class PlanetLodTestScene implements FeatureTestScene {
  readonly id='planet-lod'; readonly name='Planet LOD'; readonly category='Planets' as const; readonly description='Production Planet renderer with LOD stats.';
  private context:FeatureTestContext|null=null; private readonly root=new THREE.Group(); private planet:Planet|null=null; private definition:PlanetDefinition|null=null; private profile:PlanetRenderProfile|null=null; private climateDiagnostics:PlanetClimateDiagnostics|null=null; private regionalPatch:RegionalSurfacePatch|null=null; private stats:HTMLElement|null=null; private climateCanvas:HTMLCanvasElement|null=null; private seed=3001; private planetClass:PlanetClass='ocean'; private climateDebugMode:ClimateDebugMode='biome';
  private readonly layerToggles:PlanetLayerToggles={surface:true,ocean:true,atmosphere:true,clouds:true,gasParticles:true,rings:true,moons:true,nearSurfaceTerrain:true,toxicHaze:true};

  init(context:FeatureTestContext):void{this.context=context;this.root.name='PlanetLodTestScene';context.scene.add(this.root);context.camera.position.set(0,3.2,9.5);context.controls.target.set(0,0,0);context.controls.enablePan=false;context.controls.update();this.createUi(context.uiRoot);this.createPlanet();}
  update(deltaSeconds:number):void{
    if(!this.context||!this.planet||!this.definition)return;
    const physicalRadiusMeters=getPlanetRadiusMeters(this.definition);
    const cameraDistance=this.context.camera.position.length();
    const altitudeMeters=Math.max(0,(cameraDistance/LAB_PLANET_RADIUS-1)*physicalRadiusMeters);
    const minLodDistance=LAB_PLANET_RADIUS*(1+SURFACE_TRANSITION_START_METERS/physicalRadiusMeters);
    const lodCamera=this.context.camera.position.clone();
    if(lodCamera.length()<minLodDistance)lodCamera.setLength(minLodDistance);
    this.updateRegionalPatch(altitudeMeters);
    const orbitVisible=altitudeMeters>ORBIT_HIDE_METERS||!this.regionalPatch;
    this.planet.group.visible=orbitVisible;
    if(orbitVisible)this.planet.update(lodCamera,deltaSeconds);
    this.planet.setRenderQuality('idle');
    this.updateStats();
  }
  dispose():void{this.disposeRegionalPatch();this.planet?.dispose();this.planet=null;this.context?.scene.remove(this.root);disposeObject3D(this.root);this.root.clear();this.context=null;}
  reset():void{this.createPlanet();}

  private updateRegionalPatch(altitudeMeters:number):void{
    if(!this.context||!this.definition||!this.profile)return;
    const enabled=this.layerToggles.nearSurfaceTerrain&&this.profile.rendererKind==='solid_surface';
    if(enabled&&!this.regionalPatch&&altitudeMeters<SURFACE_TRANSITION_START_METERS){
      this.regionalPatch=new RegionalSurfacePatch(this.definition,LAB_PLANET_RADIUS,this.context.camera.position);
      this.root.add(this.regionalPatch.group);
    }
    if(this.regionalPatch&&(!enabled||altitudeMeters>REGIONAL_PATCH_RELEASE_METERS)){this.disposeRegionalPatch();return;}
    if(this.regionalPatch)this.regionalPatch.update(this.context.camera.position,getRegionalPatchOpacity(altitudeMeters));
  }
  private disposeRegionalPatch():void{if(!this.regionalPatch)return;this.root.remove(this.regionalPatch.group);this.regionalPatch.dispose();this.regionalPatch=null;}

  private createUi(root:HTMLElement):void{
    root.innerHTML=`<label style="display:block;margin:6px 0;">Class <select data-planet-class>${PLANET_CLASSES.map(p=>`<option value="${p}"${p===this.planetClass?' selected':''}>${formatPlanetClass(p)}</option>`).join('')}</select></label><label style="display:block;margin:6px 0;">Seed <input data-seed type="number" value="${this.seed}" style="width:110px;"></label><label style="display:block;margin:6px 0;">Climate Map <select data-climate-debug>${PLANET_CLIMATE_DEBUG_MODES.map(mode=>`<option value="${mode}"${mode===this.climateDebugMode?' selected':''}>${formatDebugMode(mode)}</option>`).join('')}</select></label><button data-apply-planet style="margin:4px;padding:6px 8px;">Apply</button><canvas data-climate-map width="240" height="120" style="display:block;width:240px;height:120px;margin-top:8px;border:1px solid rgba(120,180,255,.35);border-radius:4px;image-rendering:pixelated;background:#05070a;"></canvas><div data-planet-stats style="margin-top:8px;opacity:.78"></div>`;
    this.stats=root.querySelector<HTMLElement>('[data-planet-stats]'); this.climateCanvas=root.querySelector<HTMLCanvasElement>('[data-climate-map]');
    root.querySelector<HTMLButtonElement>('[data-apply-planet]')?.addEventListener('click',()=>{const input=root.querySelector<HTMLInputElement>('[data-seed]');const select=root.querySelector<HTMLSelectElement>('[data-planet-class]');const nextSeed=Number(input?.value??this.seed);this.seed=Number.isFinite(nextSeed)?Math.max(1,Math.floor(nextSeed)):this.seed;this.planetClass=isPlanetClass(select?.value)?select.value:this.planetClass;this.createPlanet();});
    root.querySelector<HTMLSelectElement>('[data-climate-debug]')?.addEventListener('change',(event)=>{this.climateDebugMode=(event.currentTarget as HTMLSelectElement).value as ClimateDebugMode;this.updateClimateMap();});
  }

  private createPlanet():void{
    if(!this.context)return;
    this.disposeRegionalPatch();this.planet?.dispose();this.planet=null;this.definition=null;this.profile=null;this.climateDiagnostics=null;this.root.clear();this.context.clearReport();
    const generatedDefinition=generatePlanetDefinition(this.seed,{name:`LOD ${this.seed}`,semiMajorAxis:1,starIrradiance:1,forcePlanetClass:this.planetClass});
    const definition=this.createDebugDefinition(generatedDefinition);const profile=this.createDebugRenderProfile(createPlanetRenderProfile(definition));
    this.definition=definition;this.profile=profile;this.climateDiagnostics=createPlanetClimateDiagnostics(definition);
    this.planet=new Planet(LAB_PLANET_RADIUS,this.context.rendererMode,null,{gasCloudParticles:this.layerToggles.gasParticles&&(definition.class==='gas_giant'||definition.class==='ice_giant'),moonSystem:this.layerToggles.moons,nearSurfaceTerrain:false},definition,profile);
    this.root.add(this.planet.group);this.context.report({status:'pass',label:'planet created',detail:`${definition.class} / seed ${definition.seed}`});this.updateClimateMap();
  }
  private createDebugDefinition(definition:PlanetDefinition):PlanetDefinition{if(this.layerToggles.ocean)return definition;const d={...definition,composition:{...definition.composition,water:0},surface:{...definition.surface,hasOcean:false,oceanLevel:-1},atmosphere:{...definition.atmosphere,cloudCoverage:this.layerToggles.clouds?definition.atmosphere.cloudCoverage:0}};return {...d,resources:generatePlanetResourceProfile({planetClass:d.class,composition:d.composition,atmosphere:d.atmosphere,surface:d.surface,climate:d.climate})};}
  private createDebugRenderProfile(profile:PlanetRenderProfile):PlanetRenderProfile{return {...profile,enableOcean:profile.enableOcean&&this.layerToggles.ocean,enableAtmosphere:profile.enableAtmosphere&&this.layerToggles.atmosphere,enableClouds:profile.enableClouds&&this.layerToggles.clouds,enableRings:profile.enableRings&&this.layerToggles.rings};}
  private updateStats():void{
    if(!this.planet||!this.context||!this.stats||!this.definition||!this.profile)return;
    const terrain=this.planet.getTerrainStats();const visualProfile=getPlanetClassVisualProfile(this.profile.surfacePalette as SurfacePaletteKind);const physicalRadiusMeters=getPlanetRadiusMeters(this.definition);const physicalRadiusKilometers=physicalRadiusMeters/1000;const gameRenderRadius=getSystemPlanetRenderRadius(physicalRadiusMeters,this.definition.class);const gameScale=getPlanetScaleDiagnostics(physicalRadiusMeters,gameRenderRadius);const cameraDistance=this.context.camera.position.length();const altitudeMeters=Math.max(0,(cameraDistance/LAB_PLANET_RADIUS-1)*physicalRadiusMeters);const transition=getSurfaceTransitionDebug(altitudeMeters);const minLodDistance=LAB_PLANET_RADIUS*(1+SURFACE_TRANSITION_START_METERS/physicalRadiusMeters);const lodCapped=cameraDistance<minLodDistance;const regionalOpacity=getRegionalPatchOpacity(altitudeMeters);
    this.stats.innerHTML=`class: ${this.planetClass}<br>renderer: ${this.context.rendererMode}<br>real radius: ${formatKilometers(physicalRadiusKilometers)} km<br>game radius: ${gameRenderRadius.toFixed(1)}u (${formatScaleMultiplier(gameScale.visualScaleMultiplier)})<br>visual profile: ${format01(visualProfile.ambientBoost)}<br>coast: ${formatRange(OCEAN_COASTLINE_PROFILE.waterHintStart,OCEAN_COASTLINE_PROFILE.waterHintEnd)}<br>patches: ${terrain.visibleMeshes}/${terrain.totalPatches}<br>max lod: ${terrain.maxLevel}<br><br><b>surface transition debug</b><br>altitude: ${formatAltitude(altitudeMeters)}<br>phase: ${transition.phase}<br>blend: ${(transition.blend*100).toFixed(1)}%<br>orbit weight: ${(1-transition.blend).toFixed(2)} / surface weight: ${transition.blend.toFixed(2)}<br>thresholds: ${(SURFACE_TRANSITION_START_METERS/1000).toFixed(0)} km → ${(SURFACE_TRANSITION_END_METERS/1000).toFixed(0)} km<br>orbit LOD cap: ${lodCapped?'ACTIVE':'off'} @ 9000 km<br>regional patch: ${this.regionalPatch?'ACTIVE':'standby'} / opacity ${(regionalOpacity*100).toFixed(0)}%<br>orbit renderer: ${this.planet.group.visible?'visible':'HIDDEN'} @ ${(ORBIT_HIDE_METERS/1000).toFixed(0)} km`;
  }
  private updateClimateMap():void{if(!this.climateCanvas||!this.definition)return;drawPlanetClimateDebugMap(this.climateCanvas,this.definition,this.climateDebugMode);}
}

class RegionalSurfacePatch {
  readonly group=new THREE.Group(); private readonly sampler:PlanetTerrainSampler; private mesh:THREE.Mesh|null=null; private readonly anchor=new THREE.Vector3();
  private readonly material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  constructor(private readonly definition:PlanetDefinition,private readonly renderRadius:number,direction:THREE.Vector3){this.group.name='RegionalSurfacePatch';this.sampler=new PlanetTerrainSampler(definition);this.rebuild(direction);this.setOpacity(0);}
  update(direction:THREE.Vector3,opacity:number):void{const next=direction.clone().normalize();if(next.dot(this.anchor)<0.985)this.rebuild(next);this.setOpacity(opacity);}
  dispose():void{this.mesh?.geometry.dispose();this.material.dispose();this.group.clear();this.mesh=null;}
  private setOpacity(value:number):void{const opacity=THREE.MathUtils.clamp(value,0,1);this.material.opacity=opacity;this.material.depthWrite=opacity>0.96;this.group.visible=opacity>0.001;}
  private rebuild(direction:THREE.Vector3):void{
    const resolution=48,extent=1.35;this.anchor.copy(direction).normalize();const up=this.anchor;const reference=Math.abs(up.y)<0.92?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);const east=new THREE.Vector3().crossVectors(reference,up).normalize();const north=new THREE.Vector3().crossVectors(up,east).normalize();const positions:number[]=[],colors:number[]=[],indices:number[]=[];const color=new THREE.Color(),d=new THREE.Vector3();
    for(let y=0;y<=resolution;y++){const v=y/resolution*2-1;for(let x=0;x<=resolution;x++){const u=x/resolution*2-1;d.copy(up).addScaledVector(east,u*extent).addScaledVector(north,v*extent).normalize();const sample=this.sampler.sample(d,false);const r=this.renderRadius*(sample.surfaceRadiusMeters/this.sampler.radiusMeters);positions.push(sample.direction.x*r,sample.direction.y*r,sample.direction.z*r);resolveRegionalColor(this.definition.class,sample.landMask,sample.rawTerrain.height,sample.isWater,color);colors.push(color.r,color.g,color.b);}}
    const stride=resolution+1;for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){const a=y*stride+x,b=a+1,c=a+stride,e=c+1;indices.push(a,c,b,b,c,e);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();if(this.mesh){this.mesh.geometry.dispose();this.mesh.geometry=geometry;}else{this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.name='RegionalSurfacePatchMesh';this.group.add(this.mesh);}}
}

function resolveRegionalColor(planetClass:PlanetClass,landMask:number,height:number,isWater:boolean,target:THREE.Color):void{if(isWater){target.setRGB(0.025,0.10+landMask*0.08,0.22+landMask*0.12);return;}const relief=THREE.MathUtils.clamp(height*0.5+0.5,0,1);if(planetClass==='desert')target.setRGB(0.38+relief*0.34,0.10+relief*0.24,0.025+relief*0.06);else if(planetClass==='ice')target.setRGB(0.48+relief*0.38,0.58+relief*0.34,0.66+relief*0.30);else if(planetClass==='lava')target.setRGB(0.18+relief*0.55,0.025+relief*0.12,0.01);else target.setRGB(0.10+relief*0.24,0.16+relief*0.30,0.08+relief*0.16);}
function getSurfaceTransitionDebug(altitudeMeters:number):{blend:number;phase:'orbit'|'transition'|'surface'}{const t=THREE.MathUtils.clamp((SURFACE_TRANSITION_START_METERS-altitudeMeters)/(SURFACE_TRANSITION_START_METERS-SURFACE_TRANSITION_END_METERS),0,1);const blend=t*t*(3-2*t);return {blend,phase:blend<=0?'orbit':blend>=1?'surface':'transition'};}
function getRegionalPatchOpacity(altitudeMeters:number):number{const t=THREE.MathUtils.clamp((SURFACE_TRANSITION_START_METERS-altitudeMeters)/(SURFACE_TRANSITION_START_METERS-REGIONAL_PATCH_FULL_METERS),0,1);return t*t*(3-2*t);}
function isPlanetClass(value:string|undefined):value is PlanetClass{return PLANET_CLASSES.includes(value as PlanetClass);}
function formatPlanetClass(v:PlanetClass):string{return v.split('_').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ');}
function formatDebugMode(mode:ClimateDebugMode):string{return mode.replace(/([A-Z])/g,' $1').replace(/^./,f=>f.toUpperCase());}
function format01(v:number):string{return v.toFixed(2);}
function formatRange(a:number,b:number):string{return `${a.toFixed(2)}-${b.toFixed(2)}`;}
function formatKilometers(v:number):string{return Math.abs(v)>=100?v.toFixed(0):v.toFixed(1);}
function formatScaleMultiplier(v:number):string{return v===0||!Number.isFinite(v)?'n/a':`${v.toFixed(4)}x`;}
function formatAltitude(meters:number):string{return meters>=1_000_000?`${(meters/1_000_000).toFixed(2)} Mm`:`${(meters/1000).toFixed(1)} km`;}
