import * as THREE from 'three';
import type { DropoutVisual } from './power-dropout';

type AlarmVisual={
  level:number;
  pulse:number;
  wander:number;
  intensity:number;
  reflection:number;
};

/**
 * Independent red emergency circuit plus low-energy reflected spill.
 * The offset fixtures make the slow alarm breath travel across the pressure cell
 * instead of reading as a flat full-screen colour change.
 */
export class CabinEmergencyLights {
  private readonly group=new THREE.Group();
  private readonly direct:THREE.PointLight[]=[];
  private readonly bounce:THREE.PointLight[]=[];
  private readonly lenses:THREE.MeshStandardMaterial[]=[];
  private readonly materials:THREE.Material[]=[];
  private readonly geometries:THREE.BufferGeometry[]=[];
  private readonly directHeat=[0,0,0];
  private readonly bounceHeat=[0,0,0];
  private readonly lensHeat=[0,0,0];

  constructor(scene:THREE.Scene,steel:THREE.Material){
    const positions=[
      new THREE.Vector3(-.78,1.77,-1.08),
      new THREE.Vector3(.78,1.77,.82),
      new THREE.Vector3(0,1.91,1.72),
    ];
    for(const [i,position] of positions.entries()){
      const light=new THREE.PointLight(i===2?0xff3a18:0xff190d,0,4.2,2);
      light.position.copy(position);
      this.direct.push(light);this.group.add(light);

      const housingGeo=new THREE.BoxGeometry(.24,.075,.15);
      const housing=new THREE.Mesh(housingGeo,steel);
      housing.position.copy(position);housing.position.y+=.09;
      housing.castShadow=housing.receiveShadow=true;
      this.geometries.push(housingGeo);this.group.add(housing);

      const lensMaterial=new THREE.MeshStandardMaterial({
        color:0x250301,emissive:i===2?0xff421c:0xff1609,
        emissiveIntensity:0,roughness:.28,metalness:.08,
      });
      const lensGeo=new THREE.BoxGeometry(.17,.057,.105);
      const lens=new THREE.Mesh(lensGeo,lensMaterial);
      lens.position.copy(position);
      this.lenses.push(lensMaterial);this.materials.push(lensMaterial);
      this.geometries.push(lensGeo);this.group.add(lens);
    }

    // Weak, broad red returns from wet floor and side shell. These are not
    // additional beacons; they only sell reflected light in the small volume.
    for(const [position,colour] of [
      [new THREE.Vector3(0,.16,-.35),0x8f0904],
      [new THREE.Vector3(-1.02,.82,.25),0x6f0804],
      [new THREE.Vector3(1.02,.98,-.30),0x6f0804],
    ] as const){
      const light=new THREE.PointLight(colour,0,3.1,1.35);
      light.position.copy(position);this.bounce.push(light);this.group.add(light);
    }
    scene.add(this.group);
  }

  update(blackout:boolean,dropout:DropoutVisual,alarm:AlarmVisual,time:number,dt:number):void {
    const outage=blackout?1:dropout.emergency;
    const alarmStrength=alarm.level?alarm.intensity:0;
    const base=Math.max(outage*2.8,alarmStrength);
    // Persistent blackout has transformer wander rather than a clean sine.
    const outageDrift=.92+.045*Math.sin(time*.67)+.025*Math.sin(time*.239+1.8)+.01*Math.sin(time*.097);
    const outageBreath=blackout?outageDrift:1;
    const weights=[.86,1,.72];
    const step=Math.min(.1,Math.max(0,dt));
    const thermal=[.28,.48,.79];
    this.direct.forEach((light,i)=>{
      const localWander=alarm.level
        ?1+alarm.wander*(.035+i*.012)+.035*Math.sin(time*(.127+i*.019)+i*2.1)
        :1;
      const target=base*weights[i]!*outageBreath*localWander;
      const alpha=1-Math.exp(-step/thermal[i]!);
      this.directHeat[i]!+=(target-this.directHeat[i]!)*alpha;
      light.intensity=this.directHeat[i]!;
    });
    const reflected=Math.max(outage*.62,alarm.reflection);
    this.bounce.forEach((light,i)=>{
      const drift=.91+.055*Math.sin(time*(.43+i*.037)+i*.9)+.035*Math.sin(time*.137+i*1.7);
      const target=reflected*drift;
      const alpha=1-Math.exp(-step/(.68+i*.17));
      this.bounceHeat[i]!+=(target-this.bounceHeat[i]!)*alpha;
      light.intensity=this.bounceHeat[i]!;
    });
    const lens=Math.max(outage*.72,alarm.level?.28+alarm.pulse*.72:0);
    this.lenses.forEach((material,i)=>{
      const target=lens*(i===2?.72:1);
      const alpha=1-Math.exp(-step/(.18+i*.13));
      this.lensHeat[i]!+=(target-this.lensHeat[i]!)*alpha;
      material.emissiveIntensity=this.lensHeat[i]!;
    });
  }

  dispose():void {
    this.group.removeFromParent();
    this.geometries.forEach(geometry=>geometry.dispose());
    this.materials.forEach(material=>material.dispose());
  }
}
