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

// Key Moment identification tests (auto-next skips mistake and inaccuracy)
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'blunder' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'blunder' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'missed win' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'miss' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'brilliant' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'great' }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'blunder', win_prob_loss: 0.25 }), true);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'good move', tags: ['Checkmate'] }), true);
// Mistakes and inaccuracies MUST be skipped
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'mistake' }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'mistake' }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'inaccuracy' }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ detailed_quality: 'inaccuracy' }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'mistake', win_prob_loss: 0.14 }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'good move', detailed_quality: 'book' }), false);
assert.strictEqual(ChessEvaluator.isKeyMoment({ quality: 'good move', detailed_quality: 'good', win_prob_loss: 0.01 }), false);

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

// 4. Missed attack on Queen test: White plays a3 instead of d4 (attacking enemy Queen on e5)
console.log("Testing missed attack on Queen diagnosis...");
const missedQAttackBefore = new Chess("r1b1kbnr/pppp1ppp/2n5/4q3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3");
const missedQAttackPlayed = new Chess("r1b1kbnr/pppp1ppp/2n5/4q3/4P3/P7/1PPP1PPP/RNBQKBNR b KQkq - 0 3");
const missedQAttackDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: missedQAttackBefore,
    boardAfter: missedQAttackPlayed,
    playedMove: { from: 'a2', to: 'a3' },
    bestMove: { from: 'd2', to: 'd4' },
    sanPlayed: 'a3',
    sanBest: 'd4'
});
console.log("Generated missed Queen attack diagnosis:", missedQAttackDiag.explanation);
assert(missedQAttackDiag.tags.includes("Missed Attack"), "Should tag Missed Attack");
assert(missedQAttackDiag.tags.includes("Attack on Queen"), "Should tag Attack on Queen");
assert(missedQAttackDiag.explanation.includes("Queen"), "Should mention Queen in explanation");
assert(missedQAttackDiag.missedChance.includes("Queen"), "missedChance should explicitly mention Queen");
assert(missedQAttackDiag.betterLine.includes("Queen"), "betterLine should mention Queen");

// 5. Missed attack on undefended piece test: White plays h3 instead of b4 attacking undefended knight on a5
console.log("Testing missed attack on undefended piece diagnosis...");
const missedPieceAttackBefore = new Chess("r1b1kbnr/pppp1ppp/8/n3p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
const missedPieceAttackPlayed = new Chess("r1b1kbnr/pppp1ppp/8/n3p3/4P3/5N1P/PPPP1PP1/RNBQKB1R b KQkq - 0 3");
const missedPieceAttackDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: missedPieceAttackBefore,
    boardAfter: missedPieceAttackPlayed,
    playedMove: { from: 'h2', to: 'h3' },
    bestMove: { from: 'b2', to: 'b4' },
    sanPlayed: 'h3',
    sanBest: 'b4'
});
console.log("Generated missed piece attack diagnosis:", missedPieceAttackDiag.explanation);
assert(missedPieceAttackDiag.tags.includes("Missed Attack"), "Should tag Missed Attack");
assert(missedPieceAttackDiag.tags.includes("Attacking Piece"), "Should tag Attacking Piece");
assert(missedPieceAttackDiag.explanation.includes("knight"), "Should mention knight in explanation");
assert(missedPieceAttackDiag.missedChance.includes("knight"), "missedChance should mention knight");

// 6. Multi-ply combination test: PV material gain winning Queen
console.log("Testing combination PV material gain...");
const comboBefore = new Chess("4k3/8/8/8/3q4/8/3R4/4K3 w - - 0 1");
const comboPlayed = new Chess("4k3/8/8/8/3q4/8/3R4/5K2 b - - 1 1");
const comboDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: comboBefore,
    boardAfter: comboPlayed,
    playedMove: { from: 'e1', to: 'f1' },
    bestMove: { from: 'd2', to: 'd4' },
    sanPlayed: 'Kf1',
    sanBest: 'Rxd4',
    bestPv: ['d2d4']
});
console.log("Generated combination diagnosis:", comboDiag.explanation);
assert(comboDiag.tags.includes("Winning Material"), "Should tag Winning Material");
assert(comboDiag.tags.includes("Missed Tactic"), "Should tag Missed Tactic");
assert(comboDiag.explanation.includes("Queen"), "Should mention Queen in explanation");
assert(comboDiag.betterLine.includes("Queen"), "betterLine should mention winning the Queen");

