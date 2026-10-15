import * as T from 'three';
import type {AuthoredSite} from '../../sim/authored-site';
import type {PodRun} from '../../sim/run';

/** Nonblocking berth marking. No additions to structural or optical collision channels. */
export function markContainmentBerth(site:AuthoredSite,run:PodRun):void {
 if(!run.containment)return;
 const world=(site as AuthoredSite&{world?:{root:T.Group}}).world;if(!world)return;
 const [x,y,z]=run.containment.route.entry;
 const root=new T.Group();root.name='containment-service-berth';root.position.set(x,y,z);
 const steel=new T.MeshStandardMaterial({color:0x343b35,roughness:.8,metalness:.45});
 const amber=new T.MeshStandardMaterial({color:0x70694a,emissive:0x777147,emissiveIntensity:.3,roughness:.7});
 const plate=new T.Mesh(new T.BoxGeometry(1.25,.7,.06),steel);plate.position.set(3.8,1.0,0);plate.rotation.y=-Math.PI/2;root.add(plate);
 const c=document.createElement('canvas');c.width=512;c.height=256;
 const ctx=c.getContext('2d')!;ctx.fillStyle='#131b16';ctx.fillRect(0,0,512,256);ctx.fillStyle='#adb890';ctx.font='32px monospace';ctx.fillText('VANCE / SERVICE',22,54);ctx.font='38px sans-serif';ctx.fillText('派遣泊位',22,119);ctx.font='25px sans-serif';ctx.fillText('停艇 → 分析台 → 泊位补给',22,181);ctx.fillText('BATTERY / O₂ / SCRUBBER',22,228);
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
 const face=new T.Mesh(new T.PlaneGeometry(1.2,.6),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));face.position.set(3.76,1.0,0);face.rotation.y=-Math.PI/2;root.add(face);
 for(const side of [-1,1]){const rail=new T.Mesh(new T.BoxGeometry(.08,.08,4.5),amber);rail.position.set(side*3.5,-1.8,0);root.add(rail);}
 world.root.add(root);
 const dispose=site.dispose.bind(site);site.dispose=()=>{root.removeFromParent();root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});texture.dispose();dispose();};
}
