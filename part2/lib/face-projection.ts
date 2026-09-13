export type FacePoint = { x: number; y: number };
export type FaceAnchors = { mouth: FacePoint; crown: FacePoint; width: number };

// MediaPipe coordinates describe the source video, not its cropped display box.
export function projectFacePoint(
  point: FacePoint,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): FacePoint {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return {
    x:
      1 -
      (point.x * sourceWidth * scale - (sourceWidth * scale - width) / 2) /
        width,
    y:
      (point.y * sourceHeight * scale - (sourceHeight * scale - height) / 2) /
      height,
  };
}
