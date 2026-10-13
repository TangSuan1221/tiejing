import {BEAM_EDGE, LAMP_RANGE, type Framing} from './framing';
import {motionFamily, type MotionFamily} from './motion';
import type {DangerTier, LensView, LexiconEntry} from './types';

/**
 * 原子化拼装：原型（物种词条）之外，材质 / 颜色 / 痕迹 / 发光各自一池短句，逐只怪物按种子抽取拼接。
 * 每条原子按体型类别过滤：鱼的鳞、鳃、鳍不能拼到水母、樽海鞘或甲壳上。
 * 一级真实物种只抽材质与痕迹（真实组织与真实损伤），不加颜色、发光与异化，保证物种可核对。
 *
 * 原子标记：`^` 需要原型里写了鳞；`@` 需要原型有眼；`%` 只给原型无色素的（“无色胶体”不能盖掉深红钟体）；`[bell|dome]` 需要原型 look/move 里出现其中一个结构词。
 */
export type BodyClass = 'fish' | 'gel' | 'cephalopod' | 'crustacean' | 'worm' | 'echinoderm' | 'sessile';

const CLASS_OF: Readonly<Record<MotionFamily, BodyClass>> = {
  ambush: 'fish', cruiser: 'fish', eel: 'fish', benthic: 'fish', shoal: 'fish',
  squid: 'cephalopod', octopus: 'cephalopod',
  medusa: 'gel', comb: 'gel', colonial: 'gel', filter: 'gel',
  crustacean: 'crustacean', worm: 'worm', echinoderm: 'echinoderm', sessile: 'sessile',
};

export function bodyClass(entry: LexiconEntry): BodyClass {
  return CLASS_OF[motionFamily(entry) ?? 'cruiser'];
}

