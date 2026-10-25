// The cube's faces, in the order of the textures: front, back, top,
// bottom, right and left. Each has its four corners and their texture
// coordinates, going around the face from the first, so the first to the
// second corner is the face's s axis, and the first to the fourth its t axis.
const faces = [
    { corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], uvs: [[0, 1], [1, 1], [1, 0], [0, 0]], normal: [0, 0, 1] },
    { corners: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], uvs: [[1, 1], [1, 0], [0, 0], [0, 1]], normal: [0, 0, -1] },
    { corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], uvs: [[0, 0], [0, 1], [1, 1], [1, 0]], normal: [0, 1, 0] },
    { corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], normal: [0, -1, 0] },
    { corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], uvs: [[1, 1], [1, 0], [0, 0], [0, 1]], normal: [1, 0, 0] },
    { corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], uvs: [[0, 1], [1, 1], [1, 0], [0, 0]], normal: [-1, 0, 0] },
];

// The game's displacement of block faces with height maps (the same as
// stonebrickstudios.com/cyubevr/blockpreview.html): a point moves out by
// 3 cm x (height - the face's level), where the cube is 50 cm wide.
// Within 6 cm of an edge to a face with the same texture (or any texture,
// without hard edges), it also moves toward that face, so both faces meet
// there. Toward other edges, and
// corners where the faces don't all have the same texture, it fades out
// within 3 cm, and the relief fades between 9 and 6 cm from such corners.
// Where faces bend toward each other, their heights at the edge usually
// differ, which would leave a gap between them, so within 3 cm of the edge
// both blend to the same displacement (and at corners, all three).
const BLOCK_CM = 50, DEPTH_CM = 3, BEND_CM = 6, HARD_CM = 3, CORNER_FADE_IN_CM = 6, CORNER_FADE_OUT_CM = 9;
const UNITS_PER_CM = 2 / BLOCK_CM;

//
// Make a buffer set for each face. heightMaps has each face's height map
// (or nothing), where faces with the same texture share the same one.
// Displaced faces are divided into gridSize x gridSize squares. uvScale
// is what the texture coordinates are divided by (animated textures).
// Without hardEdges, faces with different height maps also bend into each
// other (the game's "HardEdgesBetweenDifferentTextures": false).
//
function initBuffers(gl, heightMaps = [], gridSize = 1, uvScale = 1, hardEdges = true) {
    const displacements = faces.map((_, i) => heightMaps[i] ? getDisplacement(i, heightMaps, uvScale, hardEdges) : undefined);
    return faces.map((_, i) => {
        const displacement = displacements[i];
        return initFaceBuffers(gl, i, displacement, displacements, displacement ? gridSize : 1);
    });
}

// Which of its edges a face bends toward the face across, which corners
// are hard, and its height map
function getDisplacement(faceIndex, heightMaps, uvScale, hardEdges) {
    const face = faces[faceIndex];
    const heightMap = heightMaps[faceIndex];
    const isLike = (direction) => {
        const other = heightMaps[getFaceIndex(direction)];
        return hardEdges ? other === heightMap : other != undefined;
    };

    // Edges in the order -s, +s, -t, +t, each with its outward direction
    const s = getAxis(face, 1), t = getAxis(face, 3);
    const outward = [scale(s, -1), s, scale(t, -1), t];
    const bends = outward.map(isLike);
    const neighbours = outward.map(getFaceIndex);

    // Corner c is on the +s side when c & 1, and on the +t side when c & 2
    const hardCorners = [0, 1, 2, 3].map(c => !(isLike(outward[c & 1]) && isLike(outward[2 + (c >> 1)])));

    return { faceIndex, heightMap, outward, bends, neighbours, hardCorners, uvScale };
}

