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
    return faces.map((face, i) => {
        const displacement = displacements[i];
        return initFaceBuffers(gl, face, displacement, displacements, displacement ? gridSize : 1);
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

function initFaceBuffers(gl, face, displacement, displacements, gridSize) {
    const vertexCount = (gridSize + 1) ** 2;
    const positions = new Float32Array(vertexCount * 3);
    const textureCoordinates = new Float32Array(vertexCount * 2);
    for (let j = 0; j <= gridSize; j++) {
        for (let i = 0; i <= gridSize; i++) {
            const v = j * (gridSize + 1) + i;
            const { position, uv } = getPoint(face, displacement, displacements, i / gridSize, j / gridSize);
            positions.set(position, v * 3);
            textureCoordinates.set(uv, v * 2);
        }
    }

    const indices = new Uint16Array(gridSize * gridSize * 6);
    for (let j = 0, k = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
            const v = j * (gridSize + 1) + i;
            indices.set([v, v + 1, v + gridSize + 2, v, v + gridSize + 2, v + gridSize + 1], k);
            k += 6;
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

// The point at s, t on the face (each 0 to 1), displaced by its height
function getPoint(face, displacement, displacements, s, t) {
    const position = bilerp(face.corners, s, t);
    const uv = bilerp(face.uvs, s, t);
    if (!displacement) return { position, uv };

    const { outward, bends } = displacement;
    const distances = getEdgeDistances(s, t);

    let direction = face.normal;
    for (let k = 0; k < 4; k++) {
        if (bends[k]) direction = add(direction, scale(outward[k], bendWeight(distances[k])));
    }

    const amount = getBlendedAmount(displacement, displacements, s, t);
    return { position: add(position, scale(direction, amount * UNITS_PER_CM)), uv };
}

// The face's own displacement (cm) at s, t, along its bend direction
function getAmount(displacement, s, t) {
    const { heightMap, bends, hardCorners, faceIndex, uvScale } = displacement;
    const distances = getEdgeDistances(s, t);

    let hardDistance = Infinity;
    for (let k = 0; k < 4; k++) {
        if (!bends[k]) hardDistance = Math.min(hardDistance, distances[k]);
    }

    let cornerFade = 1;
    for (let c = 0; c < 4; c++) {
        if (!hardCorners[c]) continue;
        const distance = Math.hypot(distances[c & 1], distances[2 + (c >> 1)]);
        hardDistance = Math.min(hardDistance, distance);
        cornerFade *= smoothstep(CORNER_FADE_IN_CM, CORNER_FADE_OUT_CM, distance);
    }

    const uv = bilerp(faces[faceIndex].uvs, s, t);
    const height = sampleHeight(heightMap, uv[0] / uvScale, uv[1] / uvScale);
    return DEPTH_CM * (height - heightMap.faceLevel) * cornerFade * smoothstep(0, HARD_CM, hardDistance);
}

// The displacement blended near bending edges with the average of the
// faces there (at the nearest point on the edge), and near corners with
// the average of all the faces at it. Each edge and corner then has the
// same displacement on all its faces.
function getBlendedAmount(displacement, displacements, s, t) {
    const { bends, neighbours, faceIndex } = displacement;
    const corners = faces[faceIndex].corners;
    const distances = getEdgeDistances(s, t);

    // The nearest edge along s and along t (0 or 1 is also the s or t of
    // that edge), and how much each blends
    const sEdge = s < 0.5 ? 0 : 1, tEdge = t < 0.5 ? 2 : 3;
    const edgeWeight = (k) => bends[k] ? 1 - smoothstep(0, HARD_CM, distances[k]) : 0;
    const ws = edgeWeight(sEdge), wt = edgeWeight(tEdge);

    const own = getAmount(displacement, s, t);
    if (ws == 0 && wt == 0) return own;

    // The average of the given faces at a point on all of them
    const averageAt = (point, faceIndices) => faceIndices.reduce((sum, i) =>
        sum + getAmount(displacements[i], ...getFaceST(i, point)), 0) / faceIndices.length;

    const sEdgeAverage = ws > 0 ? averageAt(bilerp(corners, sEdge, t), [faceIndex, neighbours[sEdge]]) : 0;
    const tEdgeAverage = wt > 0 ? averageAt(bilerp(corners, s, tEdge - 2), [faceIndex, neighbours[tEdge]]) : 0;
    const cornerAverage = ws > 0 && wt > 0
        ? averageAt(bilerp(corners, sEdge, tEdge - 2), [faceIndex, neighbours[sEdge], neighbours[tEdge]]) : 0;

    return own * (1 - ws) * (1 - wt) + sEdgeAverage * ws * (1 - wt) + tEdgeAverage * (1 - ws) * wt + cornerAverage * ws * wt;
}

// The s, t on a face of a point on it
function getFaceST(faceIndex, point) {
    const face = faces[faceIndex];
    const relative = sub(point, face.corners[0]);
    return [dot(relative, getAxis(face, 1)) / 2, dot(relative, getAxis(face, 3)) / 2];
}

// The distances (cm) from s, t to the edges -s, +s, -t and +t
function getEdgeDistances(s, t) {
    return [s, 1 - s, t, 1 - t].map(d => d * BLOCK_CM);
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
    const wrap = (n) => ((n % size) + size) % size;
    const at = (px, py) => data[wrap(py) * size + wrap(px)];
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
}

// Normals of the displaced surface, from the neighbouring points
// (only those on the face itself at its border)
function getNormals(positions, gridSize, faceNormal) {
    const normals = new Float32Array(positions.length);
    const at = (i, j) => {
        const v = (j * (gridSize + 1) + i) * 3;
        return [positions[v], positions[v + 1], positions[v + 2]];
    };
    for (let j = 0; j <= gridSize; j++) {
        for (let i = 0; i <= gridSize; i++) {
            const alongS = sub(at(Math.min(i + 1, gridSize), j), at(Math.max(i - 1, 0), j));
            const alongT = sub(at(i, Math.min(j + 1, gridSize)), at(i, Math.max(j - 1, 0)));
            let normal = normalize(cross(alongS, alongT));
            if (dot(normal, faceNormal) < 0) normal = scale(normal, -1);
            normals.set(normal, (j * (gridSize + 1) + i) * 3);
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

function bilerp(corners, s, t) {
    return corners[0].map((_, k) =>
        corners[0][k] * (1 - s) * (1 - t) + corners[1][k] * s * (1 - t) + corners[2][k] * s * t + corners[3][k] * (1 - s) * t);
}

function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

const add = (a, b) => a.map((x, k) => x + b[k]);
const sub = (a, b) => a.map((x, k) => x - b[k]);
const scale = (a, f) => a.map(x => x * f);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

export { initBuffers };