export const MATERIAL_ATOMS: Readonly<Record<BodyClass, readonly string[]>> = {
  fish: [
    'skin finely pitted with sensory pores along the head and lateral line',
    'fins are thin translucent membranes on hair-thin rays, edges frayed',
    'flesh soft and slack, sagging slightly under its own weight',
    'skin so thin that muscle blocks and the spine show through',
    '^scales small, thin and loosely set, many lifted at the edges',
    '^empty scale pockets in patches, paler tissue showing beneath',
    'surface speckled with tiny dark pigment cells, each a separate dot',
    'a thin wet sheen of mucus breaking into fine highlights in the beam',
    '[teeth|tooth|fang|jaw]teeth glassy, needle-thin and slightly bent, uneven in length',
    'skin creasing finely like wet tissue paper where it bends',
    '@eyes filmed and dull, sunk in loose tissue',
    'faint broken iridescent flecks along the flank',
    'fine papillae and tiny skin flaps along the head and belly',
    'fin bases semi-transparent, fine blood vessels visible',
    'the belly skin translucent, dark organs dimly visible inside',
    'gill membranes thin and ragged, fluttering faintly',
  ],
  gel: [
    'jelly so clear that only its edges and inner canals catch the beam',
    'tissue thin and slightly cloudy, with milky streaks',
    'inner canals and organ threads visible as fine dark lines',
    'surface beaded with tiny particles stuck in its mucus',
    'margins frayed and uneven, thinning to almost nothing',
    'the body sags and dents where the current presses it',
    'faint refraction bending the dark water seen through it',
    'scattered pale cells and specks suspended inside the jelly',
    '[tentacle|thread|sting]stinging threads fine as hair, nearly invisible until lit',
    'tissue wet and glossy, pierced by small torn holes',
    'patches gone milky and opaque like damaged jelly',
    '[bell]fine radial muscle fibres visible as faint stripes in the bell',
    '[chain|colon|barrel|zooid|tube]each unit a separate clear body, seams visible where they join',
    '[comb]comb rows breaking the beam into fine shimmering lines',
  ],
  cephalopod: [
    'skin dense with tiny chromatophore dots opening and closing',
    'mantle soft and slightly translucent, veined with fine vessels',
    '[sucker|arm]suckers rimmed with fine horny teeth, unevenly sized',
    '[sucker]arm skin thin and loose, puckering around each sucker',
    'flesh slick with mucus, catching thin highlights',
    '[fin]fins thin and flexible, their edges slightly ragged',
    'small warty papillae raised over the mantle',
    'the mantle slightly deflated and creased, never taut',
    'pale speckle and scattered pigment cells along the arms',
    '@eyes filmed and dull, half sunk into loose tissue',
    'gelatinous flesh, faintly see-through at the thin edges',
  ],
  crustacean: [
    'shell thin and semi-translucent, organs dimly visible beneath',
    'carapace pitted and scratched, crusted with fine silt',
    'joints edged with fine bristles and soft membrane',
    'appendages slender and segmented, fringed with hair-fine setae',
    'shell surface dull and powdery, never glossy',
    '@faceted eyes dull and clouded',
    'translucent spines and bristles catching the beam',
    'patches of shell flaked away, showing paler membrane',
    '[antenna]fine sensory hairs along every antenna',
  ],
  worm: [
    'segments ringed with fine bristle bundles',
    'cuticle thin and translucent, the gut a dark line inside',
    '[paddle|parapod]paddles thin as wet paper, edges fraying',
    'body wet and faintly iridescent along its segments',
    'skin soft and slack, creasing finely at each segment',
    'tiny hair-fine sensory filaments along the head',
    'pale blood vessels visible through each segment',
    'surface slick with mucus and caught particles',
  ],
  echinoderm: [
    'skin gelatinous and semi-translucent, inner canals faintly visible',
    'surface covered with tiny soft papillae and tube feet',
    '[arm]arms finely ridged and bristling with small spines',
    'tissue soft and sagging, silt caught in its creases',
    'skin rough with tiny calcareous grains',
    'the body wall thin, slightly deflated, never plump',
    'a dull wet surface with fine pale speckle',
  ],
  sessile: [
    'tissue soft, spongy and porous, silt lodged in the pores',
    '[sponge|spicule|glass|lattice]surface a fine lattice of glassy spicules',
    'translucent body wall with fine fibres visible inside',
    '[stalk|anchor|tube]stalk fibrous, crusted at its base with silt and growth',
    'edges thin, sagging and slightly torn',
    'surface beaded with mucus and caught particles',
    'fine translucent filaments fringing every opening',
  ],
};

/** 痕迹：真实深海动物常见的损伤、附着与沉积，一级也可用 */
export const WEAR_ATOMS: Readonly<Record<BodyClass, readonly string[]>> = {
  fish: [
    'a ragged tear through one fin',
    'a pale abraded patch on the snout',
    '^scales missing in a ragged band along one flank',
    'a small parasitic copepod hanging from one fin',
    'an old healed bite scar along the flank',
    'marine snow caught in the mucus on its back',
    'a strand of mucus trailing from the gill',
    'fin tips worn away to bare frayed rays',
    'fine scratches across the head',
    'a torn, partly healed notch in the tail',
  ],
  gel: [
    'a torn notch in its margin',
    'marine snow stuck to its surface',
    'a strand of torn tissue trailing behind it',
    'small holes torn through the thin tissue',
    'a small amphipod riding inside its tissue',
    '[tentacle|thread|trail|arm|curtain|ribbon]its trailing parts tangled in one place',
    'one side collapsed and creased from old damage',
  ],
  cephalopod: [
    'one arm shorter than the rest, its tip missing',
    'skin scraped away in pale patches on the mantle',
    'a ragged, bitten fin edge',
    'circular sucker scars on the mantle',
    'marine snow clinging to the arms',
    '[web|fin]a healed tear across the web or fin',
  ],
  crustacean: [
    '[antenna]one antenna broken short',
    'one appendage missing on one side',
    'silt packed into the shell grooves',
    'small encrusting growths on the shell',
    'scratched, clouded patches on the shell',
  ],
  worm: [
    '[paddle|parapod]a few paddles torn or missing',
    'silt clinging between the segments',
    '[filament|tentacle|appendage]one head filament broken short',
    'a healed constriction partway along the body',
  ],
  echinoderm: [
    '[arm]one arm regrowing shorter than the rest',
    'silt clinging to its upper surface',
    'a pale scraped patch where skin is missing',
    'small brittle stars clinging to it',
  ],
  sessile: [
    'marine snow settled thickly on its top',
    '[branch|vane|tree|frond]a broken branch hanging by fibres',
    'small brittle stars clinging to it',
    'tiny pale hydroids growing over its base',
  ],
};

