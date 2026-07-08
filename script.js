const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

let phase = 'idle'; // idle, dragging, countdown, puzzle, solved, exploding
let captureBox = { x: 0, y: 0, w: 0, h: 0 };
let countdownValue = 3;

let capturedImage = document.createElement('canvas');
let capturedCtx = capturedImage.getContext('2d');

let puzzlePieces = [];
let activePieceIndex = -1;

// --- VARIABEL UNTUK EFEK TEROMPET ULTAH (CONFETTI) ---
let confettiParticles = [];
const confettiColors = ['#FFC700', '#FF0000', '#2E3192', '#41BBC7', '#00FF00'];

const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

function drawNormalText(ctx, text, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

hands.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Background Video
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let pinchPoints = [];
    let isFist = false;
    let handsVisible = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handsVisible = true;

        for (const landmarks of results.multiHandLandmarks) {
            if (phase === 'idle' || phase === 'dragging' || phase === 'countdown') {
                drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
            }

            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            if (distance < 0.05) {
                pinchPoints.push({
                    x: indexTip.x * canvasElement.width,
                    y: indexTip.y * canvasElement.height
                });
            }

            if (phase === 'solved') {
                const wrist = landmarks[0];
                const isCurled = [8, 12, 16, 20].every(tipIdx => {
                    const mcpIdx = tipIdx - 3;
                    const tipDist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
                    const mcpDist = Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y);
                    return tipDist < mcpDist * 0.8;
                });

                if (isCurled) {
                    isFist = true;
                }
            }
        }
    }

    if (phase === 'idle' || phase === 'dragging') {
        if (pinchPoints.length === 2) {
            phase = 'dragging';
            captureBox.x = Math.min(pinchPoints[0].x, pinchPoints[1].x);
            captureBox.y = Math.min(pinchPoints[0].y, pinchPoints[1].y);
            captureBox.w = Math.abs(pinchPoints[0].x - pinchPoints[1].x);
            captureBox.h = Math.abs(pinchPoints[0].y - pinchPoints[1].y);

            canvasCtx.beginPath();
            canvasCtx.setLineDash([10, 10]);
            canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            canvasCtx.lineWidth = 3;
            canvasCtx.rect(captureBox.x, captureBox.y, captureBox.w, captureBox.h);
            canvasCtx.stroke();
            canvasCtx.setLineDash([]);

            canvasCtx.fillStyle = 'white';
            canvasCtx.font = 'bold 16px Arial';
            canvasCtx.textAlign = 'center';
            drawNormalText(canvasCtx, "RELEASE TO CAPTURE", captureBox.x + captureBox.w / 2, captureBox.y - 15);
        }
        else if (phase === 'dragging' && handsVisible && pinchPoints.length === 0) {
            phase = 'countdown';
            startCountdown();
        }
    }

    if (phase === 'countdown') {
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        canvasCtx.lineWidth = 3;
        canvasCtx.rect(captureBox.x, captureBox.y, captureBox.w, captureBox.h);
        canvasCtx.stroke();

        canvasCtx.fillStyle = 'white';
        canvasCtx.font = 'bold 120px Arial';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        drawNormalText(canvasCtx, countdownValue, captureBox.x + captureBox.w / 2, captureBox.y + captureBox.h / 2);
    }

    if (phase === 'puzzle') {
        let isPinching = false;
        let pinchX = 0, pinchY = 0;

        if (handsVisible) {
            const thumbTip = results.multiHandLandmarks[0][4];
            const indexTip = results.multiHandLandmarks[0][8];
            const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

            pinchX = indexTip.x * canvasElement.width;
            pinchY = indexTip.y * canvasElement.height;
            isPinching = distance < 0.05;

            canvasCtx.beginPath();
            canvasCtx.arc(pinchX, pinchY, 10, 0, 2 * Math.PI);
            canvasCtx.fillStyle = isPinching ? '#00FF00' : '#FF0000';
            canvasCtx.fill();
        }

        if (isPinching) {
            if (activePieceIndex === -1) {
                for (let i = puzzlePieces.length - 1; i >= 0; i--) {
                    let p = puzzlePieces[i];
                    if (pinchX > p.x && pinchX < p.x + p.w && pinchY > p.y && pinchY < p.y + p.h) {
                        activePieceIndex = i;
                        break;
                    }
                }
            } else {
                puzzlePieces[activePieceIndex].x = pinchX - (puzzlePieces[activePieceIndex].w / 2);
                puzzlePieces[activePieceIndex].y = pinchY - (puzzlePieces[activePieceIndex].h / 2);
            }
        } else {
            activePieceIndex = -1;
        }

        let correctCount = 0;

        for (let p of puzzlePieces) {
            let distToTarget = Math.hypot(p.x - p.targetX, p.y - p.targetY);

            if (distToTarget < 25 && activePieceIndex !== puzzlePieces.indexOf(p)) {
                p.x = p.targetX;
                p.y = p.targetY;
                correctCount++;
            }

            canvasCtx.drawImage(capturedImage, p.sx, p.sy, p.w, p.h, p.x, p.y, p.w, p.h);

            if (distToTarget >= 25 || activePieceIndex === puzzlePieces.indexOf(p)) {
                canvasCtx.strokeStyle = 'white';
                canvasCtx.lineWidth = 1;
                canvasCtx.strokeRect(p.x, p.y, p.w, p.h);
            }
        }

        if (correctCount === puzzlePieces.length) {
            phase = 'solved';
        }
    }

    if (phase === 'solved') {
        for (let p of puzzlePieces) {
            canvasCtx.drawImage(capturedImage, p.sx, p.sy, p.w, p.h, p.targetX, p.targetY, p.w, p.h);
        }

        canvasCtx.fillStyle = '#00FF00';
        canvasCtx.font = 'bold 30px Arial';
        canvasCtx.textAlign = 'center';
        drawNormalText(canvasCtx, "TINJU UNTUK MENGHANCURKAN!", canvasElement.width / 2, 50);

        if (isFist) {
            phase = 'exploding';
            puzzlePieces = [];
            confettiParticles = [];

            const sRows = 10;
            const sCols = 10;
            const pW = captureBox.w / sCols;
            const pH = captureBox.h / sRows;

            for (let r = 0; r < sRows; r++) {
                for (let c = 0; c < sCols; c++) {
                    puzzlePieces.push({
                        sx: c * pW, sy: r * pH, w: pW, h: pH,
                        x: captureBox.x + (c * pW), y: captureBox.y + (r * pH),
                        vx: (Math.random() - 0.5) * 60,
                        vy: (Math.random() - 1.0) * 60,
                        alpha: 1.0
                    });
                }
            }

            for (let i = 0; i < 150; i++) {
                confettiParticles.push({
                    x: canvasElement.width / 2,
                    y: canvasElement.height,
                    vx: (Math.random() - 0.5) * 40,
                    vy: -(Math.random() * 40 + 15),
                    size: Math.random() * 10 + 5,
                    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
                    rotation: Math.random() * 360,
                    rotSpeed: (Math.random() - 0.5) * 20
                });
            }
        }
    }

    if (phase === 'exploding') {
        let isDone = true;

        for (let p of puzzlePieces) {
            p.vy += 2.5;
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.02;

            if (p.alpha > 0) {
                isDone = false;
                canvasCtx.globalAlpha = Math.max(0, p.alpha);
                canvasCtx.drawImage(capturedImage, p.sx, p.sy, p.w, p.h, p.x, p.y, p.w, p.h);
                canvasCtx.globalAlpha = 1.0;
            }
        }

        for (let c of confettiParticles) {
            c.vy += 1.5;
            c.x += c.vx;
            c.y += c.vy;
            c.rotation += c.rotSpeed;

            canvasCtx.save();
            canvasCtx.translate(c.x, c.y);
            canvasCtx.rotate(c.rotation * Math.PI / 180);
            canvasCtx.fillStyle = c.color;
            canvasCtx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
            canvasCtx.restore();
        }

        canvasCtx.fillStyle = '#FFD700';
        canvasCtx.font = 'bold 80px Arial';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';

        canvasCtx.shadowColor = "black";
        canvasCtx.shadowBlur = 15;
        canvasCtx.shadowOffsetX = 5;
        canvasCtx.shadowOffsetY = 5;

        drawNormalText(canvasCtx, "YOU WIN!", canvasElement.width / 2, canvasElement.height / 2);
        canvasCtx.shadowColor = "transparent";

        if (isDone) {
            phase = 'idle';
        }
    }

    canvasCtx.restore();
});

