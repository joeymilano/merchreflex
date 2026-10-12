import { Firestore } from "@google-cloud/firestore";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DomainError } from "./types";
export interface Store {
  read<T>(collection: string, id: string): Promise<T | null>;
  transact<T, R>(
    collection: string,
    id: string,
    fn: (value: T | null) => { value: T; result: R },
  ): Promise<R>;
}
export class MemoryStore implements Store {
  data = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  async read<T>(c: string, id: string) {
    await this.tail;
    return structuredClone(this.data.get(c + "/" + id) ?? null) as T | null;
  }
  async transact<T, R>(
    c: string,
    id: string,
    fn: (value: T | null) => { value: T; result: R },
  ) {
    const job = this.tail.then(() => {
      const next = fn(
        structuredClone(this.data.get(c + "/" + id) ?? null) as T | null,
      );
      this.data.set(c + "/" + id, structuredClone(next.value));
      return next.result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
class FileStore implements Store {
  private tail: Promise<unknown> = Promise.resolve();
  root = path.join(process.cwd(), ".data");
  async read<T>(c: string, id: string) {
    await this.tail;
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.root, c, id + ".json"), "utf8"),
      ) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async transact<T, R>(
    c: string,
    id: string,
    fn: (value: T | null) => { value: T; result: R },
  ) {
    const job = this.tail.then(async () => {
      const dir = path.join(this.root, c);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, id + ".json");
      let current: T | null = null;
      try {
        current = JSON.parse(await fs.readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const next = fn(current);
      await fs.writeFile(file + ".tmp", JSON.stringify(next.value));
      await fs.rename(file + ".tmp", file);
      return next.result;
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
class FirestoreStore implements Store {
  db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  async read<T>(c: string, id: string) {
    const d = await this.db.collection(c).doc(id).get();
    return d.exists ? (d.data() as T) : null;
  }
  async transact<T, R>(
    c: string,
    id: string,
    fn: (value: T | null) => { value: T; result: R },
  ) {
    const ref = this.db.collection(c).doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const out = fn(doc.exists ? (doc.data() as T) : null);
      const encoded = JSON.stringify(out.value);
      if (Buffer.byteLength(encoded) > 850000)
        throw new DomainError("SESSION_STORAGE_LIMIT", 413);
      tx.set(ref, JSON.parse(encoded));
      return out.result;
    });
  }
}
const globalStore = globalThis as unknown as { merchStore?: Store };
export function store() {
  if (!globalStore.merchStore) {
    if (process.env.STORAGE_DRIVER === "firestore")
      globalStore.merchStore = new FirestoreStore();
    else if (process.env.NODE_ENV === "production")
      throw new Error("Production requires STORAGE_DRIVER=firestore");
    else globalStore.merchStore = new FileStore();
  }
  return globalStore.merchStore;
}
