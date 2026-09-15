/**
 * test_browser_modules.js - Unit tests for client-side JS analysis modules in Node.
 */
const assert = require('assert');
const Chess = require('./js/chess.min.js').Chess || require('./js/chess.min.js');
const ChessEvaluator = require('./js/chess-evaluator.js');
const OpeningDetector = require('./js/opening-detector.js');
const SituationRecognizer = require('./js/situation-recognizer.js');

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

// Skewer detection: White Rook on a1 moves to e1, skewering Black King on e4 and Queen on e8
const skewerBoard = new Chess("4q3/8/8/8/4k3/8/1K6/R7 w - - 0 1");
const skewerMove = { from: 'a1', to: 'e1', piece: 'r' };
skewerBoard.move(skewerMove);
const skewerRes = SituationRecognizer.detectSkewer(skewerBoard, skewerMove);
assert(skewerRes !== null, "Skewer should be detected");
assert.strictEqual(skewerRes.type, 'skewer');
assert.strictEqual(skewerRes.front, 'king');
assert.strictEqual(skewerRes.back, 'queen');

// Discovered check detection: White Queen on d1, White Knight on d4 moves to e6, revealing check from Queen to King on d8
const discBefore = new Chess("3k4/8/8/8/3N4/8/8/3QK3 w - - 0 1");
const discMove = { from: 'd4', to: 'e6', piece: 'n' };
const discAfter = new Chess("3k4/8/4N3/8/8/8/8/3QK3 b - - 1 1");
const discRes = SituationRecognizer.detectDiscoveredAttack(discBefore, discAfter, discMove);
assert(discRes !== null, "Discovered attack should be detected");
assert.strictEqual(discRes.type, 'discovered_check');

// Center strike detection: White plays 2. d4 challenging e5 pawn
const centerBoard = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
const centerMove = { from: 'd2', to: 'd4', piece: 'p' };
const centerRes = SituationRecognizer.detectCenterStrike(centerBoard, centerMove);
assert(centerRes !== null, "Center strike should be detected");
assert(centerRes.description.includes("d4") && centerRes.description.includes("challenge"));

// Minor development detection: Black plays Nc6 from b8
const devBoard = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
const devMove = { from: 'b8', to: 'c6', piece: 'n' };
const devRes = SituationRecognizer.detectMinorDevelopment(devBoard, devMove);
assert(devRes !== null, "Minor development should be detected");
assert(devRes.includes("knight to an active square"));

// USER SCENARIO TEST: Black played d6, White refutation d4, recommended Nc6
// Must NOT say "maintains optimal piece activity and board control"
console.log("Testing user scenario (d6 allows d4, better was Nc6)...");
const userBefore = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2");
const userAfter = new Chess("rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3");
const userDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: userBefore,
    boardAfter: userAfter,
    playedMove: { from: 'd7', to: 'd6' },
    bestMove: { from: 'b8', to: 'c6' },
    refutationMove: { from: 'd2', to: 'd4' },
    sanPlayed: 'd6',
    sanBest: 'Nc6',
    sanRef: 'd4'
});
console.log("Generated diagnosis:", userDiag.explanation);
assert(!userDiag.explanation.includes("maintains optimal piece activity and board control"), "Must not use old repetitive phrase");
assert(userDiag.explanation.includes("d6"), "Must mention played move d6");
assert(userDiag.explanation.includes("d4"), "Must mention refutation d4");
assert(userDiag.explanation.includes("Nc6"), "Must mention better move Nc6");
assert(userDiag.explanation.includes("center"), "Must mention central control / center");
assert(userDiag.tags.includes("Center Control"), "Must have Center Control tag");
assert(userDiag.tags.includes("Development"), "Must have Development tag");

// Missed tactical fork test: White plays a3 instead of Nc7+ (forking King and Rook)
console.log("Testing missed tactical fork diagnosis...");
const missedForkBefore = new Chess("r3k3/8/8/3N4/8/8/PPPPPPPP/R3K3 w - - 0 1");
const missedForkPlayed = new Chess("r3k3/8/8/3N4/8/P7/1PPPPPPP/R3K3 b - - 0 1");
const missedForkDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: missedForkBefore,
    boardAfter: missedForkPlayed,
    playedMove: { from: 'a2', to: 'a3' },
    bestMove: { from: 'd5', to: 'c7' },
    sanPlayed: 'a3',
    sanBest: 'Nc7+'
});
console.log("Generated missed tactic diagnosis:", missedForkDiag.explanation);
assert(missedForkDiag.tags.includes("Missed Tactic"), "Should tag Missed Tactic");
assert(missedForkDiag.tags.includes("Tactical Fork"), "Should tag Tactical Fork");
assert(missedForkDiag.explanation.includes("overlooks a tactical opportunity") || missedForkDiag.explanation.includes("forks"), "Should explain missed tactical opportunity");