function startCountdown() {
    countdownValue = 3;
    let timer = setInterval(() => {
        countdownValue--;
        if (countdownValue === 0) {
            clearInterval(timer);
            takePhotoAndCreatePuzzle();
            phase = 'puzzle';
        }
    }, 1000);
}

function takePhotoAndCreatePuzzle() {
    capturedImage.width = captureBox.w;
    capturedImage.height = captureBox.h;

    capturedCtx.drawImage(videoElement, captureBox.x, captureBox.y, captureBox.w, captureBox.h, 0, 0, captureBox.w, captureBox.h);

    const rows = 3;
    const cols = 3;
    const pieceW = captureBox.w / cols;
    const pieceH = captureBox.h / rows;

    puzzlePieces = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            puzzlePieces.push({
                sx: c * pieceW,
                sy: r * pieceH,
                w: pieceW,
                h: pieceH,
                x: Math.random() * (canvasElement.width - pieceW),
                y: Math.random() * (canvasElement.height - pieceH),
                targetX: captureBox.x + (c * pieceW),
                targetY: captureBox.y + (r * pieceH)
            });
        }
    }
}

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

// --- LOGIKA TOMBOL MULAI KAMERA (SUDAH DIPERBAIKI) ---
const startScreen = document.getElementById('start_screen');
const startBtn = document.getElementById('start_btn');

startBtn.addEventListener('click', () => {
    startScreen.style.display = 'none'; // Menyembunyikan layar awal
    camera.start();                    // Menyalakan kamera browser
});