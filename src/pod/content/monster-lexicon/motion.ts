import type {DangerTier, LexiconEntry} from './types';

/**
 * 动作词库：按身体构型给每个物种一组真实深海行为。一次曝光抽三拍——
 * 基线（物种标志动作或构型待机）、一次变化、全程细部，避免模型反复做同一个张嘴动作。
 * 深海动物的真实特征：节能、长时间悬停、随流漂移、短促爆发后滑行、喷射后退、收缩/展开、发光。
 * 标 `!` 的变化带捕食者意图，只给二三级；需要发光器官的细部只给 look 里写了发光的物种。
 */
export type MotionFamily =
  | 'ambush' | 'cruiser' | 'eel' | 'benthic' | 'squid' | 'octopus' | 'medusa'
  | 'comb' | 'colonial' | 'filter' | 'sessile' | 'echinoderm' | 'crustacean' | 'worm' | 'shoal';

interface MotionPool {
  readonly idle: readonly string[];
  readonly shift: readonly string[];
  readonly detail: readonly string[];
}

const LIGHT = /light|lure|glow|photophore|lumin|flash|lantern|lamp/i;
const LIT = '~';

export const MOTION_POOLS: Readonly<Record<MotionFamily, MotionPool>> = {
  ambush: {
    idle: [
      'hangs almost motionless, head slightly up, pectoral fins barely holding station',
      'drifts sideways on the faint current without swimming, body rigid',
      'sinks a few centimetres, then corrects with one lazy tail flick',
      'rotates very slowly on its long axis, as if weightless',
      'holds a slight head-down tilt, only the fin edges quivering',
      'hangs with fins folded flat, sinking imperceptibly',
    ],
    shift: [
      'two sudden tail beats carry it a body length, then it coasts to a dead stop',
      'it backs off with tiny reverse fin strokes, head still facing the light',
      'its body bends into a slow S-curve and straightens again',
      'it turns broadside and hangs there, fins barely moving',
      'it rolls a few degrees onto one side and holds there',
      'a single shudder runs down its body, then stillness',
      '!it creeps closer to the light by drift alone, no fin visibly moving',
    ],
    detail: [
      'gill covers pulse slowly and unevenly',
      'loose skin trembles faintly along its belly',
      'fin rays tremble in the current',
      'marine snow curls off its flank where the fins stir the water',
      LIT + 'its light organs flicker at irregular intervals',
    ],
  },
  cruiser: {
    idle: [
      'holds station with slow sculling of its pectoral fins',
      'drifts forward a little, barely beating its tail, then stops',
      'hangs head-up at a steep angle, tail beating slowly',
      'hovers level, fins making tiny constant corrections',
    ],
    shift: [
      'startled by the light, it darts a short way and freezes again',
      'it tilts nose-down and hangs there for a long beat',
      'it rises a body length on slow fin strokes, then settles back',
      'it turns away in a slow banking roll, its flank catching the beam',
      'it sinks tail-first out of the beam, then rises back into it',
      '!it stops dead in the beam and slowly drifts nearer',
    ],
    detail: [
      'pectoral fins flicker in small rapid strokes',
      'its body flexes slightly with each slow tail beat',
      'particles scatter in its wake',
      'its gill covers flutter quickly',
      LIT + 'faint light organs along its belly pulse',
    ],
  },
  eel: {
    idle: [
      'undulates slowly, a wave travelling from head to tail',
      'hangs vertically, only a ripple running down its fin',
      'lies in a loose coil, drifting with the current',
      'hangs in a loose S-shape, barely drifting',
    ],
    shift: [
      'it straightens slowly, then curls back into a loose coil',
      'a slow kink travels down its body and dies at the tail',
      'its front half lifts slowly while the tail hangs limp',
      'it folds into a slow loop and reverses direction',
      'it retreats tail first in a smooth backward undulation',
      '!its head drifts closer while the body stays coiled behind',
    ],
    detail: [
      'the tail tip curls and uncurls',
      'a fin ripple runs along its edge',
      'its body sways with the current between strokes',
      'its gill openings flutter',
    ],
  },
  benthic: {
    idle: [
      'hovers nose-down just above the floor, tail angled up',
      'rests on the floor, then lifts off with one slow fin stroke',
      'hovers low over the silt, head sweeping slowly side to side',
      'rests nose-down in the silt, tail lifting slightly',
    ],
    shift: [
      'it pushes off and a soft puff of silt rises behind it',
      'it rises a little off the floor and hangs there',
      'it turns slowly in place to point another way',
      'it settles back down, fins spread, gills pulsing',
      '!it stops and slowly lifts its head toward the light',
    ],
    detail: [
      'its gills pulse slowly',
      'silt drifts up where its fins brush the floor',
      'its soft body wobbles slightly as it swims',
      'a thin trail of disturbed silt hangs in the water near it',
    ],
  },
  squid: {
    idle: [
      'hovers with slow undulating fin beats, arms held together in a point',
      'drifts head-down, arms splayed loosely',
      'holds station, its mantle slowly filling and emptying',
      'hangs horizontal, fins waving in slow ripples',
    ],
    shift: [
      'one sharp mantle contraction jets it backward, arms trailing',
      'its arms curl up over its head and slowly relax',
      'its colour pales suddenly, then slowly darkens again',
      'a slow dark flush of colour spreads across its mantle',
      'its arms spread wide, then slowly fold back together',
      '!it turns its arms toward the light and edges forward fin-first',
    ],
    detail: [
      'fins ripple along the mantle edge',
      'arm tips curl and uncurl independently',
      'its siphon puffs small swirls of particles',
      'its skin flickers with tiny shifting spots',
    ],
  },
  octopus: {
    idle: [
      'hovers with slow flaps of its fins, arms hanging in a loose skirt',
      'pulses its arm web gently like a slow umbrella',
      'drifts with its arms curled beneath its body',
      'hangs with arms spread in a loose star',
    ],
    shift: [
      'it spreads its web wide and sinks slowly like a parachute',
      'it turns slowly, arms trailing in loose curls',
      'its web closes into a bell, then slowly opens',
      'it draws its arms up over its body into a closed shape',
      'it pushes with all arms at once, then glides',
      '!it reaches one arm tip slowly toward the light',
    ],
    detail: [
      'arm tips curl independently',
      'the web edge ripples',
      'its mantle slowly inflates and deflates',
      'suckers along one arm pucker and relax',
    ],
  },
  medusa: {
    idle: [
      'its bell contracts in slow uneven pulses, rising a little with each',
      'hangs with the bell relaxed, sinking very slowly',
      'tilts slowly on the current, barely pulsing',
      'drifts almost still, its margin barely trembling',
    ],
    shift: [
      'its bell folds inward and it turns over slowly',
      'its pulses stop for several seconds, then restart unevenly',
      'it contracts hard once and coasts upward a little',
      'its trailing tissue draws up, then slowly lets out again',
      LIT + 'a wave of pale light runs around its margin',
      '!it drifts into the beam, stops pulsing and hangs there',
    ],
    detail: [
      'the margin ripples',
      'trailing tissue sways behind it',
      'particles cling to its translucent tissue',
      'fine threads below it drift and tangle',
    ],
  },
  comb: {
    idle: [
      'glides on shimmering comb rows with no visible stroke',
      'rotates slowly as it drifts',
      'hangs nearly still, combs beating faintly',
    ],
    shift: [
      'it reverses, its comb rows rippling the other way',
      'it slowly twists on its long axis',
      'its body contracts slightly and it sinks',
      'light breaks along its comb rows as it turns',
      '!it edges slowly toward the light, then stops',
    ],
    detail: [
      'comb rows shimmer in travelling waves',
      'its soft body flexes',
      'scattered beam light flickers along its rows',
    ],
  },
  colonial: {
    idle: [
      'drifts as a slow loose curve',
      'lies stretched in a long line, barely moving',
      'hangs in a slack spiral',
    ],
    shift: [
      'the colony contracts along its length, then slowly extends again',
      'a ripple runs its whole length and dies out',
      'its front units pulse and tow it into a gentle turn',
      'its fine tentacles draw in, then slowly let out again',
      '!it drifts in a slow curve that wraps around the light',
    ],
    detail: [
      'its units pulse slightly out of sync',
      'it flexes with the current',
      'fine threads hang from it, barely moving',
      LIT + 'a slow wave of light runs along it',
    ],
  },
  filter: {
    idle: [
      'its tail beats in slow bursts inside the mucus house',
      'hangs motionless inside the house, walls barely trembling',
      'the house drifts slowly, its walls sagging',
    ],
    shift: [
      'the house shudders and particles stream inward',
      'it pauses and the whole house sags slightly',
      'the animal inside pauses, then beats its tail faster',
      '!the house slowly turns its open intake toward the light',
    ],
    detail: [
      'marine snow is drawn in a slow stream toward it',
      'the house walls ripple',
      'loose mucus strands trail from the house',
    ],
  },
  sessile: {
    idle: [
      'stays anchored, swaying slightly in the faint current',
      'motionless, only its soft tissue trembling',
      'its tips bend slowly with the current',
    ],
    shift: [
      'it slowly contracts and closes, then reopens over several seconds',
      'one part folds slowly inward and stays closed',
      'its soft parts retract in sequence, then slowly re-emerge',
      '!it slowly leans toward the light',
    ],
    detail: [
      'marine snow settles on it',
      'its edges flutter',
      'silt slides slowly off its surface',
    ],
  },
  echinoderm: {
    idle: [
      'its arms or body flex slowly in the current',
      'drifts just above the floor, its body gently flexing',
      'rests on the silt, barely moving',
    ],
    shift: [
      'it lifts off in a slow undulating swim, then settles again',
      'it slowly curls one edge upward and holds it there',
      'its arms sweep slowly in unison into the current',
      '!its arms sweep in slow unison toward the light',
      'it slowly draws its arms or veil in close',
    ],
    detail: [
      'its tips quiver',
      'silt drifts off its body',
      'its tube feet wave faintly',
    ],
  },
  crustacean: {
    idle: [
      'swims with small rapid strokes of its swimmerets, body held level',
      'hovers, antennae sweeping slowly',
      'drifts with appendages tucked, sinking very slowly',
    ],
    shift: [
      'a sharp tail flip jerks it backward a short way',
      'it flicks its swimmerets and rises a short way',
      'it tucks its appendages in and sinks',
      'it turns side-on and drifts',
      '!it holds in the beam, antennae turning toward the light',
    ],
    detail: [
      'its antennae twitch',
      'its appendages flicker',
      'its swimmerets beat in quick ripples',
    ],
  },
  worm: {
    idle: [
      'swims with paddles rippling in rolling waves',
      'hangs with its body gently flexing',
      'drifts in a loose curve, barely moving',
    ],
    shift: [
      'it curls into a loose spiral and drifts',
      'its front end lifts and sweeps slowly from side to side',
      'it reverses with a quick ripple of its paddles',
      '!it uncurls slowly toward the light',
    ],
    detail: [
      'its head appendages wave slowly',
      'its segments flex in sequence',
      'its bristles flicker in the beam',
    ],
  },
  shoal: {
    idle: ['the shoal mills slowly in a loose ball', 'the shoal hangs almost still, every fish holding station', 'the shoal drifts as one loose cloud'],
    shift: [
      'the whole shoal flinches from the light and slowly reforms',
      'a ripple of turning runs through the shoal',
      'the shoal stretches into a ribbon and folds back on itself',
      '!the shoal edges toward the light as one body',
    ],
    detail: ['fish at the edges flicker and turn', 'gaps open and close inside the shoal', 'single fish break away and rejoin'],
  },
};