// 7. Board control dominance tests
console.log("Testing board control dominance detection...");
const pawnCenterBefore = new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
const pawnCenterAfter = new Chess("rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2");
const centerDuo = SituationRecognizer.detectBoardControlDominance(pawnCenterBefore, pawnCenterAfter, { from: 'd2', to: 'd4' });
assert(centerDuo !== null, "Should detect pawn center duo");
assert.strictEqual(centerDuo.type, 'pawn_center_duo', "Should be pawn_center_duo");
assert(centerDuo.tags.includes("Center Control"), "Should have Center Control tag");

const rook7thBefore = new Chess("4k3/8/8/8/8/8/8/3R1K2 w - - 0 1");
const rook7thAfter = new Chess("4k3/3R4/8/8/8/8/8/5K2 b - - 1 1");
const rook7th = SituationRecognizer.detectBoardControlDominance(rook7thBefore, rook7thAfter, { from: 'd1', to: 'd7' });
assert(rook7th !== null, "Should detect 7th rank infiltration");
assert.strictEqual(rook7th.type, 'seventh_rank', "Should be seventh_rank");

// 8. King safety & castling rights detection tests
console.log("Testing king safety & castling rights logic...");
const startPos = new Chess();
assert.strictEqual(SituationRecognizer.hasCastlingRights(startPos, 'w'), true, "White should have castling rights at start");
assert.strictEqual(SituationRecognizer.hasCastlingRights(startPos, 'b'), true, "Black should have castling rights at start");

// King forfeiting castling rights on move 2: 1. e4 e5 2. Ke2
const fenBeforeKe2 = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
const fenAfterKe2 = new Chess("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPKPPP/RNBQ1BNR b kq - 1 2");
const forfeitFlaw = SituationRecognizer.detectKingSafetyFlaw(fenBeforeKe2, fenAfterKe2, { from: 'e1', to: 'e2' });
assert(forfeitFlaw !== null && forfeitFlaw.includes("forfeiting castling rights"), "Should detect forfeiting castling rights when king moves from e1 with rights available");

// King move in endgame (move 49 Kf4??) where castling is long gone:
const endgameBefore = new Chess('4k3/8/8/5RK1/1r2n3/6P1/8/8 w - - 0 49');
const endgameAfter = new Chess('4k3/8/8/5R2/1r2nK2/6P1/8/8 b - - 1 49');
assert.strictEqual(SituationRecognizer.hasCastlingRights(endgameBefore, 'w'), false, "White should not have castling rights in endgame");
const endgameFlaw = SituationRecognizer.detectKingSafetyFlaw(endgameBefore, endgameAfter, { from: 'g5', to: 'f4' });
assert.strictEqual(endgameFlaw, null, "King move in endgame must NOT be flagged as forfeiting castling rights");

const endgameDiag = SituationRecognizer.explainBlunderOrMistake({
    boardBefore: endgameBefore,
    boardAfter: endgameAfter,
    playedMove: { from: 'g5', to: 'f4' },
    bestMove: { from: 'g5', to: 'g4' },
    refutationMove: { from: 'e4', to: 'd6' },
    sanPlayed: 'Kf4',
    sanBest: 'Kg4',
    sanRef: 'Nd6+',
    refPv: ['e4d6', 'f4e5', 'd6f5']
});
console.log("Endgame diagnosis explanation:", endgameDiag.explanation);
assert(!endgameDiag.explanation.includes("castling"), "Endgame diagnosis must not mention castling");
assert(!endgameDiag.explanation.includes("a a Rook"), "Must not have duplicate 'a a' article");
assert(!endgameDiag.tags.includes("King Safety"), "Endgame blunder must not have King Safety tag");
assert(endgameDiag.tags.includes("Losing Material"), "Should tag Losing Material");
assert(endgameDiag.tags.includes("Discovered Attack"), "Should tag Discovered Attack");

