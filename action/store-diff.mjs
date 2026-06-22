/**
 * Live, per-push history writer. Run from auto-release.yml as:
 *
 *   node action/store-diff.mjs <release-tag>
 *
 * Diffs the previous release's map (downloaded to OLD_MAP, default
 * `old_map.dat`) against the freshly merged map (NEW_MAP, default
 * `map_master3.dat`) and upserts one history document per changed
 * room / label / area into MongoDB.
 *
 * Environment:
 *   MONGODB_URI            required - Atlas connection string
 *   MONGODB_DB             optional - database name (default "arkadia-map-diff")
 *   MONGODB_COLLECTION     optional - collection name (default "changes")
 *   GITHUB_SHA             commit sha for attribution
 *   GITHUB_ACTOR           the user who triggered the run (fallback actor)
 *   GIT_AUTHOR_NAME/EMAIL  PR author name/public email (captured in the workflow)
 *   GIT_AUTHOR_LOGIN       PR author's GitHub login (preferred actor)
 *   OLD_MAP / NEW_MAP      override map paths (for local testing)
 */

import fs from "fs";
import { compareMaps } from "mudlet-map-diff";
import { buildDocs, writeDocs } from "./diff-to-docs.mjs";

const version = process.argv[2];
if (!version) {
    console.error("Usage: node store-diff.mjs <release-tag>");
    process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
}

const oldMap = process.env.OLD_MAP || "old_map.dat";
const newMap = process.env.NEW_MAP || "map_master3.dat";

if (!fs.existsSync(oldMap)) {
    console.log(`No previous map at "${oldMap}" - nothing to diff against (first release?). Skipping.`);
    process.exit(0);
}
if (!fs.existsSync(newMap)) {
    console.error(`New map "${newMap}" not found.`);
    process.exit(1);
}

// The workflow resolves these to the PR author (the real map editor) and falls
// back to GITHUB_ACTOR for the actor. Empty fields (e.g. no public email) are
// omitted so stored docs stay clean.
const author = { actor: process.env.GIT_AUTHOR_LOGIN || process.env.GITHUB_ACTOR };
if (process.env.GIT_AUTHOR_NAME) author.name = process.env.GIT_AUTHOR_NAME;
if (process.env.GIT_AUTHOR_EMAIL) author.email = process.env.GIT_AUTHOR_EMAIL;
const commit = process.env.GITHUB_SHA;
const timestamp = process.env.COMMIT_TIMESTAMP ? new Date(process.env.COMMIT_TIMESTAMP) : new Date();

const { v1, v2, diff } = compareMaps(oldMap, newMap);
const docs = buildDocs({ diff, v1, v2, version, author, commit, timestamp });

await writeDocs({ uri, docs });
console.log(`Done for release ${version}.`);
