import {DEFAULT_STATE,PRESETS,SHAPE_OPTIONS,STRUCTURE_OPTIONS,normalizeState,buildModel,makePlan,validatePlan,sampleProfile,serializeDesign,inspectFloor} from './model-engine.js';
import {createScene} from './scene.js';
import {downloadRhino} from './export.js';
import {SITE_OPTIONS,normalizeSiteContext,getSiteContext,applySiteContext,buildingToSitePoint,isVancouverMapLocation} from './site-context.js';
import {createModelDiagram} from './model-diagram.js';
import {createVancouverMap} from './vancouver-map.js';
import {lookupParcel} from './parcel-lookup.js';
import {createVancouverSection} from './vancouver-section.js';
import {VANCOUVER_STUDIES,VANCOUVER_SOURCES} from './data/vancouver-studies.js';

const $=id=>document.getElementById(id);
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const format=(v,d=0)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d});
const CURRENT_KEY='vancouver-tall-form-studio-current-v1';
const OPTIONS_KEY='vancouver-tall-form-studio-options-v1';
const TRUSS_GUIDES={warren:'Alternating triangular webs. Member forces depend on supports and loading.',pratt:'Vertical posts and mirrored diagonals. Conventional gravity examples often use tension diagonals; forces in this model are not calculated.',howe:'The diagonal direction reverses the Pratt pattern. Conventional gravity examples often use compression diagonals; resistance and buckling need analysis.',vierendeel:'Open rectangular bays with rigid moment-resisting joints. This is a frame; its members carry bending and shear as well as axial force.'};
const SOCIAL_GUIDES={sky_bridge:'Two towers share a level bridge. Its deck and support reservations meet both towers at real floor elevations.',sky_plaza:'Three towers share elevated meeting space above a common podium. Each tower keeps its own continuous core.',vertical_campus:'Shared spaces at several heights connect a group of towers. Change their levels to study a vertical campus.',sky_outlook:'Two towers share an upper outlook deck. Access, wind comfort and evacuation remain design questions.'};
let state=clone(PRESETS.babel),saved=[],undoStack=[],redoStack=[],model,viewer,selectedFloor=40,profileAxis='both',viewMode='massing',planTarget='tower',inspection='overview';
let diagramMode='process',diagramResult=null,refocusOnRender=false;
let workspaceView='model',mapAction='choose',viewConesVisible=true,vancouverMap=null,parcelRequestId=0,parcelAbort=null,parcelLookup={status:'idle',key:'',message:''};
const parcelCache=new Map();
let raf=0,gesture=false,gestureTimer=0,customDraft=null,storageAvailable=true,exporting=false;
try{const p=JSON.parse(localStorage.getItem(CURRENT_KEY));if(p?.schema===DEFAULT_STATE.schema)state=normalizeState(p);const o=JSON.parse(localStorage.getItem(OPTIONS_KEY));if(Array.isArray(o))saved=o.filter(x=>x?.state&&typeof x.name==='string').slice(0,20);}catch{}
if(state.siteContext?.mode==='vancouver')workspaceView='map';
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function persist(){try{localStorage.setItem(CURRENT_KEY,JSON.stringify(state));localStorage.setItem(OPTIONS_KEY,JSON.stringify(saved));}catch{storageAvailable=false;}}
function snapshot(){undoStack.push(clone(state));if(undoStack.length>60)undoStack.shift();redoStack=[];updateHistory();}
function beginGesture(){if(!gesture){snapshot();gesture=true;}}
function endGesture(){gesture=false;clearTimeout(gestureTimer);}
function updateHistory(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;}
function mutate(change,{record=true}={}){if(record&&!gesture)snapshot();change(state);state=normalizeState(state);schedule();}
function schedule(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});}
function undo(){if(!undoStack.length)return;cancelParcelLookup();redoStack.push(clone(state));state=undoStack.pop();endGesture();render();}
function redo(){if(!redoStack.length)return;cancelParcelLookup();undoStack.push(clone(state));state=redoStack.pop();endGesture();render();}
function svgElement(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function pathData(points){return points.length?'M'+points.map(p=>p.map(n=>n.toFixed(3)).join(',')).join('L')+'Z':'';}
function drawLoop(svg,points,className,attrs={}){const p=svgElement('path',{d:pathData(points),class:className,...attrs});svg.append(p);return p;}
function svgPoint(svg,event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function planSettings(){return planTarget==='podium'?{shape:state.podiumShape,width:state.podiumWidth,depth:state.podiumDepth,custom:state.podiumCustomPlan}:{shape:state.shape,width:state.width,depth:state.depth,custom:state.customPlan};}
function planKey(axis){return planTarget==='podium'?'podium'+axis[0].toUpperCase()+axis.slice(1):axis;}
function currentPlan(){const p=planSettings();return makePlan(p.shape,p.width,p.depth,p.custom);}
function buildShapeButtons(){
  for(const option of SHAPE_OPTIONS){const button=document.createElement('button');button.className='shape-option';button.dataset.shape=option.id;button.setAttribute('aria-pressed','false');
    const svg=svgElement('svg',{viewBox:'-17 -16 34 32','aria-hidden':'true'});const p=makePlan(option.id,26,23,DEFAULT_STATE.customPlan);drawLoop(svg,p,'');
    const label=document.createElement('span');label.textContent=option.label;button.append(svg,label);
    button.addEventListener('click',()=>{customDraft=null;mutate(s=>{s[planTarget==='podium'?'podiumShape':'shape']=option.id;});if(option.id==='custom')notice('Draw a new outline, or reshape the default polygon.');});$('shape-options').append(button);
  }
  for(const option of STRUCTURE_OPTIONS){const button=document.createElement('button');button.className='structure-option';button.dataset.structure=option.id;button.setAttribute('aria-pressed','false');
    const svg=svgElement('svg',{viewBox:'0 0 24 34','aria-hidden':'true'});svg.append(svgElement('path',{d:'M4 31V3h16v28M4 17h16'}));
    if(option.id==='diagrid')svg.append(svgElement('path',{d:'M4 3l16 14L4 31M20 3L4 17l16 14'}));
    else if(option.id==='perimeter_x')svg.append(svgElement('path',{d:'M4 3l16 28M20 3L4 31'}));
    else svg.append(svgElement('path',{d:'M10 3v28m4-28v28'}));
    const label=document.createElement('span');label.textContent=option.label;button.append(svg,label);
    button.addEventListener('click',()=>{mutate(s=>{s.structure=option.id;});setInspection('overview');setMode('structure');});$('structure-options').append(button);
  }
}
function planHandle(svg,x,y,axis){
  const key=planKey(axis),circle=svgElement('circle',{id:'plan-handle-'+axis,cx:x,cy:y,r:3.3,class:'plan-handle '+(axis==='depth'?'depth':''),tabindex:0,role:'slider','aria-label':(planTarget==='podium'?'Podium ':'Base ')+axis,'aria-valuemin':planTarget==='podium'?(axis==='width'?30:24):18,'aria-valuemax':planTarget==='podium'?(axis==='width'?140:78):(axis==='width'?100:90),'aria-valuenow':state[key]});
  circle.addEventListener('pointerdown',e=>{e.preventDefault();beginGesture();svg.setPointerCapture(e.pointerId);svg.dataset.dragAxis=axis;});
  circle.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const sign=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;mutate(s=>{s[key]+=sign*(e.shiftKey?5:1);});}});
  svg.append(circle);
}
function renderPlan(){
  const svg=$('plan-editor'),settings=planSettings();svg.replaceChildren();svg.setAttribute('viewBox','-82 -55 164 110');
  const siteRect=svgElement('rect',{x:-72.39,y:-39.624,width:144.78,height:79.248,fill:'none',stroke:'#c6cec7','stroke-width':.3,'stroke-dasharray':'1 2'});svg.append(siteRect);
  if(customDraft){
    if(customDraft.length)drawLoop(svg,customDraft.map(p=>[p[0]*settings.width,-p[1]*settings.depth]),'plan-outline',{'stroke-dasharray':'1 1'});
    for(const p of customDraft)svg.append(svgElement('circle',{cx:p[0]*settings.width,cy:-p[1]*settings.depth,r:1.4,fill:'#155c73'}));
  }else{
    const p=currentPlan();drawLoop(svg,p.map(([x,y])=>[x,-y]),'plan-outline');
    const halfW=state.coreWidth/2,halfD=state.coreDepth/2;drawLoop(svg,[[-halfW,-halfD],[halfW,-halfD],[halfW,halfD],[-halfW,halfD]],'core-outline');
    if(planTarget==='podium'&&model.publicSpace?.courtyard?.valid)drawLoop(svg,model.publicSpace.courtyard.polygon.map(([x,y])=>[x,-y]),'',{fill:'#e0e8dd',stroke:'#38705c','stroke-width':.6});
    planHandle(svg,settings.width/2+5,0,'width');planHandle(svg,0,-settings.depth/2-5,'depth');
  }
  $('plan-title').textContent=planTarget==='podium'?'Podium outline':'Starting plate outline';
  $('plan-size').textContent=`${format(settings.width,1)} × ${format(settings.depth,1)} m`;
  $('custom-controls').hidden=settings.shape!=='custom';
  $('draw-plan').hidden=customDraft!==null;$('finish-plan').hidden=customDraft===null;$('cancel-plan').hidden=customDraft===null;
  $('plan-hint').textContent=customDraft?'Click to place the corners of your floor plan.':'Pull the two plan handles to change width and depth.';
}
function renderPlacement(){
  const svg=$('site-map');svg.replaceChildren();drawLoop(svg,model.site.polygon.map(([x,y])=>[x,-y]),'',{fill:'#f1f0eb',stroke:'#9caeaa','stroke-width':.7});
  const boundary=model.site.polygon,px=boundary.map(p=>p[0]),py=boundary.map(p=>p[1]),pad=10;svg.setAttribute('viewBox',`${Math.min(...px)-pad} ${-Math.max(...py)-pad} ${Math.max(...px)-Math.min(...px)+pad*2} ${Math.max(...py)-Math.min(...py)+pad*2}`);
  const pos=state.placement||{x:0,y:0},shift=p=>p.map(point=>{const q=buildingToSitePoint(point,state);return[q[0],-q[1]];});
  const podium=model.floors.find(f=>f.isPodium),tower=model.floors.find(f=>!f.isPodium);
  if(podium)drawLoop(svg,shift(podium.polygon),'site-podium');if(tower)drawLoop(svg,shift(tower.polygon),'site-tower');
  for(const companion of (model.social?.towers||[]).slice(1))if(companion.floors?.[0])drawLoop(svg,shift(companion.floors[0].polygon),'site-tower');
  const handle=svgElement('circle',{id:'placement-handle',cx:pos.x,cy:-pos.y,r:4,class:'site-move-handle',role:'button',tabindex:0,'aria-label':'Move building on site','aria-description':'Arrow keys move the building. Shift moves five metres.'});
  handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const d=e.shiftKey?5:1;mutate(s=>{if(e.key==='ArrowLeft')s.placement.x-=d;if(e.key==='ArrowRight')s.placement.x+=d;if(e.key==='ArrowUp')s.placement.y+=d;if(e.key==='ArrowDown')s.placement.y-=d;});});svg.append(handle);
  $('placement-output').textContent=`X ${format(pos.x,1)} m · Y ${format(pos.y,1)} m`;
}
function applyPreset(key){
  if(!PRESETS[key])return;snapshot();const siteContext=normalizeSiteContext(state.siteContext),placement=clone(state.placement||{x:0,y:0});
  state=normalizeState({...clone(PRESETS[key]),conceptId:key,siteContext,placement});customDraft=null;selectedFloor=40;if(VANCOUVER_STUDIES[key]){$('vancouver-features').open=true;workspaceView='model';}setInspection('overview');render();viewer?.focus();
}
function parcelAlignment(siteContext){
  const context=getSiteContext({siteContext:{...siteContext,mode:'vancouver'}});if(context.boundaryKnown===false)return Number(siteContext.rotation)||0;const polygon=context.polygon;let longest=0,angle=0;
  polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>longest){longest=length;angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;}});return Math.round(((angle+270)%180)-90);
}
function locationKey(location){return location?`${Number(location.longitude).toFixed(7)},${Number(location.latitude).toFixed(7)}`:'';}
function cancelParcelLookup(){parcelAbort?.abort();parcelAbort=null;parcelRequestId++;}
function isCurrentMapLocation(location){return state.siteContext?.mode==='vancouver'&&state.siteContext.siteId==='custom'&&locationKey(state.siteContext.location)===locationKey(location);}
async function loadMapParcel(location){
  cancelParcelLookup();const sequence=parcelRequestId,controller=new AbortController();parcelAbort=controller;const key=locationKey(location);parcelLookup={status:'loading',key,message:'Building placed. Looking up the City parcel…'};renderSiteContext();
  try{const result=await lookupParcel(location,{signal:controller.signal});if(sequence!==parcelRequestId||!isCurrentMapLocation(location))return;
    parcelLookup={status:result.status,key,message:result.message};if(result.status==='matched'&&result.parcel){parcelCache.set(key,clone(result.parcel));state.siteContext.parcel=clone(result.parcel);}render();
  }catch(error){if(sequence!==parcelRequestId||controller.signal.aborted||!isCurrentMapLocation(location))return;parcelLookup={status:'error',key,message:'Parcel lookup unavailable. The building is placed; parcel fit remains unknown. Use Retry parcel lookup to try again.'};renderSiteContext();}
  finally{if(sequence===parcelRequestId)parcelAbort=null;}
}
function chooseMapLocation(location){
  if(!isVancouverMapLocation(location)){notice('Choose a location inside the Vancouver map study area.',true);return;}
  cancelParcelLookup();snapshot();state.siteContext={mode:'vancouver',siteId:'custom',rotation:state.siteContext?.rotation||0,location:{longitude:location.longitude,latitude:location.latitude},parcel:parcelCache.get(locationKey(location))||null};state.placement={x:0,y:0};workspaceView='map';refocusOnRender=true;setInspection('overview');render();if(!state.siteContext.parcel)loadMapParcel(state.siteContext.location);
}
function renderMapWorkspace(){
  const vancouver=state.siteContext?.mode==='vancouver',visible=vancouver&&workspaceView==='map';document.querySelector('.model-panel').classList.toggle('map-active',visible);$('map-workspace').hidden=!visible;
  document.querySelectorAll('[data-workspace]').forEach(b=>{const active=b.dataset.workspace===(visible?'map':'model');b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  document.querySelectorAll('[data-map-action]').forEach(b=>{const active=b.dataset.mapAction===mapAction;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  const context=model.siteContext||getSiteContext(state),position=state.placement||{x:0,y:0};if(vancouver)$('map-location-output').textContent=`${format(context.latitude,5)}° N, ${format(Math.abs(context.longitude),5)}° W · Offset X ${format(position.x,1)} m / Y ${format(position.y,1)} m`;
  $('map-instructions').textContent=mapAction==='choose'?'Click anywhere on the map to place the building. Pan and zoom to explore Vancouver.':'Drag the building marker to move it within the selected site. Focus the marker and use arrow keys for 1 m steps; Shift moves 5 m.';
  if(visible&&!vancouverMap){try{vancouverMap=createVancouverMap($('vancouver-map'),{onPick:chooseMapLocation,onMove:position=>mutate(s=>{s.placement={x:position.x,y:position.y};},{record:false}),onGestureStart:beginGesture,onGestureEnd:endGesture});}catch(error){$('vancouver-map').textContent='The map could not load. Reload to try again; the site shortcuts and 3D model remain available.';}}
  if(vancouverMap){vancouverMap.update(model,state);vancouverMap.setMode(mapAction);vancouverMap.setConesVisible(viewConesVisible);if(visible)vancouverMap.resize();}
  viewer?.setViewConesVisible?.(viewConesVisible);
}
function renderSocialControls(){
  const social=state.social||{},active=!!social.enabled;$('social-controls').hidden=!active;$('concept-note').hidden=!active;
  if(active){$('preset').value=social.typology;$('concept-description').textContent=SOCIAL_GUIDES[social.typology]||SOCIAL_GUIDES.sky_bridge;
    $('social-spacing').value=social.separation;$('social-spacing-output').textContent=format(social.separation)+' m along row';
    $('social-width').value=social.deckWidth;$('social-width-output').textContent=format(social.deckWidth)+' m';
    const levels=social.levels||[.45,.72],actual=[...new Set((model.social?.connectors||[]).map(c=>c.floorIndex))].sort((a,b)=>a-b);
    $('social-level').value=Math.round(levels[0]*100);$('social-level-output').textContent=actual[0]?'Floor '+actual[0]:Math.round(levels[0]*100)+'% of tower';
    $('social-second-control').hidden=levels.length<2;$('social-second-level').value=Math.round((levels[1]||.72)*100);$('social-second-output').textContent=actual[1]?'Floor '+actual[1]:Math.round((levels[1]||.72)*100)+'% of tower';
  }else{const key=state.conceptId||Object.keys(PRESETS).find(k=>PRESETS[k].name===state.name)||'babel';if(PRESETS[key])$('preset').value=key;}
  $('social-metric').hidden=!active;if(active)$('social-metric').textContent=`${model.social?.towers?.length||0} towers · ${format(model.summary.sharedSkyArea||0)} m² shared sky decks`;
}
function renderVancouverFeatures(){
  const v=state.vancouver||{podiumStepback:0,stepDirection:'front',rainCover:false,canopyDepth:2.4,canopyHeight:3.6,gallerySide:'front'},study=VANCOUVER_STUDIES[state.conceptId];
  $('vancouver-study-note').textContent=study?study.description:'Explore the Vancouver starting concepts above, or add these features to your current form.';
  $('podium-retreat').value=v.podiumStepback;$('podium-retreat-output').textContent=format(v.podiumStepback,1)+' m';$('podium-retreat-edge').value=v.stepDirection;
  const paused=state.social?.enabled||state.publicSpace?.enabled&&state.publicSpace.layout==='courtyard'||!state.podiumFloors;
  $('podium-retreat').disabled=!!paused;$('podium-retreat-edge').disabled=!!paused;
  $('podium-retreat-note').textContent=paused?'Podium retreat is paused for tower clusters, circular courtyards, or a model without podium floors. Use a single tower with a plaza or garden-island base to study steps.':'Upper podium floors retreat by this total distance from the chosen edge. Exposed caps reserve terrace space; access and planting still need design.'+(state.publicSpace.layout==='garden_islands'&&model.vancouver?.appliedStepback>0?' The circular courtyard is paused while this garden podium steps.':'');
  $('rain-gallery-enabled').checked=v.rainCover;$('rain-gallery-controls').hidden=!v.rainCover;$('rain-gallery-edge').value=v.gallerySide;
  $('rain-depth').value=v.canopyDepth;$('rain-depth-output').textContent=format(v.canopyDepth,1)+' m';$('rain-height').value=v.canopyHeight;$('rain-height-output').textContent=format(v.canopyHeight,1)+' m';
  const canopy=model.vancouver?.canopy,terraces=model.vancouver?.terraces||[],base=model.floors?.find(f=>!f.isPodium);
  $('vancouver-feature-readout').textContent=(base?format(base.grossArea)+' m² starting tower plate':'')+(terraces.length?' · '+terraces.length+' podium terrace caps':'')+(canopy?' · '+format(canopy.length,1)+' m roof length / '+format(canopy.area,1)+' m² roof cover':'');
}
function populateVancouverSources(){
  const host=$('vancouver-study-sources');for(const source of VANCOUVER_SOURCES){const row=document.createElement('div'),a=document.createElement('a'),p=document.createElement('p');a.href=source.url;a.target='_blank';a.rel='noopener';a.textContent=source.title;p.textContent=source.translation;row.append(a,p);host.append(row);}
}
function renderSiteContext(){
  const context=model.siteContext||getSiteContext(state),vancouver=context.mode==='vancouver';$('vancouver-controls').hidden=!vancouver;
  document.querySelectorAll('[data-site-mode]').forEach(b=>{const active=b.dataset.siteMode===context.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  renderMapWorkspace();if(!vancouver)return;$('vancouver-site').value=context.id;$('site-rotation').value=state.siteContext.rotation;$('site-rotation-output').textContent=format(state.siteContext.rotation)+'°';
  const known=context.boundaryKnown!==false,assessment=model.siteAssessment,readout=$('site-context-readout');readout.replaceChildren();const location=document.createElement('p');location.textContent=`${context.address||context.label} · ${format(context.latitude,5)}° N, ${format(Math.abs(context.longitude),5)}° W · ${known&&Number.isFinite(context.area)?format(context.area)+' m² assessment parcel':'Parcel boundary unknown'}`;
  const cones=document.createElement('p');cones.textContent=assessment?.overlaps?.length?`Plan overlaps: ${assessment.overlaps.map(c=>(c.id?c.id+' · ':'')+(c.label||'')).join(', ')}. A plan overlap does not determine the permitted height.`:'No view-cone plan overlap found in the bundled dataset. Height permission is not determined.';
  const datum=document.createElement('p');datum.textContent='Ground elevation is assumed at Z = 0. View-cone height ceilings, terrain and vertical datum have not been established.';readout.append(location,cones,datum);
  const currentKey=context.id==='custom'?locationKey(state.siteContext.location):'',pending=parcelLookup.key===currentKey&&parcelLookup.status==='loading';
  $('parcel-status').textContent=pending?parcelLookup.message:known?`${context.address||context.label} · ${format(context.area)} m² assessment parcel. ${assessment?.fits?'Building fits the modelled boundary.':'Adjust the building to fit the selected boundary.'}`:parcelLookup.key===currentKey&&parcelLookup.message?parcelLookup.message:'Building placed at the selected map point. Parcel boundary and fit are unknown.';
  $('retry-parcel').hidden=context.id!=='custom'||known||pending;$('align-site').disabled=!known;$('centre-parcel').disabled=!known;
  const sources=$('site-context-sources');sources.replaceChildren();const sourceList=Array.isArray(context.sources)?context.sources:Object.entries(context.sources||{}).flatMap(([key,value])=>typeof value==='string'&&value.startsWith('https://')?[{title:key.replace(/([A-Z])/g,' $1'),url:value}]:value&&typeof value==='object'&&(value.url||value.sourceUrl)?[{title:key.replace(/([A-Z])/g,' $1'),...value}]:[]);for(const source of sourceList){const a=document.createElement('a');a.href=source.url||source.sourceUrl||'';a.target='_blank';a.rel='noopener';a.textContent=source.label||source.title||source.name||'City source';sources.append(a);}const limitation=document.createElement('p');limitation.textContent=context.limits||'Study data only; verify against City records and a survey.';sources.append(limitation);
}

function renderDiagram(){
  diagramResult=diagramMode==='street'?createVancouverSection(model,state,{compact:window.matchMedia('(max-width:580px)').matches}):createModelDiagram(model,state,{mode:diagramMode,compact:window.matchMedia('(max-width:580px)').matches});$('diagram-title').textContent=diagramResult.title;$('diagram-summary').textContent=diagramResult.summary;$('model-diagram').innerHTML=diagramResult.svg;$('diagram-notes').replaceChildren();
  for(const text of diagramResult.notes||[]){const li=document.createElement('li');li.textContent=text;$('diagram-notes').append(li);}
}
function renderTrussDiagram(){
  const svg=$('truss-diagram');svg.replaceChildren();
  const chosen=model.members.find(m=>m.role==='mega_belt'&&m.frameId)||model.members.find(m=>m.role==='terrace_truss'&&m.frameId);
  svg.toggleAttribute('hidden',!chosen);if(!chosen)return;
  const members=model.members.filter(m=>m.frameId===chosen.frameId),points=members.flatMap(m=>[m.start,m.end]),chord=members.find(m=>m.component==='top_chord');
  const dx=chord.end[0]-chord.start[0],dy=chord.end[1]-chord.start[1],length=Math.hypot(dx,dy),axis=[dx/length,dy/length];
  const xs=points.map(p=>p[0]*axis[0]+p[1]*axis[1]),zs=points.map(p=>p[2]),lo=Math.min(...xs),span=Math.max(...xs)-lo,z0=Math.min(...zs),rise=Math.max(...zs)-z0;
  const project=p=>[18+((p[0]*axis[0]+p[1]*axis[1]-lo)/span)*184,64-(p[2]-z0)/rise*48];
  for(const m of members){const a=project(m.start),b=project(m.end);svg.append(svgElement('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#28404d','stroke-width':m.component.includes('chord')?2.4:1.6}));}
  const seen=new Set();for(const p of points){const a=project(p),key=a.map(v=>v.toFixed(3)).join(',');if(seen.has(key))continue;seen.add(key);svg.append(svgElement('circle',{cx:a[0],cy:a[1],r:2.1,fill:'#a84231'}));}
  svg.append(svgElement('text',{x:110,y:82,'text-anchor':'middle',class:'profile-text'},'Selected web · schematic proportions'));
}
function profileX(kind,knot){return kind==='size'?28+((profileAxis==='x'?knot.scaleX:profileAxis==='y'?knot.scaleY:(knot.scaleX+knot.scaleY)/2)-.3)/1.3*98:77+knot.twist/180*48;}
function profileY(t){return 246-t*216;}
function drawProfile(kind){
  const svg=$(kind==='size'?'size-profile':'twist-profile');svg.replaceChildren();
  const axisX=kind==='size'?28:77;
  for(const [t,label]of[[0,'Base'],[.5,'Mid'],[1,'Top']]){
    svg.append(svgElement('line',{x1:28,y1:profileY(t),x2:126,y2:profileY(t),class:'profile-grid'}));
    svg.append(svgElement('text',{x:24,y:profileY(t)+3,'text-anchor':'end',class:'profile-text'},label));
  }
  svg.append(svgElement('line',{x1:axisX,y1:25,x2:axisX,y2:251,class:'profile-axis'}));
  const points=state.profile.map(p=>[profileX(kind,p),profileY(p.t)]);
  if(kind==='size')drawLoop(svg,[[28,246],...points,[28,30]],'profile-fill');
  const path=svgElement('polyline',{points:points.map(p=>p.join(',')).join(' '),class:'profile-line'});svg.append(path);
  state.profile.forEach((p,index)=>{
    const c=svgElement('circle',{id:`profile-${kind}-${index}`,cx:profileX(kind,p),cy:profileY(p.t),r:6,class:'profile-point',tabindex:0,role:'slider','aria-label':`${kind==='size'?'Plate scale':'Twist'} at ${Math.round(p.t*100)} percent height`,'aria-valuenow':kind==='size'?Number((profileAxis==='x'?p.scaleX:profileAxis==='y'?p.scaleY:(p.scaleX+p.scaleY)/2).toFixed(2)):Math.round(p.twist),'aria-valuemin':kind==='size'?.3:-180,'aria-valuemax':kind==='size'?1.6:180});
    c.setAttribute('aria-valuetext',`${kind==='size'?'Scale '+c.getAttribute('aria-valuenow'):Math.round(p.twist)+' degrees'} at ${Math.round(p.t*100)} percent height`);
    c.setAttribute('aria-description','Left and right arrows change the value. Up and down move an intermediate point through height. Shift makes a larger change.');
    c.addEventListener('pointerdown',e=>{e.preventDefault();beginGesture();svg.setPointerCapture(e.pointerId);svg.dataset.dragIndex=String(index);});
    c.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const sign=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;mutate(s=>{const p=s.profile[index];if(['ArrowUp','ArrowDown'].includes(e.key)){if(index>0&&index<s.profile.length-1)p.t=clamp(p.t+sign*(e.shiftKey?.05:.01),s.profile[index-1].t+.025,s.profile[index+1].t-.025);}else if(kind==='twist')p.twist+=sign*(e.shiftKey?10:2);else{if(profileAxis!=='y')p.scaleX+=sign*.025;if(profileAxis!=='x')p.scaleY+=sign*.025;}});}});svg.append(c);
  });
  svg.append(svgElement('text',{x:77,y:269,'text-anchor':'middle',class:'profile-text'},kind==='size'?'Small  ↔  Wide':'−180°    0°    +180°'));
}
function renderFloor(){
  const floor=inspectFloor(model,selectedFloor);const svg=$('floor-plan');svg.replaceChildren();
  if(!floor){$('floor-label').textContent='Plan needs a valid outline';$('floor-info').textContent='Finish a simple closed plan to inspect its floors.';return;}
  $('floor-label').textContent=`Floor ${floor.index} · ${floor.isPodium?'shared podium':state.social?.enabled?'Tower A':'tower'}`;
  const deck=model.landscape.decks?.find(d=>d.floorIndex===floor.index);
  $('floor-info').textContent=`${format(floor.z+state.slabThickness,1)} m · ${format(floor.grossArea)} m² gross · ${format(floor.twist,1)}° twist${deck?' · '+format(deck.externalArea??deck.area)+' m² exterior terrace':''}`;
  const all=[...floor.polygon,...(deck?.polygon||[])];const extent=Math.max(...all.map(p=>Math.abs(p[0])),...all.map(p=>Math.abs(p[1])),10)*1.12;svg.setAttribute('viewBox',`${-extent} ${-extent} ${extent*2} ${extent*2}`);
  if(deck)drawLoop(svg,deck.polygon.map(([x,y])=>[x,-y]),'',{fill:'#d5e1cc',stroke:'#38705c','stroke-width':.7});
  drawLoop(svg,floor.polygon.map(([x,y])=>[x,-y]),'',{fill:'#ead6cb',stroke:'#a84231','stroke-width':.8});
  for(const hole of (floor.holes||[]).slice(1))drawLoop(svg,hole.map(([x,y])=>[x,-y]),'',{fill:'#e0e8dd',stroke:'#38705c','stroke-width':.5});
  drawLoop(svg,model.core.polygon.map(([x,y])=>[x,-y]),'core-outline');
  for(const p of floor.columns)svg.append(svgElement('rect',{x:p[0]-.4,y:-p[1]-.4,width:.8,height:.8,fill:'#28404d'}));
  $('floor-slider').max=state.storeys;$('floor-slider').value=selectedFloor;
}
function selectFloor(index){selectedFloor=clamp(Math.round(index),1,state.storeys);if(inspection==='terrace'&&model.landscape.decks?.length)selectedFloor=model.landscape.decks.reduce((a,b)=>Math.abs(a.floorIndex-selectedFloor)<Math.abs(b.floorIndex-selectedFloor)?a:b).floorIndex;if(inspection==='mega'&&model.megaFloors?.bands?.length)selectedFloor=model.megaFloors.bands.reduce((a,b)=>Math.abs(a.bottomFloorIndex-selectedFloor)<Math.abs(b.bottomFloorIndex-selectedFloor)?a:b).bottomFloorIndex;viewer?.selectFloor(selectedFloor);renderFloor();renderConnection();}
function renderConnection(){
  const readout=$('connection-readout');readout.hidden=inspection==='overview';readout.replaceChildren();if(readout.hidden)return;
  const p=document.createElement('p');
  if(inspection==='terrace'){
    const deck=model.landscape.decks?.find(d=>d.floorIndex===selectedFloor);
    p.textContent=deck?`Floor ${deck.floorIndex}: ${format(deck.thickness,2)} m deck, flush with the floor; ${format(deck.clearWidth,2)} m circulation reservation beside planting. Deck → support and edge beams → core wall → grade. The blue portal reserves same-floor access; door, façade/diagrid clearance and connections still need design.`:'Enable floor terraces to inspect their connection.';
  }else if(inspection==='mega'){
    const band=model.megaFloors?.bands?.find(b=>b.bottomFloorIndex===selectedFloor);
    p.textContent=band?`Outrigger + belt study · floors ${band.bottomFloorIndex}–${band.topFloorIndex}: ${format(band.zTop-band.zBottom,1)} m deep ${state.trussPattern==='vierendeel'?'Vierendeel frame':state.trussPattern+' truss'} band. Core → outriggers → continuous outer columns; the belt joins those same column nodes. Service-band area remains in gross floor totals. Reserve these levels for structure and services, then review programme and FSR exclusions. Capacity, column shortening, joints and construction sequence require analysis.`:'Enable mega floors to inspect a core–outrigger–belt band.';
  }else{
    p.textContent=model.publicSpace?.enabled?`Podium slab underside ${format(state.publicSpace.lift,1)} m above grade; ${format(model.publicSpace.minimumClearHeight,1)} m below the beam reservations. Pilotis reserve support for the podium floors. The courtyard and garden arrangement is a public-space study; transfer, entrances, routes and capacity need design.`:'Enable “Open public space beneath” to raise the occupied podium floors and study the ground.';
  }
  readout.append(p);
}
function setInspection(next){
  if(next==='terrace'&&!model.landscape.enabled){notice('Enable floor terraces before inspecting the connection.',true);return;}
  if(next==='mega'&&!model.megaFloors?.bands?.length){notice('Enable mega floors and resolve their geometry before inspecting a band.',true);return;}
  if(next==='ground'&&!state.publicSpace.enabled){mutate(s=>{s.publicSpace.enabled=true;});}
  viewer?.setTerraceDetail?.(false);viewer?.setGroundDetail?.(false);viewer?.setMegaDetail?.(false);inspection=next;
  if(next==='terrace'){const selected=viewer?.setTerraceDetail?.(true);if(selected)selectedFloor=selected;}
  if(next==='ground'){selectedFloor=1;viewer?.setGroundDetail?.(true);}
  if(next==='mega'){const selected=viewer?.setMegaDetail?.(true);if(selected)selectedFloor=selected;}
  document.querySelectorAll('[data-inspection]').forEach(b=>{const active=b.dataset.inspection===next;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});renderFloor();renderConnection();
}
function renderChecks(){
  $('checks').replaceChildren();
  const ordered=[...model.checks].sort((a,b)=>({block:0,review:1,pass:2}[a.status]-{block:0,review:1,pass:2}[b.status]));
  for(const check of ordered){const div=document.createElement('div');div.className='check '+check.status;const label=document.createElement('div');label.className='check-label';label.textContent=(check.status==='block'?'Resolve · ':check.status==='review'?'Review · ':'Fits · ')+check.title;
    const p=document.createElement('p');p.textContent=check.message;div.append(label,p);
    if(check.limits){const d=document.createElement('details');d.className='check-limits';const s=document.createElement('summary');s.textContent='Scope';const p=document.createElement('p');p.textContent=check.limits;d.append(s,p);div.append(d);}
    if(check.sourceUrl){const a=document.createElement('a');a.href=check.sourceUrl;a.target='_blank';a.rel='noopener';a.textContent='Source clause';a.className='check-source';div.append(a);}
    $('checks').append(div);
  }
}
function renderSaved(){
  $('saved-options').replaceChildren();if(!saved.length){const p=document.createElement('p');p.className='hint';p.textContent='Save a variation to return to it or compare its form.';$('saved-options').append(p);return;}
  saved.forEach((option,index)=>{const div=document.createElement('div');div.className='saved-option';const load=document.createElement('button');load.textContent=option.name;load.title='Load this saved option';load.addEventListener('click',()=>{snapshot();state=normalizeState(option.state);customDraft=null;render();notice('Loaded '+option.name+'.');});const remove=document.createElement('button');remove.className='remove-option';remove.textContent='Remove';remove.setAttribute('aria-label','Remove saved option '+option.name);remove.addEventListener('click',()=>{saved.splice(index,1);persist();renderSaved();});div.append(load,remove);$('saved-options').append(div);});
}
function render(){
  const focusedHandle=document.activeElement?.matches('.plan-handle,.profile-point,.site-move-handle')?document.activeElement.id:null;
  state.siteContext=normalizeSiteContext(state.siteContext);if(state.siteContext.siteId==='custom'&&!state.siteContext.parcel&&parcelCache.has(locationKey(state.siteContext.location)))state.siteContext.parcel=clone(parcelCache.get(locationKey(state.siteContext.location)));model=applySiteContext(buildModel(state),state);state=model.state;selectedFloor=clamp(selectedFloor,1,state.storeys);
  if(inspection==='terrace'&&model.landscape.decks?.length)selectedFloor=model.landscape.decks.reduce((a,b)=>Math.abs(a.floorIndex-selectedFloor)<Math.abs(b.floorIndex-selectedFloor)?a:b).floorIndex;
  if(inspection==='terrace'&&!model.landscape.enabled)setInspection('overview');
  if(inspection==='mega'&&model.megaFloors?.bands?.length)selectedFloor=model.megaFloors.bands.reduce((a,b)=>Math.abs(a.bottomFloorIndex-selectedFloor)<Math.abs(b.bottomFloorIndex-selectedFloor)?a:b).bottomFloorIndex;
  if(inspection==='mega'&&!model.megaFloors?.bands?.length)setInspection('overview');
  if(document.activeElement!==$('option-name'))$('option-name').value=state.name;
  $('width').value=planSettings().width;$('depth').value=planSettings().depth;for(const id of['height','storeys'])$(id).value=state[id];
  $('width').min=planTarget==='podium'?30:18;$('width').max=planTarget==='podium'?140:100;$('depth').min=planTarget==='podium'?24:18;$('depth').max=planTarget==='podium'?78:90;
  $('core-width').value=state.coreWidth;$('core-depth').value=state.coreDepth;
  if($('nonres-floors'))$('nonres-floors').value=state.nonresidentialFloors;
  $('height-range').value=state.height;$('height-output').textContent=format(state.height)+' m';
  $('module-range').value=state.diagridModule;$('module-output').textContent=state.diagridModule+' storeys';$('module-control').hidden=state.structure==='core_columns';
  const clusterActive=!!state.social?.enabled,mega=state.megaFloors||{enabled:false,bands:2,depthStoreys:2},trussed=!clusterActive&&state.landscape.enabled&&state.landscape.supportType==='truss';
  $('mega-enabled').disabled=clusterActive;$('landscape-enabled').disabled=clusterActive;$('public-layout').disabled=clusterActive;$('cluster-system-note').hidden=!clusterActive;
  $('truss-pattern-control').hidden=clusterActive||(!mega.enabled&&!trussed);
  $('mega-enabled').checked=mega.enabled&&!clusterActive;$('mega-controls').hidden=!mega.enabled||clusterActive;$('mega-bands-range').value=mega.bands;$('mega-bands-output').textContent=mega.bands+' bands';$('mega-depth-range').value=mega.depthStoreys;$('mega-depth-output').textContent=mega.depthStoreys+' storeys';
  $('truss-pattern').value=state.trussPattern||'warren';$('truss-pattern').disabled=!mega.enabled&&!trussed;
  $('truss-guide').textContent=mega.enabled||trussed?(TRUSS_GUIDES[state.trussPattern||'warren']+' This pattern applies to active terrace trusses and mega-floor bands.'):'Add mega floors or choose trussed terrace supports to compare patterns.';
  document.querySelector('[data-inspection="mega"]').disabled=!model.megaFloors?.bands?.length;
  $('terrace-support-type').value=state.landscape.supportType||'beam';$('terrace-truss-depth-control').hidden=!trussed;$('terrace-truss-depth-range').value=state.landscape.trussDepth||1.2;$('terrace-truss-depth-output').textContent=format(state.landscape.trussDepth||1.2,1)+' m';
  $('landscape-enabled').checked=state.landscape.enabled&&!clusterActive;$('landscape-controls').hidden=!state.landscape.enabled||clusterActive;document.querySelector('[data-inspection="terrace"]').disabled=!model.landscape.enabled;document.querySelector('[data-inspection="ground"]').disabled=state.podiumFloors===0;
  $('terrace-range').value=state.landscape.width;$('terrace-output').textContent=format(state.landscape.width,1)+' m';
  $('turns-range').value=state.landscape.turns;$('turns-output').textContent=format(state.landscape.turns,2)+' turns';
  $('terrace-span-range').value=state.landscape.span;$('terrace-span-output').textContent=format(state.landscape.span)+'°';
  $('terrace-step-range').value=state.landscape.stepFloors;$('terrace-step-output').textContent=state.landscape.stepFloors+' floors';
  $('deck-thickness-range').value=state.landscape.thickness;$('deck-thickness-output').textContent=format(state.landscape.thickness,2)+' m';
  $('podium-floors-range').value=state.podiumFloors;$('podium-floors-output').textContent=state.podiumFloors+' storeys';
  $('public-enabled').checked=state.publicSpace.enabled;$('public-controls').hidden=!state.publicSpace.enabled;$('public-layout').value=clusterActive?'open_plaza':state.publicSpace.layout;
  $('ground-height-range').value=state.publicSpace.lift;$('ground-height-output').textContent=format(state.publicSpace.lift,1)+' m';
  $('court-radius-range').value=state.publicSpace.courtyardRadius;$('court-radius-output').textContent=format(state.publicSpace.courtyardRadius,1)+' m';$('court-control').hidden=clusterActive||state.publicSpace.layout==='open_plaza'||state.publicSpace.layout==='garden_islands'&&model.vancouver?.appliedStepback>0;
  $('public-layout').querySelector('[value="garden_islands"]').textContent=state.publicSpace.layout==='garden_islands'&&model.vancouver?.appliedStepback>0?'Garden islands · stepped podium':'Courtyard & garden islands';
  document.querySelectorAll('[data-shape]').forEach(b=>{const active=b.dataset.shape===planSettings().shape;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  document.querySelectorAll('[data-structure]').forEach(b=>{const active=b.dataset.structure===state.structure;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  renderPlan();renderPlacement();renderSiteContext();renderSocialControls();renderVancouverFeatures();renderTrussDiagram();drawProfile('size');drawProfile('twist');renderFloor();renderConnection();renderChecks();renderDiagram();updateHistory();
  viewer?.update(model,{...state,selectedFloor});
  if(refocusOnRender){viewer?.focus();refocusOnRender=false;}
  $('height-metric').textContent=`${format(model.summary.height)} m · ${state.storeys} storeys${state.social?.enabled?' per tower':''}`;
  $('gfa-metric').textContent=`${format(model.summary.gfa)} m² gross floors`;
  $('footprint-metric').textContent=`${format(model.summary.roofArea||0)} m² roof plate`;
  const blocked=model.checks.filter(c=>c.status==='block');$('export-rhino').disabled=exporting||!!blocked.length;
  $('export-rhino').title=blocked.length?'Resolve the blocked geometry checks before exporting.':state.siteContext.mode==='vancouver'?'Download a native .3dm in the Vista Vancouver coordinate frame.':'Download a native .3dm in the source model coordinates.';
  notice(blocked.length?blocked[0].message:`${state.name} · drag the plan, profile points or roof handles to shape your tower.${storageAvailable?'':' Browser storage unavailable; download JSON to keep your work.'}`,!!blocked.length);
  persist();
  if(focusedHandle)$(focusedHandle)?.focus({preventScroll:true});
  window.__formStudio={getState:()=>clone(state),getModel:()=>model,setState:v=>{snapshot();state=normalizeState(v);render();},viewer};
}
function setMode(mode){viewMode=mode;viewer?.setMode(mode);document.querySelectorAll('[data-mode]').forEach(b=>{const a=b.dataset.mode===mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',a);});}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function bind(){
  populateVancouverSources();
  if(VANCOUVER_STUDIES[state.conceptId])$('vancouver-features').open=true;
  $('rain-gallery-enabled').addEventListener('change',e=>mutate(s=>{s.vancouver.rainCover=e.target.checked;}));
  for(const[id,key]of[['podium-retreat-edge','stepDirection'],['rain-gallery-edge','gallerySide']])$(id).addEventListener('change',e=>mutate(s=>{s.vancouver[key]=e.target.value;}));
  for(const[id,key]of[['podium-retreat','podiumStepback'],['rain-depth','canopyDepth'],['rain-height','canopyHeight']]){$(id).addEventListener('pointerdown',beginGesture);$(id).addEventListener('input',e=>mutate(s=>{s.vancouver[key]=Number(e.target.value);},{record:!gesture}));$(id).addEventListener('change',endGesture);}
  $('show-street-section').addEventListener('click',()=>{$('model-explanation').open=true;document.querySelector('[data-diagram="street"]').click();$('model-explanation').scrollIntoView({behavior:'auto',block:'start'});});
  $('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
  $('preset').addEventListener('change',e=>applyPreset(e.target.value));
  for(const option of SITE_OPTIONS){const node=document.createElement('option');node.value=option.id;node.textContent=option.label+' · '+option.address;$('vancouver-site').append(node);}
  document.querySelectorAll('[data-site-mode]').forEach(b=>b.addEventListener('click',()=>{cancelParcelLookup();refocusOnRender=true;workspaceView=b.dataset.siteMode==='vancouver'?'map':'model';setInspection('overview');mutate(s=>{s.siteContext={...normalizeSiteContext(s.siteContext),mode:b.dataset.siteMode};s.siteContext.rotation=b.dataset.siteMode==='competition'?0:parcelAlignment(s.siteContext);s.placement={x:0,y:0};});}));
  $('vancouver-site').addEventListener('change',e=>{if(e.target.value==='custom')return;cancelParcelLookup();refocusOnRender=true;mutate(s=>{s.siteContext=normalizeSiteContext({mode:'vancouver',siteId:e.target.value,rotation:0});s.siteContext.rotation=parcelAlignment(s.siteContext);s.placement={x:0,y:0};});});
  document.querySelectorAll('[data-workspace]').forEach(b=>b.addEventListener('click',()=>{workspaceView=b.dataset.workspace;renderMapWorkspace();if(workspaceView==='model')viewer?.setCamera('perspective');}));
  document.querySelectorAll('[data-map-action]').forEach(b=>b.addEventListener('click',()=>{mapAction=b.dataset.mapAction;renderMapWorkspace();}));
  $('view-cones-visible').addEventListener('change',e=>{viewConesVisible=e.target.checked;vancouverMap?.setConesVisible(viewConesVisible);viewer?.setViewConesVisible?.(viewConesVisible);});
  $('place-map-centre').addEventListener('click',()=>{const location=vancouverMap?.getCenter();if(location)chooseMapLocation(location);});
  $('map-city').addEventListener('click',()=>vancouverMap?.showCity());$('map-frame').addEventListener('click',()=>vancouverMap?.focusSelection());
  $('retry-parcel').addEventListener('click',()=>{if(state.siteContext?.siteId==='custom')loadMapParcel(state.siteContext.location);});
  $('centre-parcel').addEventListener('click',()=>{const context=getSiteContext(state);if(context.boundaryKnown===false)return;let crossSum=0,cx=0,cy=0;context.polygon.forEach((a,i)=>{const b=context.polygon[(i+1)%context.polygon.length],cross=a[0]*b[1]-b[0]*a[1];crossSum+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;});if(Math.abs(crossSum)>1e-8)mutate(s=>{s.placement={x:cx/(3*crossSum),y:cy/(3*crossSum)};});});
  $('align-site').addEventListener('click',()=>mutate(s=>{s.siteContext.rotation=parcelAlignment(s.siteContext);}));
  for(const[id,change]of[['social-spacing',(s,v)=>s.social.separation=v],['social-width',(s,v)=>s.social.deckWidth=v],['social-level',(s,v)=>{s.social.levels[0]=s.social.levels.length>1?Math.min(v/100,(s.social.levels[1]||.72)-.05):v/100;}],['social-second-level',(s,v)=>s.social.levels[1]=Math.max(v/100,s.social.levels[0]+.05)],['site-rotation',(s,v)=>s.siteContext.rotation=v]]){
    $(id).addEventListener('pointerdown',beginGesture);$(id).addEventListener('input',e=>mutate(s=>change(s,Number(e.target.value)),{record:!gesture}));$(id).addEventListener('change',endGesture);
  }
  document.querySelectorAll('[data-diagram]').forEach(b=>b.addEventListener('click',()=>{diagramMode=b.dataset.diagram;document.querySelectorAll('[data-diagram]').forEach(n=>{const active=n===b;n.classList.toggle('active',active);n.setAttribute('aria-pressed',active);});renderDiagram();}));
  $('download-diagram').addEventListener('click',()=>{renderDiagram();downloadBlob(new Blob([diagramResult.svg],{type:'image/svg+xml'}),'Form-Studio-'+diagramMode+'-diagram.svg');notice('Saved the diagram for the current model.');});
  window.matchMedia('(max-width:580px)').addEventListener('change',()=>{if(model)renderDiagram();});
  document.querySelectorAll('[data-plan-target]').forEach(b=>b.addEventListener('click',()=>{planTarget=b.dataset.planTarget;customDraft=null;document.querySelectorAll('[data-plan-target]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',active);});render();}));
  $('option-name').addEventListener('input',e=>{beginGesture();mutate(s=>{s.name=e.target.value||'Untitled tower';},{record:false});});
  $('option-name').addEventListener('blur',endGesture);
  for(const [id,key]of[['width','width'],['depth','depth'],['height','height'],['storeys','storeys'],['core-width','coreWidth'],['core-depth','coreDepth'],['nonres-floors','nonresidentialFloors']]){const input=$(id);if(input)input.addEventListener('change',e=>mutate(s=>{s[id==='width'||id==='depth'?planKey(id):key]=Number(e.target.value);}));}
  for(const[id,change]of[['height-range',(s,v)=>s.height=v],['module-range',(s,v)=>s.diagridModule=v],['terrace-range',(s,v)=>s.landscape.width=v],['turns-range',(s,v)=>s.landscape.turns=v],['terrace-span-range',(s,v)=>s.landscape.span=v],['terrace-step-range',(s,v)=>s.landscape.stepFloors=v],['deck-thickness-range',(s,v)=>s.landscape.thickness=v],['podium-floors-range',(s,v)=>s.podiumFloors=v],['ground-height-range',(s,v)=>s.publicSpace.lift=v],['court-radius-range',(s,v)=>s.publicSpace.courtyardRadius=v],['mega-bands-range',(s,v)=>s.megaFloors.bands=v],['mega-depth-range',(s,v)=>s.megaFloors.depthStoreys=v],['terrace-truss-depth-range',(s,v)=>s.landscape.trussDepth=v]]){
    $(id).addEventListener('pointerdown',beginGesture);$(id).addEventListener('input',e=>mutate(s=>change(s,Number(e.target.value)),{record:!gesture}));$(id).addEventListener('change',endGesture);
  }
  $('landscape-enabled').addEventListener('change',e=>mutate(s=>{s.landscape.enabled=e.target.checked;}));
  $('public-enabled').addEventListener('change',e=>mutate(s=>{s.publicSpace.enabled=e.target.checked;}));$('public-layout').addEventListener('change',e=>mutate(s=>{s.publicSpace.layout=e.target.value;}));
  $('mega-enabled').addEventListener('change',e=>{mutate(s=>{s.megaFloors.enabled=e.target.checked;});setInspection('overview');setMode('structure');});
  $('terrace-support-type').addEventListener('change',e=>mutate(s=>{s.landscape.supportType=e.target.value;}));$('truss-pattern').addEventListener('change',e=>mutate(s=>{s.trussPattern=e.target.value;}));
  document.querySelectorAll('[data-inspection]').forEach(b=>b.addEventListener('click',()=>setInspection(b.dataset.inspection)));
  $('placement-enabled').addEventListener('change',e=>{$('placement-controls').hidden=!e.target.checked;if(e.target.checked){setInspection('overview');viewer?.setCamera('top');}});
  $('reset-placement').addEventListener('click',()=>mutate(s=>{s.placement={x:0,y:0};}));
  $('site-map').addEventListener('pointerdown',e=>{if(!$('placement-enabled').checked)return;e.preventDefault();beginGesture();const svg=$('site-map'),p=svgPoint(svg,e);svg.setPointerCapture(e.pointerId);svg.dataset.dragOffsetX=p.x-state.placement.x;svg.dataset.dragOffsetY=p.y+state.placement.y;});
  $('site-map').addEventListener('pointermove',e=>{const svg=$('site-map');if(svg.dataset.dragOffsetX===undefined)return;e.preventDefault();const p=svgPoint(svg,e);mutate(s=>{s.placement.x=p.x-Number(svg.dataset.dragOffsetX);s.placement.y=-p.y+Number(svg.dataset.dragOffsetY);},{record:false});});
  for(const event of['pointerup','pointercancel'])$('site-map').addEventListener(event,()=>{delete $('site-map').dataset.dragOffsetX;delete $('site-map').dataset.dragOffsetY;endGesture();});
  document.querySelectorAll('[data-profile-axis]').forEach(b=>b.addEventListener('click',()=>{profileAxis=b.dataset.profileAxis;document.querySelectorAll('[data-profile-axis]').forEach(x=>{const a=x===b;x.classList.toggle('active',a);x.setAttribute('aria-pressed',a);});drawProfile('size');}));
  $('add-profile').addEventListener('click',()=>mutate(s=>{if(s.profile.length>=8){notice('Use up to eight profile points.');return;}let gap=0,index=0;for(let i=0;i<s.profile.length-1;i++){const d=s.profile[i+1].t-s.profile[i].t;if(d>gap){gap=d;index=i;}}const t=(s.profile[index].t+s.profile[index+1].t)/2;s.profile.push(sampleProfile(s.profile,t));}));
  $('plan-editor').addEventListener('pointermove',e=>{const svg=$('plan-editor'),axis=svg.dataset.dragAxis;if(!axis)return;e.preventDefault();const p=svgPoint(svg,e);mutate(s=>{s[planKey(axis)]=axis==='width'?2*Math.max(9,p.x-5):2*Math.max(9,-p.y-5);},{record:false});});
  $('plan-editor').addEventListener('pointerup',e=>{delete $('plan-editor').dataset.dragAxis;endGesture();});
  $('plan-editor').addEventListener('pointercancel',()=>{delete $('plan-editor').dataset.dragAxis;endGesture();});
  $('plan-editor').addEventListener('click',e=>{if(customDraft===null)return;const p=svgPoint($('plan-editor'),e),settings=planSettings();if(customDraft.length>=32){notice('Use up to 32 plan corners.',true);return;}customDraft.push([p.x/settings.width,-p.y/settings.depth]);renderPlan();});
  $('draw-plan').addEventListener('click',()=>{customDraft=[];renderPlan();notice('Click to place plan corners. Finish with Use this outline.');});
  $('cancel-plan').addEventListener('click',()=>{customDraft=null;renderPlan();notice('Returned to the accepted plan.');});
  $('finish-plan').addEventListener('click',()=>{const test=validatePlan(customDraft);if(!test.valid){notice(test.message,true);return;}const points=clone(customDraft);customDraft=null;mutate(s=>{s[planTarget==='podium'?'podiumShape':'shape']='custom';s[planTarget==='podium'?'podiumCustomPlan':'customPlan']=points;});});
  for(const[kind,id]of[['size','size-profile'],['twist','twist-profile']]){
    const svg=$(id);svg.addEventListener('pointermove',e=>{if(svg.dataset.dragIndex===undefined)return;e.preventDefault();const index=Number(svg.dataset.dragIndex),p=svgPoint(svg,e);
      mutate(s=>{const knot=s.profile[index];if(kind==='size'){const scale=clamp(.3+(p.x-28)/98*1.3,.3,1.6);if(profileAxis!=='y')knot.scaleX=scale;if(profileAxis!=='x')knot.scaleY=scale;}else knot.twist=clamp((p.x-77)/48*180,-180,180);
        if(index>0&&index<s.profile.length-1)knot.t=clamp((246-p.y)/216,s.profile[index-1].t+.025,s.profile[index+1].t-.025);
      },{record:false});
    });
    for(const event of['pointerup','pointercancel'])svg.addEventListener(event,()=>{delete svg.dataset.dragIndex;endGesture();});
  }
  window.addEventListener('pointerup',endGesture);
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>viewer?.setCamera(b.dataset.camera)));
  $('focus').addEventListener('click',()=>viewer?.focus());$('context-visible').addEventListener('change',e=>viewer?.setContextVisible(e.target.checked));
  $('floor-slider').addEventListener('input',e=>selectFloor(Number(e.target.value)));
  $('save-option').addEventListener('click',()=>{if(saved.length>=20){notice('Remove an option before adding more; the browser stores up to 20.',true);return;}saved.push({id:crypto.randomUUID(),name:state.name,state:clone(state),savedAt:new Date().toISOString()});persist();renderSaved();notice('Saved '+state.name+' on this browser.');});
  $('download-json').addEventListener('click',()=>downloadBlob(new Blob([serializeDesign(state)],{type:'application/json'}),'Vancouver-Tall-'+state.name.replace(/[^a-z0-9]+/gi,'-')+'.json'));
  $('import-button').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1000000)throw new Error('Choose a design JSON smaller than 1 MB.');const data=JSON.parse(await file.text());const candidate=data.state||data;if(candidate.schema&&candidate.schema!==DEFAULT_STATE.schema)throw new Error('This file is not a Form Studio design.');if(!Array.isArray(candidate.profile)||!candidate.shape)throw new Error('The design JSON needs a plan shape and height profile.');snapshot();state=normalizeState(candidate);customDraft=null;render();notice('Imported '+file.name+'.');}catch(error){notice(error.message,true);}finally{e.target.value='';}});
  $('capture').addEventListener('click',()=>{try{const url=viewer?.capturePng();if(!url){notice('The 3D canvas is not available.',true);return;}const encoded=url.split(',')[1],bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));downloadBlob(new Blob([bytes],{type:'image/png'}),'Vancouver-Tall-Form.png');notice('Saved the current 3D drawing.');}catch(error){notice('Image capture failed: '+error.message,true);}});
  $('export-rhino').addEventListener('click',async()=>{if(exporting)return;exporting=true;const button=$('export-rhino');button.disabled=true;button.textContent='Preparing .3dm…';notice('Building native Rhino solids from the current geometry…');try{const result=await downloadRhino(model);notice(`Exported ${result.fileName}. ${state.siteContext.mode==='vancouver'?'Vista Vancouver XY coordinates; Z = 0 is assumed ground.':'It overlays the supplied competition site in Rhino.'} City context is not included.`);}catch(error){notice(error.message,true);}finally{exporting=false;button.textContent='Export Rhino';button.disabled=model.checks.some(c=>c.status==='block');}});
  $('help-toggle').addEventListener('click',()=>$('help-dialog').showModal());$('help-close').addEventListener('click',()=>$('help-dialog').close());
  document.addEventListener('keydown',e=>{if(/input|textarea|select/i.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}});
}
async function references(){
  try{const data=await fetch('data/references.json').then(r=>r.json());const c=$('references');c.replaceChildren();for(const source of data.sources){const div=document.createElement('div');const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener';a.textContent=source.title;const p=document.createElement('p');p.textContent=Array.isArray(source.verifiedFacts)?source.verifiedFacts.join(' '):String(source.verifiedFacts||source.modellingUse||'');const limits=document.createElement('p');limits.textContent=Array.isArray(source.limitations)?source.limitations.join(' '):String(source.limitations||'');div.append(a,p,limits);c.append(div);}const p=document.createElement('p');p.textContent='The planted outer spiral and diagonal frame are our design interpretations. The cited references do not establish their structural capacity or accessibility.';c.append(p);}catch{$('references').textContent='Reference register unavailable. The model remains preliminary.';}
}
buildShapeButtons();bind();renderSaved();
try{
  viewer=createScene($('scene'),{onSelectFloor:selectFloor,onHandleChange:({type,value})=>{beginGesture();clearTimeout(gestureTimer);gestureTimer=setTimeout(endGesture,300);mutate(s=>{if(type==='height')s.height=value;else{const p=s.profile.at(-1);if(type==='topScaleX')p.scaleX=value;if(type==='topScaleY')p.scaleY=value;if(type==='topTwist')p.twist=value;}},{record:false});}});
  $('scene').querySelector('.loading-model')?.remove();
}catch(error){$('scene').textContent='3D is unavailable on this device. Plan and profile editing still work; enable WebGL to inspect the tower.';notice(error.message,true);}
render();references();
