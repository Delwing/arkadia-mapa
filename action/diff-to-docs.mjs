/**
 * Shared helpers that turn a mudlet-map-diff result into per-entity history
 * documents and persist them to MongoDB. Used by store-diff.mjs (the live,
 * per-push writer).
 *
 * One document is produced per changed entity (room / label / area) per
 * release. The `_id` is deterministic (`${version}:${entityKey}`) so re-runs
 * upsert instead of duplicating.
 */

import { MongoClient } from "mongodb";

const BINARY_MARKER = "<binary>";

/** Recursively replace Buffers (and the bulky label pixMap) with a marker so
 *  documents stay small and BSON-friendly. */
function sanitize(value, key) {
    if (key === "pixMap") return BINARY_MARKER;
    if (Buffer.isBuffer(value)) return BINARY_MARKER;
    if (Array.isArray(value)) return value.map((v) => sanitize(v));
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
        return out;
    }
    return value;
}

function areaName(snapshot, areaId) {
    return snapshot?.areaNames?.[areaId];
}

function roomContext(room, snapshot) {
    if (!room) return undefined;
    return {
        name: room.name,
        area: areaName(snapshot, room.area),
        coords: [room.x, room.y, room.z],
    };
}

function labelContext(label, areaId, snapshot) {
    if (!label) return undefined;
    return {
        text: label.text,
        area: areaName(snapshot, areaId),
        coords: label.pos,
    };
}

function areaContext(areaId, snapshot) {
    return { name: areaName(snapshot, areaId) };
}

function findLabel(snapshot, areaId, labelId) {
    const list = snapshot?.labels?.[areaId];
    if (!Array.isArray(list)) return undefined;
    return list.find((l) => (l.labelId ?? l.id) === labelId);
}

/**
 * Build the history documents for a single release diff.
 *
 * @param {object} params
 * @param {import('mudlet-map-diff').MapDiff} params.diff
 * @param {object} params.v1 old map snapshot (returned by compareMaps)
 * @param {object} params.v2 new map snapshot (returned by compareMaps)
 * @param {string} params.version release tag
 * @param {{name?:string,email?:string,actor?:string}} params.author
 * @param {string} [params.commit] commit sha
 * @param {Date} params.timestamp
 * @returns {object[]} documents ready to upsert
 */
export function buildDocs({ diff, v1, v2, version, author, commit, timestamp }) {
    const docs = [];
    const meta = { version, commit, author, timestamp };

    const push = (entityType, entityId, areaId, changeType, payload, context) => {
        const entityKey = `${entityType}:${entityId}`;
        docs.push({
            _id: `${version}:${entityKey}`,
            entityKey,
            entityType,
            entityId,
            ...(areaId !== undefined ? { areaId } : {}),
            changeType,
            ...payload,
            ...(context ? { context } : {}),
            ...meta,
        });
    };

    // --- Rooms ---
    for (const room of diff.rooms.added) {
        push("room", room.id, room.area, "added", { entity: sanitize(room) }, roomContext(room, v2));
    }
    for (const room of diff.rooms.deleted) {
        push("room", room.id, room.area, "deleted", { entity: sanitize(room) }, roomContext(room, v1));
    }
    for (const [id, changes] of Object.entries(diff.rooms.updated)) {
        const room = v2.rooms[id];
        push("room", Number(id), room?.area, "updated", { changes: sanitize(changes) }, roomContext(room, v2));
    }

    // --- Labels (keyed by `${areaId}-${labelId}`) ---
    for (const label of diff.labels.added) {
        const labelId = label.labelId ?? label.id;
        push("label", `${label.areaId}-${labelId}`, label.areaId, "added", { entity: sanitize(label) }, labelContext(label, label.areaId, v2));
    }
    for (const label of diff.labels.deleted) {
        const labelId = label.labelId ?? label.id;
        push("label", `${label.areaId}-${labelId}`, label.areaId, "deleted", { entity: sanitize(label) }, labelContext(label, label.areaId, v1));
    }
    for (const [key, changes] of Object.entries(diff.labels.updated)) {
        const [areaId, labelId] = key.split("-").map(Number);
        const label = findLabel(v2, areaId, labelId);
        push("label", key, areaId, "updated", { changes: sanitize(changes) }, labelContext(label, areaId, v2));
    }

    // --- Areas (areaId = the area's own id, so a single {areaId} filter
    //     surfaces both an area's own changes and its rooms'/labels' changes) ---
    for (const area of diff.areas.added) {
        push("area", area.id, area.id, "added", { entity: sanitize(area) }, areaContext(area.id, v2));
    }
    for (const area of diff.areas.deleted) {
        push("area", area.id, area.id, "deleted", { entity: sanitize(area) }, areaContext(area.id, v1));
    }
    for (const [id, changes] of Object.entries(diff.areas.updated)) {
        push("area", Number(id), Number(id), "updated", { changes: sanitize(changes) }, areaContext(Number(id), v2));
    }

    return docs;
}

/**
 * Upsert history documents into MongoDB. Idempotent on `_id`.
 *
 * @param {object} params
 * @param {string} params.uri MongoDB connection string
 * @param {object[]} params.docs documents from buildDocs
 * @param {string} [params.dbName]
 * @param {string} [params.collectionName]
 * @returns {Promise<number>} number of documents written
 */
export async function writeDocs({ uri, docs, dbName, collectionName }) {
    if (!docs.length) {
        console.log("No changes to store.");
        return 0;
    }
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName || process.env.MONGODB_DB || "arkadia-map-diff");
        const col = db.collection(collectionName || process.env.MONGODB_COLLECTION || "changes");
        await col.createIndex({ entityKey: 1, timestamp: -1 });
        await col.createIndex({ areaId: 1 });
        await col.createIndex({ version: 1 });
        const ops = docs.map((d) => ({
            replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
        }));
        const res = await col.bulkWrite(ops, { ordered: false });
        console.log(`Stored ${docs.length} change doc(s) (upserted ${res.upsertedCount}, modified ${res.modifiedCount}).`);
        return docs.length;
    } finally {
        await client.close();
    }
}