/** 颜色只写斑纹与局部色调，叠在原型主色之上，不改主色；色域限锈、深渊蓝黑、骨白、暗红 */
const OPAQUE_COLOUR = [
  'irregular rust blotches mottling its back',
  'a pale bone-white underside fading unevenly into its darker back',
  'margins edged in dark maroon',
  'fine black speckle over the paler parts',
  'uneven bruise-dark patches where the skin is thin',
  'pigment worn away in patches, leaving dirty translucent tissue',
  'a faint crimson flush where blood shows through thin skin',
  'a blue-black ground broken by pale scars',
  'pale freckling of tiny bone-white dots',
  'rust stains bleeding into the paler tissue around old wounds',
  'a dull dark-red tint where vessels gather beneath the skin',
  'dark pigment thinning into patchy translucence toward the edges',
  'dead-white patches like bleached tissue',
  'faint irregular banding, darker and paler, broken in places',
];
const GEL_COLOUR = [
  '%colourless jelly with a faint dirty-white cloudiness',
  '%a dark maroon core glimpsed through the clear tissue',
  'faint crimson pigment confined to the inner canals',
  'translucent tissue faintly stained rust where it is thickest',
  '%milky bone-white margins on otherwise clear tissue',
  'patchy pale cloudiness drifting through the jelly',
  '%deep blood-red inner organs, the rest nearly invisible',
  '%clear tissue, only the edges catching dull bone-white light',
  'pigment uneven, darker in blotches and thinning toward the margin',
  'a darker band of pigment where the body is thickest',
  'faint pale streaks running through the darker tissue',
];
export const COLOUR_ATOMS: Readonly<Record<BodyClass, readonly string[]>> = {
  fish: OPAQUE_COLOUR, cephalopod: OPAQUE_COLOUR, crustacean: OPAQUE_COLOUR.map(t => t.replace(/\bskin\b/g, 'shell')),
  worm: OPAQUE_COLOUR, echinoderm: OPAQUE_COLOUR, sessile: OPAQUE_COLOUR, gel: GEL_COLOUR,
};

/** 发光：只给原型里没写发光的二三级，约四成个体追加一处 */
export const LIGHT_ATOMS: readonly string[] = [
  'a few faint pale photophores dotted along its underside',
  'one dim red light organ near the front, barely visible',
  'faint blue-white sparks along its edges, appearing and fading',
  'a dim irregular light flickering deep inside the body',
  'a single weak light hanging from a thin filament',
  'scattered pinprick lights that go out when the beam touches them',
  'a faint pale light leaking from a wound in its tissue',
  'paired dim lights pulsing slowly out of rhythm',
  'a smear of faintly luminous mucus drifting off it',
  'tiny pale light points scattered unevenly over its surface',
];

const LIT_LOOK = /light|lure|glow|photophore|lumin|flash|lantern|lamp/i;
const HAS_SCALES = (look: string) => /\bscales?\b|\bscaled\b/i.test(look) && !/\bscaleless\b/i.test(look);
const HAS_EYES = (look: string) => /\beyes?\b/i.test(look) && !/\bno eyes\b|\beyeless\b|\bwithout eyes\b/i.test(look);
const NEEDS = /^\[([^\]]+)\]/;
const PIGMENTED = (look: string) => /\b(red|crimson|maroon|rust|orange|black|brown|purple|scarlet)\b|blood-red|dark-red/i.test(look);

