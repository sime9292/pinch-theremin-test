// V3: the musical cursor is the midpoint between thumb and index, not the middle finger.
state.noteMidpoint = null;

const midpointStyleV3 = document.createElement("style");
midpointStyleV3.textContent = `
  .v3-midpoint-badge{position:absolute;z-index:8;right:8px;top:calc(env(safe-area-inset-top) + 176px);max-width:118px;padding:7px 8px;border-radius:13px;border:1px solid rgba(255,214,138,.24);background:rgba(5,9,17,.68);font-size:8px;line-height:1.3;font-weight:900;text-align:center;color:#ffe8ad;pointer-events:none}
  @media(max-width:420px){.v3-midpoint-badge{top:calc(env(safe-area-inset-top) + 164px);max-width:102px}}
`;
document.head.appendChild(midpointStyleV3);

const midpointBadgeV3 = document.createElement("div");
midpointBadgeV3.className = "v3-midpoint-badge";
midpointBadgeV3.innerHTML = "C = CENTRO TRA POLLICE E INDICE<br>IL PUNTO C SCEGLIE LA NOTA";
$("app").appendChild(midpointBadgeV3);

if (typeof v2GestureHelp !== "undefined") {
  v2GestureHelp.innerHTML = "P = POLLICE · I = INDICE · C = CENTRO P/I<br>↻ RUOTA IL CENTRO C PER IL BEND";
}

function midpointV3(hand) {
  const thumb = hand[4];
  const index = hand[8];
  return {
    x: (thumb.x + index.x) / 2,
    y: (thumb.y + index.y) / 2,
    z: ((thumb.z || 0) + (index.z || 0)) / 2
  };
}

// Bend is referenced to the wrist-to-midpoint axis.
v2PlaneTilt = function(hand) {
  const wrist = hand[0];
  const center = midpointV3(hand);
  const mirror = $("mirrorToggle").checked;
  const wx = mirror ? 1 - wrist.x : wrist.x;
  const cx = mirror ? 1 - center.x : center.x;
  return Math.atan2(cx - wx, Math.max(.001, wrist.y - center.y)) * 180 / Math.PI;
};

// Depth rotation also uses the midpoint between thumb and index.
v2DepthRoll = function(hand) {
  const center = midpointV3(hand);
  return center.z - (hand[0].z || 0);
};

function drawMidpointV3(screenPoint, active) {
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.56)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#ffd68a" : "#b89cff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "white";
  ctx.stroke();
  ctx.font = "900 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,.8)";
  ctx.strokeText("C", screenPoint.x, screenPoint.y - 18);
  ctx.fillStyle = "white";
  ctx.fillText("C", screenPoint.x, screenPoint.y - 18);
}

drawOverlay = function() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!state.hand) return;

  ctx.lineWidth = 2.1;
  ctx.strokeStyle = "rgba(126,232,255,.70)";
  CONNECTIONS.forEach(([a, b]) => {
    const p1 = videoPoint(state.hand[a]);
    const p2 = videoPoint(state.hand[b]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  });

  state.hand.forEach((point) => {
    const p = videoPoint(point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.fill();
  });

  const pinchA = videoPoint(state.hand[4]);
  const pinchB = videoPoint(state.hand[8]);
  const centerLandmark = midpointV3(state.hand);
  state.noteMidpoint = centerLandmark;
  const center = videoPoint(centerLandmark);
  const wrist = videoPoint(state.hand[0]);

  // Pinch segment.
  ctx.lineWidth = 4;
  ctx.strokeStyle = state.pinch ? "#ffd68a" : "rgba(126,232,255,.85)";
  ctx.beginPath();
  ctx.moveTo(pinchA.x, pinchA.y);
  ctx.lineTo(pinchB.x, pinchB.y);
  ctx.stroke();

  // Wrist-to-musical-cursor axis used for bend.
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(184,156,255,.88)";
  ctx.beginPath();
  ctx.moveTo(wrist.x, wrist.y);
  ctx.lineTo(center.x, center.y);
  ctx.stroke();

  // Horizontal guide showing the exact height used to choose the note.
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = state.pinch ? "rgba(255,214,138,.72)" : "rgba(184,156,255,.62)";
  ctx.beginPath();
  ctx.moveTo(center.x + 12, center.y);
  ctx.lineTo(innerWidth - 8, center.y);
  ctx.stroke();
  ctx.restore();

  v2DrawPoint(4, 7, state.pinch ? "#ffd68a" : "#7ee8ff", "P");
  v2DrawPoint(8, 7, state.pinch ? "#ffd68a" : "#7ee8ff", "I");
  drawMidpointV3(center, state.pinch);
  v2DrawPoint(0, 5, "#ffffff");
};
