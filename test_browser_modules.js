/**
 * test_browser_modules.js - Unit tests for client-side JS analysis modules in Node.
 */
const assert = require('assert');
const Chess = require('./templates/js/chess.min.js').Chess || require('./templates/js/chess.min.js');
const ChessEvaluator = require('./templates/js/chess-evaluator.js');
const OpeningDetector = require('./templates/js/opening-detector.js');
const SituationRecognizer = require('./templates/js/situation-recognizer.js');

console.log("Running browser module unit tests...");

// 1. ChessEvaluator tests
console.log("Testing ChessEvaluator...");
assert.strictEqual(ChessEvaluator.scoreToCp(null), 0);
assert.strictEqual(ChessEvaluator.scoreToCp(150), 150);
assert.strictEqual(ChessEvaluator.scoreToCp({ cp: 220 }), 220);
assert.strictEqual(ChessEvaluator.scoreToCp({ mate: 1 }), 9990);
assert.strictEqual(ChessEvaluator.scoreToCp({ mate: -1 }), -9990);

const wp0 = ChessEvaluator.cpToWinProb(0);
assert(Math.abs(wp0 - 0.50) < 0.001, `Expected 0.50, got ${wp0}`);

const wp400 = ChessEvaluator.cpToWinProb(400);
assert(Math.abs(wp400 - 0.909) < 0.01, `Expected ~0.909, got ${wp400}`);

const wpNeg400 = ChessEvaluator.cpToWinProb(-400);
assert(Math.abs(wpNeg400 - 0.091) < 0.01, `Expected ~0.091, got ${wpNeg400}`);

const resBook = ChessEvaluator.classifyMove(0.5, 0.4, { isBook: true });
assert.strictEqual(resBook.uiQuality, 'good move');
assert.strictEqual(resBook.detailedQuality, 'book');

const resBlunder = ChessEvaluator.classifyMove(0.70, 0.20, { playedIsBest: false });
assert.strictEqual(resBlunder.uiQuality, 'blunder');
assert.strictEqual(resBlunder.detailedQuality, 'blunder');

const resMistake = ChessEvaluator.classifyMove(0.60, 0.45, { playedIsBest: false });
assert.strictEqual(resMistake.uiQuality, 'mistake');
assert.strictEqual(resMistake.detailedQuality, 'mistake');

// Format score tests
assert.strictEqual(ChessEvaluator.formatScore({ cp: 150 }, 'w'), '+1.50');
assert.strictEqual(ChessEvaluator.formatScore({ cp: -220 }, 'w'), '-2.20');
assert.strictEqual(ChessEvaluator.formatScore({ mate: 2 }, 'w'), 'M2');
assert.strictEqual(ChessEvaluator.formatScore({ mate: -3 }, 'w'), '-M3');

// Black move win probability & blunder classification test:
// When Stockfish evaluates Black's position, score cp is in Black's POV.
// E.g., Black is winning by +200 cp (bestCp = 200). Black plays a blunder and is now -400 cp (playedCp = -400).
const blackBestCp = 200;
const blackPlayedCp = -400;
const blackWpBefore = ChessEvaluator.cpToWinProb(blackBestCp);
const blackWpAfter = ChessEvaluator.cpToWinProb(blackPlayedCp);
assert(blackWpBefore > 0.70, `Black should have high win prob before blunder, got ${blackWpBefore}`);
assert(blackWpAfter < 0.15, `Black should have low win prob after blunder, got ${blackWpAfter}`);
const blackBlunderClass = ChessEvaluator.classifyMove(blackWpBefore, blackWpAfter, { playedIsBest: false });
assert.strictEqual(blackBlunderClass.uiQuality, 'blunder', 'Black move with -0.60 win prob drop must be blunder');

// Display evaluation for Black move:
// Black is winning (+200 cp from Black's POV). Display relative to White should be -2.00.
const blackMoverScore = { cp: 200 };
const whiteDisplayScore = { cp: -blackMoverScore.cp };
assert.strictEqual(ChessEvaluator.formatScore(whiteDisplayScore, 'w'), '-2.00');

console.log("✓ ChessEvaluator passed!");

// 2. OpeningDetector tests
console.log("Testing OpeningDetector...");
const op1 = OpeningDetector.identifyOpening(["e4", "e5", "Nf3", "Nc6", "Bc4"]);
assert.strictEqual(op1.eco, "C50");
assert.strictEqual(op1.name, "Italian Game");

const op2 = OpeningDetector.identifyOpening(["d4", "g6"]);
assert.strictEqual(op2.eco, "A40");
assert.strictEqual(op2.name, "Queen's Pawn Game: Modern Defense");

assert.strictEqual(OpeningDetector.isBookMove(["e4", "e5", "Nf3"], 3), true);
assert.strictEqual(OpeningDetector.isBookMove(["h4", "h5"], 2), false);

// Early queen sortie
const bQ = new Chess();
bQ.move('e4');
bQ.move('e5');
const qMove = { from: 'd1', to: 'h5', piece: 'q' };
const opViolation = OpeningDetector.detectOpeningPrincipleViolation(bQ, qMove, 3);
assert(opViolation !== null && opViolation.includes('Queen too early'));

