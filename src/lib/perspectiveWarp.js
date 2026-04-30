/**
 * 4-corner perspective warp utilities.
 *
 *  - cssMatrix3d() emits a CSS `matrix3d(...)` string for use on a DOM
 *    element (Trace page, Viewer overlay).
 *  - drawWarpedToCanvas() draws an image into a 2D canvas warped to four
 *    destination corners, using a triangle-mesh approximation. Used by
 *    the Live broadcaster so the warp ends up in the captured stream.
 *
 * Convention used everywhere in this module: corner positions are stored
 * in image-local coordinates *centered on origin*, i.e. the identity quad
 * for a (W × H) image is { tl:(-W/2,-H/2), tr:(W/2,-H/2), br:(W/2,H/2),
 * bl:(-W/2,H/2) }. This pairs cleanly with `transform-origin: 50% 50%`.
 */

export function identityCorners(width, height) {
  const w = width / 2;
  const h = height / 2;
  return {
    tl: { x: -w, y: -h },
    tr: { x:  w, y: -h },
    br: { x:  w, y:  h },
    bl: { x: -w, y:  h },
  };
}

export function isIdentity(corners, width, height) {
  if (!corners) return true;
  const id = identityCorners(width, height);
  for (const k of ['tl', 'tr', 'br', 'bl']) {
    if (Math.abs(corners[k].x - id[k].x) > 0.5) return false;
    if (Math.abs(corners[k].y - id[k].y) > 0.5) return false;
  }
  return true;
}

// Convert a screen-space delta to image-local space, given the outer
// (translate/scale/rotate/flip) transform that's applied OVER the warp.
export function screenDeltaToLocal(dx, dy, scale, rotationDeg, flip) {
  const r = -rotationDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const sx = flip ? -scale : scale;
  return {
    x: (c * dx - s * dy) / sx,
    y: (s * dx + c * dy) / scale,
  };
}

// Build the matrix3d() CSS string for a (W × H) element warped so its
// natural-rect corners land on the supplied destination corners.
export function cssMatrix3d(width, height, corners) {
  if (!corners || !width || !height) return '';
  const id = identityCorners(width, height);
  const M = solveProjection(
    [id.tl, id.tr, id.br, id.bl],
    [corners.tl, corners.tr, corners.br, corners.bl],
  );
  if (!M) return '';
  // The projection matrix from solveProjection is correct projectively but
  // its overall scale (≈ det(src)·det(dst)) can be enormous. CSS does the
  // perspective division at render time, but float precision in matrix3d
  // breaks down well before that. Normalize by M[2][2] — that's what the
  // CSS spec calls the homogeneous-w of the (0,0) point — so values stay
  // around O(1).
  const k = M[2][2];
  if (!Number.isFinite(k) || Math.abs(k) < 1e-12) return '';
  // CSS matrix3d is column-major. We're working in 2D + perspective so
  // the third column/row is just the identity z-axis.
  return `matrix3d(`
    + `${M[0][0]/k},${M[1][0]/k},0,${M[2][0]/k},`
    + `${M[0][1]/k},${M[1][1]/k},0,${M[2][1]/k},`
    + `0,0,1,0,`
    + `${M[0][2]/k},${M[1][2]/k},0,1)`;
}

// Mesh-warp `img` onto the destination quad in canvas coords. The 2D
// canvas has no native perspective, so we subdivide the image into a
// gridSize × gridSize mesh and draw each cell as two affine triangles.
// gridSize=12 looks indistinguishable from true perspective at typical
// quad shapes; bump it if you see visible faceting.
export function drawWarpedToCanvas(ctx, img, corners, gridSize = 12) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return;
  for (let yi = 0; yi < gridSize; yi++) {
    for (let xi = 0; xi < gridSize; xi++) {
      const u0 = xi / gridSize;
      const u1 = (xi + 1) / gridSize;
      const v0 = yi / gridSize;
      const v1 = (yi + 1) / gridSize;
      const s00 = { x: u0 * W, y: v0 * H };
      const s10 = { x: u1 * W, y: v0 * H };
      const s01 = { x: u0 * W, y: v1 * H };
      const s11 = { x: u1 * W, y: v1 * H };
      const d00 = bilerpQuad(corners, u0, v0);
      const d10 = bilerpQuad(corners, u1, v0);
      const d01 = bilerpQuad(corners, u0, v1);
      const d11 = bilerpQuad(corners, u1, v1);
      drawTriangle(ctx, img, s00, s10, s11, d00, d10, d11);
      drawTriangle(ctx, img, s00, s11, s01, d00, d11, d01);
    }
  }
}

