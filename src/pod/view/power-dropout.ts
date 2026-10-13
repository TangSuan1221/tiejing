/**
 * A single brownout of cabin lighting and the porthole feed, caused by a hull blow or a near-empty battery.
 * One dark interval, never a strobe; the simulation (lamp state, creature senses) is untouched.
 */
let until = 0;
export function triggerDropout(seconds: number): void { until = Math.max(until, performance.now() / 1000 + seconds); }
export function dropoutActive(): boolean { return performance.now() / 1000 < until; }
