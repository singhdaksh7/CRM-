import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getStorage, type Storage } from "firebase-admin/storage";
import { StorageConfigError } from "./storage-providers/types";

/**
 * Firebase Admin singleton, for Firebase Storage only - this project does
 * not use Firestore. Follows the same globalThis-caching pattern as
 * src/lib/prisma.ts so `next dev`'s hot reload never re-initializes the
 * Admin SDK (which throws if you call initializeApp() twice) and Vercel's
 * warm function instances reuse one connection instead of reconnecting
 * per-request.
 *
 * Server-only: the `server-only` import makes bundling this into a "use
 * client" component a build error, not just a convention - credentials
 * (FIREBASE_PRIVATE_KEY etc.) can never reach the browser bundle.
 */

const globalForFirebase = globalThis as unknown as { firebaseAdminApp?: App };

interface FirebaseAdminConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket: string;
}

function loadConfig(): FirebaseAdminConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  const missing = [
    !projectId && "FIREBASE_PROJECT_ID",
    !clientEmail && "FIREBASE_CLIENT_EMAIL",
    !rawPrivateKey && "FIREBASE_PRIVATE_KEY",
    !storageBucket && "FIREBASE_STORAGE_BUCKET",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new StorageConfigError(
      `Firebase Storage is not configured - missing: ${missing.join(", ")}. Set STORAGE_PROVIDER=FIREBASE and these variables (see .env.example).`
    );
  }

  // Most secret managers (including Vercel's env var UI) store multi-line
  // values with literal "\n" escape sequences rather than real newlines -
  // the private key must be un-escaped before the SDK can parse it as PEM.
  const privateKey = rawPrivateKey!.includes("\\n") ? rawPrivateKey!.replace(/\\n/g, "\n") : rawPrivateKey!;

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new StorageConfigError("FIREBASE_PRIVATE_KEY does not look like a valid PEM private key (missing 'BEGIN PRIVATE KEY' header)");
  }

  return { projectId: projectId!, clientEmail: clientEmail!, privateKey, storageBucket: storageBucket! };
}

function getApp(): App {
  if (globalForFirebase.firebaseAdminApp) return globalForFirebase.firebaseAdminApp;

  const existing = getApps();
  if (existing.length > 0) {
    globalForFirebase.firebaseAdminApp = existing[0];
    return existing[0];
  }

  const config = loadConfig();
  const app = initializeApp({
    credential: cert({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
    }),
    storageBucket: config.storageBucket,
  });
  globalForFirebase.firebaseAdminApp = app;
  return app;
}

/** Throws StorageConfigError (never logs the actual values) if Firebase isn't configured or fails to initialize. */
export function getFirebaseStorage(): Storage {
  return getStorage(getApp());
}

export function getFirebaseBucketName(): string {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new StorageConfigError("FIREBASE_STORAGE_BUCKET is not set");
  return bucket;
}

/** Cheap, no-I/O check for "is Firebase configured at all" - used by system-status without triggering a real connection. */
export function isFirebaseConfigured(): boolean {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_STORAGE_BUCKET);
}
