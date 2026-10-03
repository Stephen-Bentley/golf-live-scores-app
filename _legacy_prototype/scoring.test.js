const scoring = require('./scoring.js');
const assert = require('assert');

function test() {
  console.log('Running scoring tests...');

  // Test Handicap Allocation
  // Handicap 0: no strokes
  assert.strictEqual(scoring.getHandicapStrokes(0, 1), 0);
  // Handicap 18: 1 stroke on every hole
  assert.strictEqual(scoring.getHandicapStrokes(18, 1), 1);
  assert.strictEqual(scoring.getHandicapStrokes(18, 18), 1);
  // Handicap 20: 2 strokes on SI 1, 2; 1 stroke elsewhere
  assert.strictEqual(scoring.getHandicapStrokes(20, 1), 2);
  assert.strictEqual(scoring.getHandicapStrokes(20, 2), 2);
  assert.strictEqual(scoring.getHandicapStrokes(20, 3), 1);
  assert.strictEqual(scoring.getHandicapStrokes(20, 18), 1);

  // Test Stableford Points
  // Par 4, SI 1, Handicap 10, Gross 5 -> Net 4 -> Points 2
  // Calculation: 
  // handicapStrokes for SI 1 (Handicap 10): floor(10/18)=0 + (1 <= 10%18 ? 1 : 0) = 1
  // netScore = 5 - 1 = 4
  // points = max(0, 2 + 4 - 4) = 2
  assert.strictEqual(scoring.getStablefordPoints(4, 1, 5), 2);

  // Par 3, SI 1, Handicap 0, Gross 3 -> Net 3 -> Points 2
  assert.strictEqual(scoring.getStablefordPoints(3, 0, 3), 2);

  // Par 4, SI 1, Handicap 0, Gross 4 -> Net 4 -> Points 2
  assert.strictEqual(scoring.getStablefordPoints(4, 0, 4), 2);

  // Par 4, SI 1, Handicap 0, Gross 3 -> Net 3 -> Points 3
  assert.strictEqual(scoring.getStablefordPoints(4, 0, 3), 3);

  // Par 4, SI 1, Handicap 0, Gross 2 -> Net 2 -> Points 4
  assert.strictEqual(scoring.getStablefordPoints(4, 0, 2), 4);

  // Par 4, SI 1, Handicap 0, Gross 1 -> Net 1 -> Points 5
  assert.strictEqual(scoring.getStablefordPoints(4, 0, 1), 5);

  // Par 4, SI 1, Handicap 0, Gross 0 (edge case)
  assert.strictEqual(scoring.getStablefordPoints(4, 0, 0), 6);

  // Test Player Summary
  const holes = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1
  }));
  
  // Handicap 18 (1 stroke each)
  // Scores: all 4 (par)
  // Net score: 4 - 1 = 3 (1 under par)
  // Points: 3 per hole = 54
  const scores18 = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, grossScore: 4 }));
  const summary18 = scoring.getPlayerSummary(holes, 18, scores18);
  assert.strictEqual(summary18.totalPoints, 54);
  assert.strictEqual(summary18.holesCompleted, 18);
  assert.strictEqual(summary18.isComplete, true);

  // Handicap 20
  // SI 1 & 2 get 2 strokes. Gross 4 -> Net 2 -> Points 4.
  // SI 3-18 get 1 stroke. Gross 4 -> Net 3 -> Points 3.
  // Total: (2 * 4) + (16 * 3) = 8 + 48 = 56.
  const scores20 = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, grossScore: 4 }));
  const summary20 = scoring.getPlayerSummary(holes, 20, scores20);
  assert.strictEqual(summary20.totalPoints, 56);
  assert.strictEqual(summary20.holesCompleted, 18);
  assert.strictEqual(summary20.isComplete, true);

  // Incomplete player
  const scoresIncomplete = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, grossScore: i === 0 ? null : 4 }));
  const summaryInc = scoring.getPlayerSummary(holes, 18, scoresIncomplete);
  assert.strictEqual(summaryInc.totalPoints, 51); // 17 * 3
  assert.strictEqual(summaryInc.holesCompleted, 17);
  assert.strictEqual(summaryInc.isComplete, false);

  console.log('All tests passed successfully!');
}

try {
  test();
} catch (error) {
  console.error('Test failed:');
  console.error(error);
  process.exit(1);
}