/** 原子是否适合该原型；返回去掉标记的正文，不适合返回 null */
export function fitAtom(text: string, entry: Pick<LexiconEntry, 'look' | 'move'>): string | null {
  const body = `${entry.look} ${entry.move}`;
  let t = text;
  for (;;) {
    if (t.startsWith('^')) { if (!HAS_SCALES(entry.look)) return null; t = t.slice(1); continue; }
    if (t.startsWith('@')) { if (!HAS_EYES(entry.look)) return null; t = t.slice(1); continue; }
    if (t.startsWith('%')) { if (PIGMENTED(entry.look)) return null; t = t.slice(1); continue; }
    const m = t.match(NEEDS);
    if (m) {
      if (!new RegExp(`\\b(${m[1]})`, 'i').test(body)) return null;
      t = t.slice(m[0].length); continue;
    }
    break;
  }
  // 原型明说没有的结构，原子不得补上
  if (/\bjawless\b/i.test(body) && /\bjaws?\b/i.test(t)) return null;
  if (/\bfinless\b|\bno fins\b/i.test(body) && /\bfins?\b/i.test(t)) return null;
  return t;
}

/** 某物种可用的全部原子（已按体型、结构、鳞、眼过滤） */
export function atomLibrary(tier: DangerTier, entry: LexiconEntry) {
  const cls = bodyClass(entry);
  const fit = (list: readonly string[]) => list.map(t => fitAtom(t, entry)).filter((t): t is string => t !== null);
  return {
    cls,
    material: fit(MATERIAL_ATOMS[cls]),
    wear: fit(WEAR_ATOMS[cls]),
    colour: tier === 1 ? [] : fit(COLOUR_ATOMS[cls]),
    light: tier === 1 || LIT_LOOK.test(entry.look) ? [] : [...LIGHT_ATOMS],
  };
}

/** 细节量随照明递减：灯内看得清皮肤，光束边缘只剩大块特征，光外只剩剪影与自发光 */
function detailLevel(view?: LensView, framing?: Framing): 0 | 1 | 2 {
  if (!view) return 2;
  if (!view.lamp || view.distance > BEAM_EDGE || framing?.shot === 'tiny') return 0;
  if (view.distance > LAMP_RANGE || framing?.shot === 'long') return 1;
  return 2;
}

/** 从一池里不重复地抽 n 条；同一种子永远同序，近远镜头只截取长短，不换内容 */
function draw(list: readonly string[], n: number, rand: () => number): string[] {
  const copy = [...list], out: string[] = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  return out;
}

export function composeAtoms(tier: DangerTier, entry: LexiconEntry, rand: (tag: string) => () => number, view?: LensView, framing?: Framing): string[] {
  const lib = atomLibrary(tier, entry), level = detailLevel(view, framing);
  // 利维坦近景只是一块局部表面，一条材质足够；光束边缘只剩剪影，不写材质。预算留给巨物尺度句
  const material = draw(lib.material, 2, rand('material')).slice(0, (tier === 3 ? [0, 0, 1] : [0, 1, 2])[level]);
  const colour = draw(lib.colour, 1, rand('colour'));
  const lightRand = rand('light');
  const light = lightRand() < .4 ? draw(lib.light, 1, lightRand) : [];
  // 发光与痕迹二选一：三怪同框时两者都写会超出 7000 字符
  const wear = light.length ? [] : draw(lib.wear, 1, rand('wear')).slice(0, level === 2 ? 1 : 0);
  const lines = () => [
    material.length ? `Material: ${material.join('; ')}.` : '',
    colour.length ? `Colour: ${colour[0]}.` : '',
    wear.length ? `Wear: ${wear[0]}.` : '',
    light.length ? `Light: ${light[0]}.` : '',
  ].filter(Boolean);
  // 每只怪物的原子总长封顶，三怪同框才稳在 7000 字符内；超出先丢痕迹/发光，再丢第二条材质
  while (lines().join(' ').length > ATOM_BUDGET && (wear.length || light.length || material.length > 1)) {
    if (wear.length) wear.pop(); else if (light.length) light.pop(); else material.pop();
  }
  return lines();
}

export const ATOM_BUDGET = 190;