// 9. Structured breakdown properties verification
console.log("Testing structured breakdown properties...");
assert(userDiag.flaw !== undefined && userDiag.flaw !== null, "Should have flaw property");
assert(userDiag.betterLine !== undefined && userDiag.betterLine !== null, "Should have betterLine property");
assert(missedForkDiag.missedChance !== undefined && missedForkDiag.missedChance !== null, "Should have missedChance property");
assert(missedForkDiag.betterLine !== undefined && missedForkDiag.betterLine !== null, "Should have betterLine property");

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
console.log("✓ AnalysisCache passed!");

// Test index.html banner markup and styling integrity
console.log("Testing index.html banner markup & styling integrity...");
const fs = require('fs');
const indexHtml = fs.readFileSync('/home/king/code/whyblunder/index.html', 'utf8');

assert(!indexHtml.includes("Missed Opportunity"), "index.html should not have old 'Missed Opportunity' label");
assert(indexHtml.includes("badgeLabel = isMissedWin ? 'MISSED WIN' : 'MISSED'"), "index.html should use MISSED and MISSED WIN labels");
assert(indexHtml.includes(".diag-missed-banner {"), "index.html must include .diag-missed-banner CSS");
assert(indexHtml.includes(".diag-missed-text {"), "index.html must include .diag-missed-text CSS");
assert(indexHtml.includes("align-items: flex-start;"), "index.html banner must align to flex-start for multi-line text");
assert(indexHtml.includes("badge-missed-win"), "index.html must support badge-missed-win");
console.log("✓ Banner markup & styling integrity passed!");

// 5. Material Difference Calculation & UI Integrity tests
console.log("Testing Material Difference Calculation & UI Integrity...");

// Start position
const matStart = ChessEvaluator.calculateMaterialDifference('start');
assert.strictEqual(matStart.whiteScore, 39);
assert.strictEqual(matStart.blackScore, 39);
assert.strictEqual(matStart.scoreDiff, 0);
assert.deepStrictEqual(matStart.whitePieces, []);
assert.deepStrictEqual(matStart.blackPieces, []);

// Position with White up a pawn: 1. e4 d5 2. exd5
const fenWhiteUpPawn = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
const matWhiteUpPawn = ChessEvaluator.calculateMaterialDifference(fenWhiteUpPawn);
assert.strictEqual(matWhiteUpPawn.whiteScore, 39);
assert.strictEqual(matWhiteUpPawn.blackScore, 38);
assert.strictEqual(matWhiteUpPawn.scoreDiff, 1);
assert.deepStrictEqual(matWhiteUpPawn.whitePieces, [{ type: 'p', count: 1 }]);
assert.deepStrictEqual(matWhiteUpPawn.blackPieces, []);

// Position with piece imbalance: White has Bishop (+3), Black has Knight (+3)
// 8 pawns, 2 rooks, 1 queen each; White: 2 Bishops, 1 Knight; Black: 1 Bishop, 2 Knights
const fenImbalance = 'rn1qkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 1';
const matImbalance = ChessEvaluator.calculateMaterialDifference(fenImbalance);
assert.strictEqual(matImbalance.scoreDiff, 0);
assert.deepStrictEqual(matImbalance.whitePieces, [{ type: 'b', count: 1 }]);
assert.deepStrictEqual(matImbalance.blackPieces, [{ type: 'n', count: 1 }]);

// Position with Black up a Queen:
const fenBlackUpQueen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'; // White missing queen
const matBlackUpQueen = ChessEvaluator.calculateMaterialDifference(fenBlackUpQueen);
assert.strictEqual(matBlackUpQueen.whiteScore, 30);
assert.strictEqual(matBlackUpQueen.blackScore, 39);
assert.strictEqual(matBlackUpQueen.scoreDiff, -9);
assert.deepStrictEqual(matBlackUpQueen.whitePieces, []);
assert.deepStrictEqual(matBlackUpQueen.blackPieces, [{ type: 'q', count: 1 }]);

// Position with multiple extra pawns and a promoted queen
const fenPromoted = '2q1k3/8/8/8/8/8/8/2Q1K3 w - - 0 1'; // White 1Q, Black 1Q, King each
const matEqualKingsQueens = ChessEvaluator.calculateMaterialDifference(fenPromoted);
assert.strictEqual(matEqualKingsQueens.whiteScore, 9);
assert.strictEqual(matEqualKingsQueens.blackScore, 9);
assert.strictEqual(matEqualKingsQueens.scoreDiff, 0);