// A displaced face has many thousands of points, so they are made without
// making any arrays for them, which would take far longer
function initFaceBuffers(gl, faceIndex, displacement, displacements, gridSize) {
    const face = faces[faceIndex];
    const { sStep, tStep, uvSStep, uvTStep } = faceSteps[faceIndex];
    const [x0, y0, z0] = face.corners[0];
    const [u0, v0] = face.uvs[0];

    const vertexCount = (gridSize + 1) ** 2;
    const positions = new Float32Array(vertexCount * 3);
    const textureCoordinates = new Float32Array(vertexCount * 2);
    for (let j = 0; j <= gridSize; j++) {
        for (let i = 0; i <= gridSize; i++) {
            const v = j * (gridSize + 1) + i;
            const s = i / gridSize, t = j / gridSize;

            let x = x0 + s * sStep[0] + t * tStep[0];
            let y = y0 + s * sStep[1] + t * tStep[1];
            let z = z0 + s * sStep[2] + t * tStep[2];
            if (displacement) {
                // Displaced by its height, along the face's normal bent
                // toward the edges it bends at
                const { outward, bends } = displacement;
                let [dx, dy, dz] = face.normal;
                for (let k = 0; k < 4; k++) {
                    if (!bends[k]) continue;
                    const weight = bendWeight(getEdgeDistance(k, s, t));
                    dx += outward[k][0] * weight;
                    dy += outward[k][1] * weight;
                    dz += outward[k][2] * weight;
                }

                const amount = getBlendedAmount(displacement, displacements, s, t) * UNITS_PER_CM;
                x += dx * amount;
                y += dy * amount;
                z += dz * amount;
            }
            positions[v * 3] = x;
            positions[v * 3 + 1] = y;
            positions[v * 3 + 2] = z;
            textureCoordinates[v * 2] = u0 + s * uvSStep[0] + t * uvTStep[0];
            textureCoordinates[v * 2 + 1] = v0 + s * uvSStep[1] + t * uvTStep[1];
        }
    }

    const indices = new Uint16Array(gridSize * gridSize * 6);
    for (let j = 0, k = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
            const v = j * (gridSize + 1) + i;
            indices[k++] = v;
            indices[k++] = v + 1;
            indices[k++] = v + gridSize + 2;
            indices[k++] = v;
            indices[k++] = v + gridSize + 2;
            indices[k++] = v + gridSize + 1;
        }
    }

    const normals = displacement ? getNormals(positions, gridSize, face.normal) : getFlatNormals(vertexCount, face.normal);

    return {
        position: makeBuffer(gl, gl.ARRAY_BUFFER, positions),
        normal: makeBuffer(gl, gl.ARRAY_BUFFER, normals),
        textureCoord: makeBuffer(gl, gl.ARRAY_BUFFER, textureCoordinates),
        indices: makeBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, indices),
        indexCount: indices.length,
    };
}

// The face's own displacement (cm) at s, t, along its bend direction
function getAmount(displacement, s, t) {
    const { heightMap, bends, hardCorners, faceIndex, uvScale } = displacement;

    let hardDistance = Infinity;
    for (let k = 0; k < 4; k++) {
        if (!bends[k]) hardDistance = Math.min(hardDistance, getEdgeDistance(k, s, t));
    }

    let cornerFade = 1;
    for (let c = 0; c < 4; c++) {
        if (!hardCorners[c]) continue;
        const distance = Math.hypot(getEdgeDistance(c & 1, s, t), getEdgeDistance(2 + (c >> 1), s, t));
        hardDistance = Math.min(hardDistance, distance);
        cornerFade *= smoothstep(CORNER_FADE_IN_CM, CORNER_FADE_OUT_CM, distance);
    }

    const [u0, v0] = faces[faceIndex].uvs[0];
    const { uvSStep, uvTStep } = faceSteps[faceIndex];
    const u = u0 + s * uvSStep[0] + t * uvTStep[0];
    const v = v0 + s * uvSStep[1] + t * uvTStep[1];
    const height = sampleHeight(heightMap, u / uvScale, v / uvScale);
    return DEPTH_CM * (height - heightMap.faceLevel) * cornerFade * smoothstep(0, HARD_CM, hardDistance);
}

// The displacement blended near bending edges with the average of the
// faces there (at the nearest point on the edge), and near corners with
// the average of all the faces at it. Each edge and corner then has the
// same displacement on all its faces.
function getBlendedAmount(displacement, displacements, s, t) {
    const { bends, neighbours, faceIndex } = displacement;

    // The nearest edge along s and along t (0 or 1 is also the s or t of
    // that edge), and how much each blends
    const sEdge = s < 0.5 ? 0 : 1, tEdge = t < 0.5 ? 2 : 3;
    const ws = bends[sEdge] ? 1 - smoothstep(0, HARD_CM, getEdgeDistance(sEdge, s, t)) : 0;
    const wt = bends[tEdge] ? 1 - smoothstep(0, HARD_CM, getEdgeDistance(tEdge, s, t)) : 0;

    const own = getAmount(displacement, s, t);
    if (ws == 0 && wt == 0) return own;

    // The displacement of a face at the point at s, t on this face
    const amountAt = (otherIndex, s, t) => getAmountAt(displacements[otherIndex], faceIndex, s, t);

    const sEdgeAverage = ws > 0 ? (amountAt(faceIndex, sEdge, t) + amountAt(neighbours[sEdge], sEdge, t)) / 2 : 0;
    const tEdgeAverage = wt > 0 ? (amountAt(faceIndex, s, tEdge - 2) + amountAt(neighbours[tEdge], s, tEdge - 2)) / 2 : 0;
    const cornerAverage = ws > 0 && wt > 0
        ? (amountAt(faceIndex, sEdge, tEdge - 2) + amountAt(neighbours[sEdge], sEdge, tEdge - 2) + amountAt(neighbours[tEdge], sEdge, tEdge - 2)) / 3
        : 0;

    return own * (1 - ws) * (1 - wt) + sEdgeAverage * ws * (1 - wt) + tEdgeAverage * (1 - ws) * wt + cornerAverage * ws * wt;
}