console.log("✓ OpeningDetector passed!");

// 3. SituationRecognizer tests
console.log("Testing SituationRecognizer...");

// Fork test: White knight on e7 forks Black King on g8 and Rook on c8
const forkBoard = new Chess("2r3k1/4N3/8/8/8/8/8/4K3 b - - 0 1");
const forkMove = { from: 'd5', to: 'e7', piece: 'n' };
const forkRes = SituationRecognizer.detectFork(forkBoard, forkMove);
assert(forkRes !== null, "Fork should be detected");
assert.strictEqual(forkRes.type, 'fork');
assert(forkRes.targets.includes('king') && forkRes.targets.includes('rook'));

// Fork test 2: Attacker is capturable by Black bishop on d6 (Bxe7) -> filtered out
const forkBoardCapturable = new Chess("2r3k1/4N3/3b4/8/8/8/8/4K3 b - - 0 1");
const forkResCapturable = SituationRecognizer.detectFork(forkBoardCapturable, forkMove);
assert.strictEqual(forkResCapturable, null, "Capturable attacker fork should be filtered out");

// Fork test 3: Defensible fork (1... Bd6 defends both bishops) -> filtered out
const forkBoardDefensible = new Chess("7k/2b1b3/8/3N4/8/8/8/4K3 b - - 0 1");
const forkMoveDefensible = { from: 'c3', to: 'd5', piece: 'n' };
const forkResDefensible = SituationRecognizer.detectFork(forkBoardDefensible, forkMoveDefensible);
assert.strictEqual(forkResDefensible, null, "Defensible fork should be filtered out");

// Fork test 4: Real pawn fork (d4 forks knight on c5 and bishop on e5) -> detected
const pawnForkBoard = new Chess("r2qk2r/ppp2ppp/8/2n1b3/3P4/8/PPP2PPP/RNBQK2R b KQkq - 0 1");
const pawnForkMove = { from: 'd2', to: 'd4', piece: 'p' };
const pawnForkRes = SituationRecognizer.detectFork(pawnForkBoard, pawnForkMove);
assert(pawnForkRes !== null, "Pawn fork should be detected");
assert.strictEqual(pawnForkRes.type, 'fork');
assert(pawnForkRes.targets.includes('bishop') && pawnForkRes.targets.includes('knight'));

// Fork test 5: Piece attacking two pawns only -> filtered out
const twoPawnsBoard = new Chess("rnbqkbnr/p1pppppp/8/8/Q7/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1");
const twoPawnsMove = { from: 'd1', to: 'a4', piece: 'q' };
const twoPawnsRes = SituationRecognizer.detectFork(twoPawnsBoard, twoPawnsMove);
assert.strictEqual(twoPawnsRes, null, "Two pawns attack should not be considered a tactical fork");

// Pin test: White bishop on c4 pins Black pawn/knight to king on g8
const pinBoard = new Chess("6k1/5p2/8/8/2B5/8/8/4K3 b - - 0 1");
const pinMove = { from: 'f1', to: 'c4', piece: 'b' };
const pinRes = SituationRecognizer.detectPin(pinBoard, pinMove);
assert(pinRes !== null, "Pin should be detected");
assert.strictEqual(pinRes.type, 'pin');
assert.strictEqual(pinRes.pinned, 'pawn');

// Hanging piece blunder: Bishop moves to e6 (attacked by d7 pawn)
const hangBefore = new Chess("rnbqkbnr/pppp1ppp/8/8/8/8/PPPPBPPP/RNBQK1NR w KQkq - 0 1");
const hangMove = { from: 'e2', to: 'e6' };
const hangAfter = new Chess("rnbqkbnr/pppp1ppp/4B3/8/8/8/PPPP1PPP/RNBQK1NR b KQkq - 0 1");
const hangRes = SituationRecognizer.detectHangingPieceBlunder(hangBefore, hangAfter, hangMove);
assert(hangRes !== null, "Hanging piece blunder should be detected");
assert.strictEqual(hangRes.type, 'hanging_piece');
assert.strictEqual(hangRes.piece, 'bishop');

// Threat created: White plays 2. Qh5 attacking undefended e5 pawn
const threatBoard = new Chess("rnbqkbnr/pppp1ppp/8/4p2Q/8/8/PPPP1PPP/RNB1K1NR b KQkq - 1 2");
const threatMove = { from: 'd1', to: 'h5' };
const threats = SituationRecognizer.detectThreatsCreated(threatBoard, threatMove);
assert(threats.length > 0, "Threats should be created by Qh5");
const e5Threat = threats.find(t => t.to === 'e5');
assert(e5Threat !== undefined && e5Threat.is_undefended, "e5 threat should be found");

// Outpost detection
const outpostBoard = new Chess("4k3/4bppp/8/3N4/4P3/8/PPP2PPP/4K3 w - - 0 1");
assert.strictEqual(SituationRecognizer.isTrueOutpost(outpostBoard, 'd5', 'w'), true);

console.log("✓ SituationRecognizer passed!");
console.log("ALL BROWSER MODULE TESTS PASSED SUCCESSFULLY! 🎉");
