/**
 * Playing handicap helpers from course rating / slope.
 * WHS-style approximation: playingHcp = round(handicapIndex * (slope/113) + (rating - par))
 */

export function calculatePlayingHandicap(input: {
  handicapIndex: number;
  slopeRating: number;
  courseRating: number;
  coursePar: number;
}): number {
  const { handicapIndex, slopeRating, courseRating, coursePar } = input;
  if (slopeRating < 55 || slopeRating > 155) {
    throw new Error("slopeRating must be between 55 and 155");
  }
  if (handicapIndex < 0 || handicapIndex > 54) {
    throw new Error("handicapIndex must be between 0 and 54");
  }
  const raw =
    handicapIndex * (slopeRating / 113) + (courseRating - coursePar);
  return Math.max(0, Math.min(54, Math.round(raw)));
}

export function courseParFromHoles(
  holes: Array<{ par: number }>
): number {
  return holes.reduce((sum, h) => sum + h.par, 0);
}