// Bilinear position inside a 4-corner quad — used for both mesh warp and
// for placing handles on top of the rendered image in Live mode.
export function bilerpQuad(c, u, v) {
  const tx = c.tl.x + (c.tr.x - c.tl.x) * u;
  const ty = c.tl.y + (c.tr.y - c.tl.y) * u;
  const bx = c.bl.x + (c.br.x - c.bl.x) * u;
  const by = c.bl.y + (c.br.y - c.bl.y) * u;
  return { x: tx + (bx - tx) * v, y: ty + (by - ty) * v };
}

function drawTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  // Solve the 2D affine that sends source triangle (s0,s1,s2) to (d0,d1,d2).
  const sdx1 = s1.x - s0.x, sdy1 = s1.y - s0.y;
  const sdx2 = s2.x - s0.x, sdy2 = s2.y - s0.y;
  const ddx1 = d1.x - d0.x, ddy1 = d1.y - d0.y;
  const ddx2 = d2.x - d0.x, ddy2 = d2.y - d0.y;
  const det = sdx1 * sdy2 - sdx2 * sdy1;
  if (Math.abs(det) < 1e-9) return;
  const a = (sdy2 * ddx1 - sdy1 * ddx2) / det;
  const b = (sdy2 * ddy1 - sdy1 * ddy2) / det;
  const c = (sdx1 * ddx2 - sdx2 * ddx1) / det;
  const d = (sdx1 * ddy2 - sdx2 * ddy1) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Solve the 3×3 projection that maps src[0..3] -> dst[0..3].
function solveProjection(src, dst) {
  const s = basisToPoints(src);
  const d = basisToPoints(dst);
  if (!s || !d) return null;
  return mul3x3(d, adj3x3(s));
}

function basisToPoints(p) {
  const m = [
    [p[0].x, p[1].x, p[2].x],
    [p[0].y, p[1].y, p[2].y],
    [1, 1, 1],
  ];
  const a = adj3x3(m);
  const v = [
    a[0][0]*p[3].x + a[0][1]*p[3].y + a[0][2],
    a[1][0]*p[3].x + a[1][1]*p[3].y + a[1][2],
    a[2][0]*p[3].x + a[2][1]*p[3].y + a[2][2],
  ];
  if (Math.abs(v[0] * v[1] * v[2]) < 1e-12) return null;
  return mul3x3(m, [
    [v[0], 0, 0],
    [0, v[1], 0],
    [0, 0, v[2]],
  ]);
}

function adj3x3(m) {
  return [
    [m[1][1]*m[2][2] - m[1][2]*m[2][1], m[0][2]*m[2][1] - m[0][1]*m[2][2], m[0][1]*m[1][2] - m[0][2]*m[1][1]],
    [m[1][2]*m[2][0] - m[1][0]*m[2][2], m[0][0]*m[2][2] - m[0][2]*m[2][0], m[0][2]*m[1][0] - m[0][0]*m[1][2]],
    [m[1][0]*m[2][1] - m[1][1]*m[2][0], m[0][1]*m[2][0] - m[0][0]*m[2][1], m[0][0]*m[1][1] - m[0][1]*m[1][0]],
  ];
}

function mul3x3(a, b) {
  const r = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j];
    }
  }
  return r;
}
