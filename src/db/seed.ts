import { sql } from "drizzle-orm";
import { db } from ".";
import { catalogItems, medicines } from "./schema";
import {
    DIAGNOSIS_OPTIONS,
    HEMATOLOGICAL_OPTIONS,
    MEDICINE_OPTIONS,
    POPULAR_MEDICINES,
    RADIOLOGICAL_OPTIONS,
} from "./seed-data";

const clean = (arr: string[]) =>
    [...new Set(arr.map((s) => s.trim()).filter((s) => s && s !== "Other"))];

async function insertCatalog(type: "diagnosis" | "hematological" | "radiological", arr: string[]) {
    const rows = clean(arr).map((name, i) => ({ type, name, sortOrder: i }));
    await db.insert(catalogItems).values(rows).onConflictDoNothing();
}

async function main() {
    const rank = new Map(POPULAR_MEDICINES.map((n, i) => [n, i + 1]));
    const meds = clean(MEDICINE_OPTIONS).map((name) => ({
        name,
        priority: rank.get(name) ?? 9999,
    }));

    for (let i = 0; i < meds.length; i += 500) {
        await db
            .insert(medicines)
            .values(meds.slice(i, i + 500))
            .onConflictDoUpdate({
                target: medicines.name,
                set: { priority: sql`excluded.priority` },
            });
    }

    await insertCatalog("diagnosis", DIAGNOSIS_OPTIONS);
    await insertCatalog("hematological", HEMATOLOGICAL_OPTIONS);
    await insertCatalog("radiological", RADIOLOGICAL_OPTIONS);
    console.log("done");
    process.exit(0);
}

main();