// The displacement at the point at s, t on the face pointFaceIndex
function getAmountAt(displacement, pointFaceIndex, s, t) {
    if (displacement.faceIndex == pointFaceIndex) return getAmount(displacement, s, t);

    // The point relative to the displaced face's first corner, and the
    // s, t of it on that face
    const pointFace = faces[pointFaceIndex], { sStep, tStep } = faceSteps[pointFaceIndex];
    const face = faces[displacement.faceIndex], { sAxis, tAxis } = faceSteps[displacement.faceIndex];
    const rx = pointFace.corners[0][0] + s * sStep[0] + t * tStep[0] - face.corners[0][0];
    const ry = pointFace.corners[0][1] + s * sStep[1] + t * tStep[1] - face.corners[0][1];
    const rz = pointFace.corners[0][2] + s * sStep[2] + t * tStep[2] - face.corners[0][2];
    return getAmount(displacement,
        (rx * sAxis[0] + ry * sAxis[1] + rz * sAxis[2]) / 2,
        (rx * tAxis[0] + ry * tAxis[1] + rz * tAxis[2]) / 2);
}

// The distance (cm) from s, t to edge k: -s, +s, -t or +t
function getEdgeDistance(k, s, t) {
    return (k == 0 ? s : k == 1 ? 1 - s : k == 2 ? t : 1 - t) * BLOCK_CM;
}

// 1 at the edge, 0 from BEND_CM away
function bendWeight(distance) {
    return 1 - smoothstep(0, BEND_CM, distance);
}

// The height at u, v (wrapping), between the nearest pixels
function sampleHeight(heightMap, u, v) {
    const { size, data } = heightMap;
    const x = u * size - 0.5, y = v * size - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const left = wrap(x0, size), right = wrap(x0 + 1, size);
    const top = wrap(y0, size) * size, bottom = wrap(y0 + 1, size) * size;
    const upper = data[top + left] * (1 - fx) + data[top + right] * fx;
    const lower = data[bottom + left] * (1 - fx) + data[bottom + right] * fx;
    return upper * (1 - fy) + lower * fy;
}

function wrap(n, size) {
    return ((n % size) + size) % size;
}

// Normals of the displaced surface, from the neighbouring points
// (only those on the face itself at its border)
function getNormals(positions, gridSize, faceNormal) {
    const normals = new Float32Array(positions.length);
    const row = gridSize + 1;
    for (let j = 0; j <= gridSize; j++) {
        for (let i = 0; i <= gridSize; i++) {
            const right = (j * row + Math.min(i + 1, gridSize)) * 3, left = (j * row + Math.max(i - 1, 0)) * 3;
            const up = (Math.min(j + 1, gridSize) * row + i) * 3, down = (Math.max(j - 1, 0) * row + i) * 3;
            const ax = positions[right] - positions[left], ay = positions[right + 1] - positions[left + 1], az = positions[right + 2] - positions[left + 2];
            const bx = positions[up] - positions[down], by = positions[up + 1] - positions[down + 1], bz = positions[up + 2] - positions[down + 2];

            const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            let length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            if (nx * faceNormal[0] + ny * faceNormal[1] + nz * faceNormal[2] < 0) length = -length;

            const v = (j * row + i) * 3;
            normals[v] = nx / length;
            normals[v + 1] = ny / length;
            normals[v + 2] = nz / length;
        }
    }
    return normals;
}

function getFlatNormals(vertexCount, faceNormal) {
    const normals = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) normals.set(faceNormal, v * 3);
    return normals;
}

function makeBuffer(gl, target, data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buffer;
}

// The unit direction from a face's first corner to another one
function getAxis(face, corner) {
    return normalize(sub(face.corners[corner], face.corners[0]));
}

function getFaceIndex(normal) {
    return faces.findIndex(face => dot(face.normal, normal) > 0.5);
}

function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

const sub = (a, b) => a.map((x, k) => x - b[k]);
const scale = (a, f) => a.map(x => x * f);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

// The steps from each face's first corner to its opposite edges along s and
// t, in position and in texture coordinates, and the unit s and t axes. The
// faces are squares, so moving along these is the same as interpolating the
// corners.
const faceSteps = faces.map(face => ({
    sStep: sub(face.corners[1], face.corners[0]),
    tStep: sub(face.corners[3], face.corners[0]),
    uvSStep: [face.uvs[1][0] - face.uvs[0][0], face.uvs[1][1] - face.uvs[0][1]],
    uvTStep: [face.uvs[3][0] - face.uvs[0][0], face.uvs[3][1] - face.uvs[0][1]],
    sAxis: getAxis(face, 1),
    tAxis: getAxis(face, 3),
}));

export { initBuffers };