/**
 * 利维坦按尺度另立三池：短促冲刺、喷射后退不适用于数百米的身体；
 * 一律原地动作——“滑过镜头/横穿画面”会被模型拍成同一种掠过镜头
 */
const LEVIATHAN_IDLE = [
  'hangs almost motionless, only its surface slowly breathing',
  'barely moves, a slow tremor running through the visible part',
  'lies inert, the only motion the drift of particles over it',
];
const LEVIATHAN_SHIFT = [
  'its whole mass shifts a little closer, as slowly as a tide',
  'it stops entirely for several seconds, then resumes',
  'a slow contraction ripples across the visible part',
  'the visible part slowly swells, then settles',
  'the part in frame slowly turns, showing another side to the beam',
  'a slow shudder spreads outward across it and fades',
  'part of its surface slowly sinks, then rises again',
];
const LEVIATHAN_DETAIL = [
  'its slow push sends marine snow drifting away',
  'silt and small animals slide off it as it shifts',
  'its movement reads only against the fixed structures',
  'mucus threads stream slowly from its surface',
  'small fish scatter from its surface and settle again',
  'a faint pressure wave pushes the marine snow aside',
];

const F = (family: MotionFamily, ids: string) => ids.split(' ').map(id => [id, family] as const);

/** 每个词条必须有构型；`tools/monster-lexicon-check.ts` 校验全覆盖 */
export const MOTION_FAMILY: Readonly<Record<string, MotionFamily>> = Object.fromEntries([
  ...F('ambush', 'humpback-anglerfish triplewart-seadevil fanfin-anglerfish wolftrap-angler footballfish whipnose-angler bearded-anglerfish fangtooth black-dragonfish stoplight-loosejaw scaleless-dragonfish black-swallower dragonfish-pacific telescopefish daggertooth sabertooth-fish sloane-viperfish lantern-choir needle-cage-viper floorless-lattice barbel-lure fang-vault distended-swallower telescope-glider whip-lash filament-web abyss-choir-angler barbel-titan cage-titan'),
  ...F('eel', 'gulper-eel whiptail-gulper ribbon-sawtail bobtail-snipe-eel slender-snipe-eel crestfish oarfish hagfish spiny-eel cutthroat-eel gulper-wraith ribbon-litany hagfish-knot throat-slit-eel beak-thread trench-ribbon gulper-horizon pale-coil thread-titan gill-wall'),
  ...F('cruiser', 'barreleye spookfish mirrorbelly hatchetfish lanternfish bristlemouth barracudina lancetfish hairyfish bigscale tubeshoulder deepsea-smelt orange-roughy dome-watcher mirror-flock sail-lancet mirror-eye thousand-eye-dome'),
  ...F('benthic', 'tripodfish grenadier hadal-grenadier mariana-snailfish ethereal-snailfish abyssal-cusk giant-cusk faceless-cusk blob-sculpin blobfish halosaur eelpout deep-skate longnose-chimaera trench-ghost rattail-sovereign blind-cusk pale-lance brood-sculpin eyed-wall abyss-spine blind-titan'),
  ...F('squid', 'bigfin-squid colossal-squid giant-squid glass-squid cockatoo-squid strawberry-squid armhook-squid octopus-squid toothy-squid elbowed-mourner hook-halo flash-hunter glass-sac elbow-titan lightning-titan abyss-eye-squid'),
  ...F('octopus', 'vampire-squid dumbo-octopus flapjack-octopus telescope-octopus glass-octopus glowing-sucker-octopus warty-octopus seven-arm-octopus velvet-cloak umbrella-shroud gelatin-mass cloak-abyss'),
  ...F('medusa', 'giant-phantom-jelly big-red-jelly atolla helmet-jelly deepstaria dinner-plate-jelly hollow-bell phantom-curtain helmet-lamp alarm-crown cathedral-bell phantom-curtain-titan helmet-dome atolla-ring'),
  ...F('comb', 'abyssal-comb-jelly bloody-belly-comb-jelly comb-pilgrim comb-aurora'),
  ...F('colonial', 'giant-siphonophore woolly-siphonophore angler-siphonophore giant-pyrosome thousand-bell-chain glass-lung pyrosome-sleeve siphon-curtain siphon-chain-titan glass-lung-titan pyrosome-tunnel'),
  ...F('filter', 'giant-larvacean mucus-cathedral mucus-titan'),
  ...F('sessile', 'predatory-tunicate venus-flower-basket harp-sponge ping-pong-sponge flytrap-anemone xenophyophore giant-tubeworm pompeii-worm hood-maw harp-snare vent-forest maw-mountain'),
  ...F('echinoderm', 'scotoplanes enypniastes psychropotes basket-star brisingid stalked-crinoid veil-cucumber basket-nest spoke-star basket-canopy veil-continent spoke-wheel'),
  ...F('crustacean', 'giant-isopod supergiant-amphipod hadal-amphipod phronima crystal-amphipod giant-ostracod gnathophausia yeti-crab colossendeis red-prawn barrel-tenant lantern-seed ostracod-moon barrel-titan'),
  ...F('worm', 'squidworm tomopteris acorn-worm squidworm-crown oar-dancer'),
  ...F('shoal', 'rust-roughy-swarm'),
]);

