import * as T from 'three';
import type {LensView} from '../../content/monster-lexicon';

/** Optical relation between the posed shutter camera and a subject centre, measured in world space. */
export function lensView(camera: T.PerspectiveCamera, target: T.Vector3, lamp: boolean): LensView {
  camera.updateMatrixWorld(true);
  const ndc = target.clone().project(camera);
  const inFront = ndc.z > -1 && ndc.z < 1;
  return {
    distance: camera.position.distanceTo(target),
    fovDeg: camera.fov,
    aspect: camera.aspect,
    lamp,
    screen: inFront ? [T.MathUtils.clamp(ndc.x, -1.5, 1.5), T.MathUtils.clamp(ndc.y, -1.5, 1.5)] : null,
  };
}
