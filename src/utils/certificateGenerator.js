function drawCurvedPerimeterText(ctx, text, cx, cy, radius) {
  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const chars = text.split('');
  const anglePerChar = 0.118;
  const totalAngle = (chars.length - 1) * anglePerChar;
  const startAngle = -Math.PI / 2 - totalAngle / 2;

  chars.forEach((ch, idx) => {
    const angle = startAngle + idx * anglePerChar;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function drawMissionPatch(ctx, cx, cy, scale = 1.95) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Outer aerospace ring (#e2e8f0)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 57, 0, Math.PI * 2);
  ctx.stroke();

  // Mars rust accent inner ring (#c2410c)
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.arc(0, 0, 52.5, 0, Math.PI * 2);
  ctx.stroke();

  // Inner crest boundary
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.stroke();

  // Curved perimeter text
  drawCurvedPerimeterText(
    ctx,
    'ARES-V MISSION DIRECTORATE \u2022 MARS SURFACE EVA',
    0,
    0,
    45.5
  );

  // Subtle trajectory arc lines
  ctx.save();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2.5, 2.5]);
  ctx.beginPath();
  ctx.moveTo(-33, 12);
  ctx.quadraticCurveTo(-2, -34, 33, -12);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-36, 4);
  ctx.quadraticCurveTo(0, -24, 35, -2);
  ctx.stroke();

  // Minimalist Mount Sharp topographic contour peaks
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-32, 19);
  ctx.lineTo(-15, -5);
  ctx.lineTo(-5, 4);
  ctx.lineTo(6, -16);
  ctx.lineTo(22, 10);
  ctx.lineTo(32, 19);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-25, 19);
  ctx.lineTo(-13, 3);
  ctx.lineTo(-4, 10);
  ctx.lineTo(6, -6);
  ctx.lineTo(17, 12);
  ctx.lineTo(26, 19);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-35, 19);
  ctx.lineTo(35, 19);
  ctx.stroke();

  // 4-point orbital navigation star
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(6, -32);
  ctx.lineTo(7.8, -26.8);
  ctx.lineTo(13, -25);
  ctx.lineTo(7.8, -23.2);
  ctx.lineTo(6, -18);
  ctx.lineTo(4.2, -23.2);
  ctx.lineTo(-1, -25);
  ctx.lineTo(4.2, -26.8);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderCertificateToCanvas(
  ctx,
  marsImg,
  {
    astronautName = 'Commander Valkyrie',
    totalVaulted = 24,
    totalPossible = 24,
    distLabel = '0 m',
    timeLabel = '00:00',
    peakRad = '0.61 mSv/d',
  }
) {
  // Deep obsidian-slate surface (#0b0f17 -> #0e1420 -> #080b11)
  const plateGrad = ctx.createLinearGradient(0, 0, 1600, 1000);
  plateGrad.addColorStop(0, '#0b0f17');
  plateGrad.addColorStop(0.5, '#0e1420');
  plateGrad.addColorStop(1, '#080b11');
  ctx.fillStyle = plateGrad;
  ctx.fillRect(0, 0, 1600, 1000);

  // Subtle NASA Mars Albedo surface picture backdrop
  if (marsImg && marsImg.width > 0 && marsImg.height > 0) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    const scale = Math.max(1600 / marsImg.width, 1000 / marsImg.height);
    const drawW = marsImg.width * scale;
    const drawH = marsImg.height * scale;
    ctx.drawImage(marsImg, (1600 - drawW) / 2, (1000 - drawH) / 2, drawW, drawH);
    ctx.restore();

    const scrim = ctx.createLinearGradient(0, 0, 1600, 1000);
    scrim.addColorStop(0, 'rgba(11, 15, 23, 0.62)');
    scrim.addColorStop(0.5, 'rgba(14, 20, 32, 0.52)');
    scrim.addColorStop(1, 'rgba(8, 11, 17, 0.74)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, 1600, 1000);
  }

  // Subtle warm-amber radial glow tucked behind the right-hand Mission Patch
  const patchGlow = ctx.createRadialGradient(1350, 320, 10, 1350, 320, 460);
  patchGlow.addColorStop(0, 'rgba(234, 88, 12, 0.06)');
  patchGlow.addColorStop(1, 'rgba(234, 88, 12, 0)');
  ctx.fillStyle = patchGlow;
  ctx.fillRect(0, 0, 1600, 1000);

  // Subtle Martian Topographic Contour Watermark (MOLA/HiRISE, opacity 0.045)
  ctx.save();
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.045)';
  ctx.lineWidth = 2.2;
  const contourSets = [
    [[-40, 680], [200, 560, 380, 780, 640, 620], [880, 480, 1120, 300, 1440, 380], [1560, 410, 1640, 370, 1680, 340]],
    [[-40, 770], [220, 640, 420, 840, 700, 680], [950, 540, 1170, 370, 1470, 450], [1580, 480, 1650, 440, 1680, 410]],
    [[-40, 590], [180, 470, 350, 680, 590, 550], [820, 430, 1070, 240, 1390, 310], [1520, 340, 1630, 300, 1680, 270]],
    [[220, -40], [350, 120, 250, 290, 450, 370], [650, 450, 790, 250, 970, 170], [1150, 90, 1300, 160, 1490, 40]],
  ];
  contourSets.forEach((segs) => {
    ctx.beginPath();
    ctx.moveTo(segs[0][0], segs[0][1]);
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      ctx.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
    }
    ctx.stroke();
  });

  // Topographic contour ellipses
  [
    { cx: 1290, cy: 290, rx: 270, ry: 156, rot: -0.24 },
    { cx: 1290, cy: 290, rx: 184, ry: 100, rot: -0.24 },
    { cx: 360, cy: 790, rx: 300, ry: 136, rot: 0.19 },
    { cx: 360, cy: 790, rx: 192, ry: 84, rot: 0.19 },
  ].forEach((e) => {
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();

  // Double-hairline outer border + inner 1px inset ring
  const outerX = 56;
  const outerY = 56;
  const outerW = 1488;
  const outerH = 888;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(outerX, outerY, outerW, outerH);

  const frameX = 64;
  const frameY = 64;
  const frameW = 1472;
  const frameH = 872;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(frameX, frameY, frameW, frameH);

  // Aerospace Registration Corner Crosshairs (+ 12px inset 16px from inner frame)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.25;
  const inset = 22;
  const halfArm = 7;
  [
    [frameX + inset, frameY + inset],
    [frameX + frameW - inset, frameY + inset],
    [frameX + inset, frameY + frameH - inset],
    [frameX + frameW - inset, frameY + frameH - inset],
  ].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx - halfArm, cy);
    ctx.lineTo(cx + halfArm, cy);
    ctx.moveTo(cx, cy - halfArm);
    ctx.lineTo(cx, cy + halfArm);
    ctx.stroke();
  });
  ctx.restore();

  // Top Classification Header Bar
  const headerH = 64;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(frameX, frameY + headerH);
  ctx.lineTo(frameX + frameW, frameY + headerH);
  ctx.stroke();

  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText('DOC ID: ARES-V-EVA-412', frameX + 40, frameY + headerH / 2);

  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.fillText(
    'SURFACE EXPLORATION & SAMPLE RETURN CERTIFICATION',
    frameX + frameW / 2,
    frameY + headerH / 2
  );

  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText('SOL 412 // MERIDIAN RELAY', frameX + frameW - 40, frameY + headerH / 2);

  // Main Citation Block (Left Editorial + Right Mission Patch)
  const citeTop = frameY + headerH + 88;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#c2410c';
  ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText('THIS CERTIFIES THAT', frameX + 64, citeTop);

  const cleanName = (astronautName || 'Commander Valkyrie').trim() || 'Commander Valkyrie';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 60px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText(cleanName, frameX + 64, citeTop + 76);

  // Thin horizontal rule under astronaut name
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(frameX + 64, citeTop + 106);
  ctx.lineTo(frameX + frameW - 360, citeTop + 106);
  ctx.stroke();

  // Concise 2-line formal NASA-style citation
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '400 22px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText(
    'Has achieved 100% completion of orbital-to-surface reconnaissance and geological core recovery',
    frameX + 64,
    citeTop + 152
  );
  ctx.fillText(
    `across all four designated NASA Mars landing corridors, returning all ${totalPossible} priority specimens.`,
    frameX + 64,
    citeTop + 188
  );

  // Custom Vector ARES-V Circular Mission Patch
  drawMissionPatch(ctx, frameX + frameW - 185, citeTop + 88, 2.0);

  // Corridor Sign-Off Strip (Compact 4-Column Ledger)
  const ledgerY = frameY + 490;
  const ledgerH = 128;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(frameX, ledgerY);
  ctx.lineTo(frameX + frameW, ledgerY);
  ctx.moveTo(frameX, ledgerY + ledgerH);
  ctx.lineTo(frameX + frameW, ledgerY + ledgerH);
  ctx.stroke();

  const corridors = [
    { coords: '18.38\u00B0N', name: 'Jezero' },
    { coords: '4.59\u00B0S', name: 'Mount Sharp' },
    { coords: '1.95\u00B0S', name: 'Meridiani' },
    { coords: '14.57\u00B0S', name: 'Gusev' },
  ];
  const colW = frameW / 4;
  corridors.forEach((c, idx) => {
    const colX = frameX + idx * colW;
    if (idx > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(colX, ledgerY);
      ctx.lineTo(colX, ledgerY + ledgerH);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 18px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(`${c.coords} ${c.name}`, colX + 36, ledgerY + 54);

    ctx.fillStyle = '#34d399';
    ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText('[VERIFIED]', colX + 36, ledgerY + 88);
  });

  // Bottom Telemetry & Authentication Footer (2-Part Split)
  const footerY = ledgerY + ledgerH + 92;

  // Left: MISSION TELEMETRY LOG
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText('MISSION TELEMETRY LOG', frameX + 64, footerY);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 19px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText(
    `${totalVaulted}/${totalPossible} CORES \u00B7 ${distLabel.toUpperCase()} TRAVERSE \u00B7 ${timeLabel} EVA TIME \u00B7 ${peakRad} PEAK RAD`,
    frameX + 64,
    footerY + 42
  );

  // Right: FLIGHT DIRECTORATE SIGN-OFF
  const rightX = frameX + frameW - 64;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText('FLIGHT DIRECTORATE SIGN-OFF', rightX, footerY);

  // Minimalist vector signature flourish
  ctx.save();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rightX - 210, footerY + 34);
  ctx.bezierCurveTo(rightX - 188, footerY + 10, rightX - 172, footerY + 40, rightX - 150, footerY + 20);
  ctx.bezierCurveTo(rightX - 134, footerY + 6, rightX - 126, footerY + 38, rightX - 102, footerY + 24);
  ctx.bezierCurveTo(rightX - 80, footerY + 12, rightX - 58, footerY + 34, rightX - 18, footerY + 18);
  ctx.stroke();
  ctx.restore();

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText(
    `ISSUED: ${dateStr.toUpperCase()} | TEAM AVENGINEERS`,
    rightX,
    footerY + 76
  );
}

export function downloadExpeditionCertificate(params) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const triggerDownload = () => {
    const link = document.createElement('a');
    link.download = 'ares-v-certificate.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    renderCertificateToCanvas(ctx, img, params);
    triggerDownload();
  };
  img.onerror = () => {
    renderCertificateToCanvas(ctx, null, params);
    triggerDownload();
  };
  img.src = '/textures/mars_albedo.jpg';
}