// Test variation step sequence: 1. e4 e5 2. Qh5 Nc6 3. Qxf7# (Scholar's mate)
const simChess = new Chess();
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('e4');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('e5');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('Qh5');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('Nc6');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('Bc4');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
simChess.move('Nf6');
assert.strictEqual(ChessEvaluator.calculateMaterialDifference(simChess.fen()).scoreDiff, 0);
// Queen captures pawn on f7
simChess.move('Qxf7#');
const matMate = ChessEvaluator.calculateMaterialDifference(simChess.fen());
assert.strictEqual(matMate.scoreDiff, 1);
assert.deepStrictEqual(matMate.whitePieces, [{ type: 'p', count: 1 }]);
assert.deepStrictEqual(matMate.blackPieces, []);

// HTML & CSS markup integrity for material difference
assert(indexHtml.includes('id="topMaterialDisplay"'), "index.html must include #topMaterialDisplay DOM element");
assert(indexHtml.includes('id="bottomMaterialDisplay"'), "index.html must include #bottomMaterialDisplay DOM element");
assert(indexHtml.includes('.player-material-display'), "index.html must include .player-material-display CSS");
assert(indexHtml.includes('.material-piece-icon'), "index.html must include .material-piece-icon CSS");
assert(indexHtml.includes('.material-score-badge'), "index.html must include .material-score-badge CSS");
assert(indexHtml.includes('updateMaterialDifference(chess.fen())'), "index.html must call updateMaterialDifference on board move changes");
assert(indexHtml.includes('updateMaterialDifference(targetFen)'), "index.html must call updateMaterialDifference on variation step change");
assert(indexHtml.includes('updateMaterialDifference()'), "index.html must call updateMaterialDifference on orientation flip");
console.log("✓ Material difference tests passed!");

// 6. Interactive Variation Navigation & Alt Line Integrity tests
console.log("Testing Variation Navigation & Interactive Alt Lines...");