export function motionFamily(entry: LexiconEntry): MotionFamily | undefined {
  return MOTION_FAMILY[entry.id];
}

/** 该物种可用的全部动作提示词（标志动作 + 构型池，已按等级与发光过滤） */
export function motionLibrary(tier: DangerTier, entry: LexiconEntry): MotionPool {
  const pool = MOTION_POOLS[motionFamily(entry) ?? 'cruiser'];
  const lit = LIGHT.test(entry.look);
  const keep = (list: readonly string[]) => list
    .filter(t => (tier > 1 || !t.startsWith('!')) && (lit || !t.startsWith(LIT)))
    .map(t => t.replace(/^[!~]+/, ''));
  return {
    idle: [entry.move, ...(tier === 3 ? LEVIATHAN_IDLE : keep(pool.idle))],
    shift: tier === 3 ? LEVIATHAN_SHIFT : keep(pool.shift),
    detail: tier === 3 ? LEVIATHAN_DETAIL : keep(pool.detail),
  };
}

/** 一次曝光的三拍动作。同一种子与机位给同一句，换机位或换深度档才换动作 */
export function composeMotion(tier: DangerTier, entry: LexiconEntry, rand: () => number): string {
  const lib = motionLibrary(tier, entry);
  const pick = (list: readonly string[]) => list[Math.floor(rand() * list.length)]!;
  // 标志动作承载物种辨识度，占基线的一半
  const idle = rand() < .5 ? entry.move : pick(lib.idle.slice(1));
  return `Motion: ${idle}; later ${pick(lib.shift)}; throughout, ${pick(lib.detail)}.`;
}