// Tactical blunder test: Player leaves bishop hanging on e6
console.log("Testing hanging piece blunder diagnosis...");
const hangBlunderBefore = new Chess("rnbqkbnr/pppp1ppp/8/8/8/8/PPPPBPPP/RNBQK1NR w KQkq - 0 1");
const hangBlunderAfter = new Chess("rnbqkbnr/pppp1ppp/4B3/8/8/8/PPPP1PPP/RNBQK1NR b KQkq - 1 1");
const hangBlunderDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: hangBlunderBefore,
    boardAfter: hangBlunderAfter,
    playedMove: { from: 'e2', to: 'e6' },
    bestMove: { from: 'e2', to: 'c4' },
    refutationMove: { from: 'd7', to: 'e6' },
    sanPlayed: 'Be6',
    sanBest: 'Bc4',
    sanRef: 'dxe6'
});
console.log("Generated hanging piece diagnosis:", hangBlunderDiag.explanation);
assert(hangBlunderDiag.tags.includes("Hanging Piece"), "Should tag Hanging Piece");
assert(hangBlunderDiag.explanation.includes("leaves the bishop hanging"), "Should explain hanging bishop");

console.log("✓ SituationRecognizer passed!");

// 4. AnalysisCache tests
console.log("Testing AnalysisCache...");
const AnalysisCacheModule = require('./js/analysis-cache.js');

// Mock localStorage
const mockStorage = (function() {
    let store = {};
    return {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; }
    };
})();

const cache = new AnalysisCacheModule.AnalysisCache(mockStorage, 5);
cache.clear();

const testPgn1 = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5";
const testResult1 = {
    game_info: { white: 'Alice', black: 'Bob' },
    moves: [{ move: 'e4', quality: 'good move' }]
};

// Test basic set & get
assert.strictEqual(cache.get(testPgn1), null, "Initial cache should be empty");
cache.set(testPgn1, 18, testResult1);
const hit1 = cache.get(testPgn1, 18);
assert(hit1 !== null, "Should retrieve cached game");
assert.strictEqual(hit1.game_info.white, 'Alice');
assert.strictEqual(hit1.moves.length, 1);
assert.strictEqual(cache.count(), 1);

// Test PGN with comments / whitespace variation
const testPgn1WithComments = "1. e4 { best move } 1... e5 \n 2. Nf3 Nc6 3. Bc4 Bc5";
const hit1Fuzzy = cache.get(testPgn1WithComments, 18);
assert(hit1Fuzzy !== null, "Fuzzy comment/whitespace PGN should match cache");

// Test depth threshold
const hitDepth22 = cache.get(testPgn1, 22);
assert.strictEqual(hitDepth22, null, "Requesting higher depth than cached should return null");

// Test Lichess ID matching
const lichessUrl = "https://lichess.org/Qa7FJNk2";
cache.set(lichessUrl, 18, {
    game_info: { white: 'Morphy', black: 'Duke' },
    moves: [{ move: 'e4', quality: 'good move' }]
}, 'Qa7FJNk2');

const hitLichessById = cache.get('Qa7FJNk2', 18);
assert(hitLichessById !== null, "Should retrieve by Lichess ID");
assert.strictEqual(hitLichessById.game_info.white, 'Morphy');

const hitLichessByUrl = cache.get('https://lichess.org/Qa7FJNk2', 18);
assert(hitLichessByUrl !== null, "Should retrieve by full Lichess URL");

// Test 5-game LRU eviction limit
cache.clear();
for (let i = 1; i <= 6; i++) {
    cache.set(`1. e4 c${i}`, 18, {
        game_info: { white: `Player ${i}`, black: 'Opp' },
        moves: [{ move: 'e4', quality: 'good move' }]
    });
}
assert.strictEqual(cache.count(), 5, "Cache should cap at 5 games");
assert.strictEqual(cache.get("1. e4 c1", 18), null, "Game 1 should be evicted (LRU)");
assert(cache.get("1. e4 c6", 18) !== null, "Game 6 (newest) should exist in cache");
assert(cache.get("1. e4 c2", 18) !== null, "Game 2 should still exist in cache");

// Accessing Game 2 bumps it to most recent; now adding Game 7 should evict Game 3, NOT Game 2
cache.set("1. e4 c7", 18, {
    game_info: { white: 'Player 7', black: 'Opp' },
    moves: [{ move: 'e4', quality: 'good move' }]
});
assert.strictEqual(cache.count(), 5);
assert(cache.get("1. e4 c2", 18) !== null, "Game 2 was bumped to MRU, should not be evicted");
assert.strictEqual(cache.get("1. e4 c3", 18), null, "Game 3 should have been evicted instead");

console.log("✓ AnalysisCache passed!");
console.log("ALL BROWSER MODULE TESTS PASSED SUCCESSFULLY! 🎉");