// Test PV parser function directly
function parsePrincipalVariationTest(pvString, startingFen) {
    if (!pvString || typeof pvString !== 'string') return [];
    const cleanPv = pvString
        .replace(/[♔♚]/g, 'K')
        .replace(/[♕♛]/g, 'Q')
        .replace(/[♖♜]/g, 'R')
        .replace(/[♗♝]/g, 'B')
        .replace(/[♘♞]/g, 'N')
        .replace(/[♙♟]/g, '')
        .replace(/[\u2654-\u265F]/g, '')
        .trim();
    const testChess = new Chess(startingFen);
    const tokens = cleanPv.split(/\s+/);
    const moves = [];

    let currentMoveNum = 1;
    if (startingFen && startingFen !== 'start') {
        const parts = startingFen.split(' ');
        if (parts.length >= 6) {
            currentMoveNum = parseInt(parts[5], 10) || 1;
        }
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token) continue;
        if (/^\d+\.+$/.test(token) || /^\d+\.\.\.$/.test(token)) {
            const numMatch = token.match(/^(\d+)/);
            if (numMatch) currentMoveNum = parseInt(numMatch[1], 10);
            continue;
        }

        const isWhite = (testChess.turn() === 'w');
        const moveNum = currentMoveNum;
        const fenBefore = testChess.fen();

        let cleanSan = token
            .replace(/[♔♚]/g, 'K')
            .replace(/[♕♛]/g, 'Q')
            .replace(/[♖♜]/g, 'R')
            .replace(/[♗♝]/g, 'B')
            .replace(/[♘♞]/g, 'N')
            .replace(/[♙♟]/g, '')
            .replace(/[\u2654-\u265F?!+#]/g, '')
            .trim();
        let moveRes = null;
        try {
            moveRes = testChess.move(cleanSan);
        } catch (e) {
            try {
                moveRes = testChess.move(token);
            } catch (e2) {}
        }

        if (moveRes) {
            moves.push({
                from: moveRes.from,
                to: moveRes.to,
                promotion: moveRes.promotion,
                san: moveRes.san || token,
                fen: testChess.fen(),
                fenBefore: fenBefore,
                isWhite: isWhite,
                moveNumber: moveNum,
                stepIndex: moves.length
            });
            if (!isWhite) currentMoveNum++;
        }
    }
    return moves;
}

// Test parsing standard PV string
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const parsedPv = parsePrincipalVariationTest("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6", startFen);
assert.strictEqual(parsedPv.length, 6);
assert.strictEqual(parsedPv[0].san, 'e4');
assert.strictEqual(parsedPv[0].isWhite, true);
assert.strictEqual(parsedPv[0].moveNumber, 1);
assert.strictEqual(parsedPv[0].stepIndex, 0);

assert.strictEqual(parsedPv[1].san, 'e5');
assert.strictEqual(parsedPv[1].isWhite, false);
assert.strictEqual(parsedPv[1].moveNumber, 1);
assert.strictEqual(parsedPv[1].stepIndex, 1);

assert.strictEqual(parsedPv[5].san, 'a6');
assert.strictEqual(parsedPv[5].isWhite, false);
assert.strictEqual(parsedPv[5].moveNumber, 3);
assert.strictEqual(parsedPv[5].stepIndex, 5);

// Test parsing PV with unicode figurines (ensure stripping works seamlessly)
const pvWithFigurines = "1. ♘f3 d5 2. d4 ♞f6";
const parsedFigurines = parsePrincipalVariationTest(pvWithFigurines, startFen);
assert.strictEqual(parsedFigurines.length, 4);
assert.strictEqual(parsedFigurines[0].san, 'Nf3');
assert.strictEqual(parsedFigurines[1].san, 'd5');
assert.strictEqual(parsedFigurines[2].san, 'd4');
assert.strictEqual(parsedFigurines[3].san, 'Nf6');

// Test HTML and CSS markup in index.html for variation navigation
assert(indexHtml.includes('.var-move-btn'), "index.html must include .var-move-btn CSS");
assert(indexHtml.includes('.var-move-num'), "index.html must include .var-move-num CSS");
assert(indexHtml.includes('.var-btn-refutation'), "index.html must include .var-btn-refutation CSS");
assert(indexHtml.includes('.var-btn-better'), "index.html must include .var-btn-better CSS");
assert(indexHtml.includes('.var-nav-btn-group'), "index.html must include .var-nav-btn-group CSS");

// Test Under-board banner controls markup
assert(indexHtml.includes('id="variationBanner"'), "index.html must include #variationBanner");
assert(indexHtml.includes('id="btnVarFirst"'), "index.html must include #btnVarFirst");
assert(indexHtml.includes('id="btnVarPrev"'), "index.html must include #btnVarPrev");
assert(indexHtml.includes('id="btnVarPlay"'), "index.html must include #btnVarPlay");
assert(indexHtml.includes('id="btnVarNext"'), "index.html must include #btnVarNext");
assert(indexHtml.includes('id="btnVarLast"'), "index.html must include #btnVarLast");
assert(indexHtml.includes('id="btnReturnMainLine"'), "index.html must include #btnReturnMainLine");

// Test JavaScript variation engine functions
assert(indexHtml.includes('function parsePrincipalVariation('), "index.html must include parsePrincipalVariation");
assert(indexHtml.includes('function getVariationData('), "index.html must include getVariationData");
assert(indexHtml.includes('function renderVariationLineHtml('), "index.html must include renderVariationLineHtml");
assert(indexHtml.includes('function jumpToVariationStep('), "index.html must include jumpToVariationStep");
assert(indexHtml.includes('function stepVariationForward('), "index.html must include stepVariationForward");
assert(indexHtml.includes('function stepVariationBackward('), "index.html must include stepVariationBackward");
assert(indexHtml.includes('function stepVariationFirst('), "index.html must include stepVariationFirst");
assert(indexHtml.includes('function stepVariationLast('), "index.html must include stepVariationLast");
assert(indexHtml.includes('function toggleVariationPlayPause('), "index.html must include toggleVariationPlayPause");
assert(indexHtml.includes('function stopVariationAnimationTimer('), "index.html must include stopVariationAnimationTimer");
assert(indexHtml.includes('function playVariation('), "index.html must include playVariation");

// Verify event listener bindings for manual vs auto-play separation
assert(indexHtml.includes('jumpToVariationStep(moveIdx, type, step, false)'), "Clicking move tokens must jump directly without auto-play");
assert(indexHtml.includes("playVariation(idx, 'better')") && indexHtml.includes("playVariation(idx, 'refutation')"), "Clicking play button must trigger playVariation");

// Verify keyboard navigation delegation
assert(indexHtml.includes('if (isInVariationMode && activeVariation) {') && indexHtml.includes('stepVariationBackward()'), "Left arrow must step backward in variation mode");
assert(indexHtml.includes('if (isInVariationMode && activeVariation) {') && indexHtml.includes('stepVariationForward()'), "Right arrow must step forward in variation mode");
assert(indexHtml.includes('if (isInVariationMode && activeVariation) {') && indexHtml.includes('stepVariationFirst()'), "Home key must jump to first step in variation mode");
assert(indexHtml.includes('if (isInVariationMode && activeVariation) {') && indexHtml.includes('stepVariationLast()'), "End key must jump to last step in variation mode");
assert(indexHtml.includes('toggleVariationPlayPause()'), "P key and toolbar play button must toggle play/pause in variation mode");

console.log("✓ Variation Navigation & Interactive Alt Lines passed!");

// -------------------------------------------------------------
// 10. Mobile UI Rework & Layout Integrity Tests
// -------------------------------------------------------------
console.log("Testing Mobile UI Rework & Layout Integrity...");

// Verify mobile DOM elements exist
const mobileIds = [
    'mobileEvalBar', 'mobileEvalWhite', 'mobileEvalPill',
    'mobileMoveTicker', 'tickerScroll', 'tickerNavLeft', 'tickerNavRight',
    'mobileNavToolbar', 'mobileBtnPrev', 'mobileBtnNext', 'mobileBtnKey',
    'mobileKeyBadge', 'mobileNavSan', 'mobileNavCount', 'mobileBtnFlip',
    'mobileMovesOffcanvas', 'mobileMovesOffcanvasBody', 'mobileSheetMoveCount'
];
mobileIds.forEach(id => {
    assert(indexHtml.includes(`id="${id}"`), `index.html must include #${id}`);
});

// Verify mobile CSS rules
assert(indexHtml.includes('.mobile-eval-bar'), "Must include .mobile-eval-bar CSS");
assert(indexHtml.includes('.mobile-move-ticker'), "Must include .mobile-move-ticker CSS");
assert(indexHtml.includes('.ticker-chip'), "Must include .ticker-chip CSS");
assert(indexHtml.includes('.mobile-nav-toolbar'), "Must include .mobile-nav-toolbar CSS");
assert(indexHtml.includes('.mobile-nav-capsule'), "Must include .mobile-nav-capsule CSS");
assert(indexHtml.includes('.mobile-moves-offcanvas'), "Must include .mobile-moves-offcanvas CSS");
assert(indexHtml.includes('@media (max-width: 991px)'), "Must include @media (max-width: 991px)");
assert(indexHtml.includes('overflow-y: auto !important;'), "Move diagnostic panel must be scrollable on mobile");

// Verify mobile JavaScript functions and handlers
assert(indexHtml.includes('function renderMobileMoveTicker('), "Must include renderMobileMoveTicker");
assert(indexHtml.includes('function syncMobileOffcanvas('), "Must include syncMobileOffcanvas");
assert(indexHtml.includes('mobileBtnPrev.addEventListener'), "Must bind mobileBtnPrev click listener");
assert(indexHtml.includes('mobileBtnNext.addEventListener'), "Must bind mobileBtnNext click listener");
assert(indexHtml.includes('mobileBtnKey.addEventListener'), "Must bind mobileBtnKey click listener");
assert(indexHtml.includes('mobileBtnFlip.addEventListener'), "Must bind mobileBtnFlip click listener");

console.log("✓ Mobile UI Rework & Layout Integrity passed!");

console.log("ALL BROWSER MODULE TESTS PASSED SUCCESSFULLY! 🎉");



