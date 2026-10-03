/**
 * Scoring engine for Fairway Live.
 * This module provides pure functions for handicap allocation and Stableford calculations.
 */

/**
 * Calculates the number of handicap strokes a player receives on a specific hole.
 * 
 * @param {number} playingHandicap - The player's playing handicap (0-54).
 * @param {number} strokeIndex - The stroke index of the hole (1-18).
 * @returns {number} The number of handicap strokes for this hole.
 */
function getHandicapStrokes(playingHandicap, strokeIndex) {
  const baseStrokes = Math.floor(playingHandicap / 18);
  const extraStroke = (strokeIndex <= (playingHandicap % 18)) ? 1 : 0;
  return baseStrokes + extraStroke;
}

/**
 * Calculates Stableford points for a single hole.
 * 
 * @param {number} par - The par for the hole.
 * @param {number} handicapStrokes - The strokes received on this hole.
 * @param {number|null} grossScore - The player's gross score on this hole (1-20, or null if not entered).
 * @returns {number} The Stableford points awarded for the hole.
 */
function getStablefordPoints(par, handicapStrokes, grossScore) {
  if (grossScore === null || grossScore === undefined || grossScore === '') {
    return 0;
  }
  const netScore = Number(grossScore) - handicapStrokes;
  return Math.max(0, 2 + par - netScore);
}

/**
 * Calculates a summary of a player's performance in a round.
 * 
 * @param {Array<{number: number, par: number, strokeIndex: number}>} holes - The 18 holes of the tee set.
 * @param {number} playingHandicap - The player's playing handicap.
 * @param {Array<{holeNumber: number, grossScore: number|null}>} scores - The scores entered by the player.
 * @returns {{totalPoints: number, holesCompleted: number, isComplete: boolean}}
 */
function getPlayerSummary(holes, playingHandicap, scores) {
  let totalPoints = 0;
  let holesCompleted = 0;

  for (const hole of holes) {
    const scoreEntry = scores.find(s => s.holeNumber === hole.number);
    const grossScore = scoreEntry ? scoreEntry.grossScore : null;

    if (grossScore !== null && grossScore !== undefined && grossScore !== '') {
      const handicapStrokes = getHandicapStrokes(playingHandicap, hole.strokeIndex);
      const points = getStablefordPoints(hole.par, handicapStrokes, grossScore);
      totalPoints += points;
      holesCompleted++;
    }
  }

  const isComplete = holesCompleted === holes.length;

  return {
    totalPoints,
    holesCompleted,
    isComplete
  };
}

module.exports = {
  getHandicapStrokes,
  getStablefordPoints,
  getPlayerSummary
};
