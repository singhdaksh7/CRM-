import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFirebaseStorage, getFirebaseBucketName, isFirebaseConfigured } from "./firebase-admin";
import { StorageConfigError } from "./storage-providers/types";

/**
 * Firebase Admin's initializeApp()/cert() are synchronous local object
 * construction - no network call happens until a real Storage/Bucket
 * method (exists/save/getSignedUrl) is invoked. That means the config
 * validation, singleton, and private-key-normalization behavior below are
 * all testable without mocking or touching a real Firebase project.
 */

const FIREBASE_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_STORAGE_BUCKET"];
let saved: Record<string, string | undefined>;

// A throwaway RSA key generated locally purely so firebase-admin's real PEM
// decoder can parse it structurally in tests (cert() parses the key
// synchronously at construction, before any network call) - not associated
// with any real Firebase project or credential.
const FAKE_PEM =
  "-----BEGIN PRIVATE KEY-----\n" +
  "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCriDFQYK2FLqBU\n" +
  "FoowCljbuL6eVVUu21bOJNjDwCm/zWX1aKCu+z4K1YsjWV7xf9EZ7yxAPbufc+JU\n" +
  "EnNTZY/2Z8jEjZ8vAYXdnN4IyopdgyHX8UXJtphaR9RDQY7lpKTqDCaOCCbc7k/p\n" +
  "wMFWpSsxz83wNOWaaOpXCIbYql1dOZNYijRga+7xzPi0m/DFXWy3mqu3es+wYt/G\n" +
  "pVMMmuXns9DvT7A8mlzpyYVpN+GxmbLeasjD/v0rgvPuQ94CXGjhneWEe6VYUVz+\n" +
  "1AlhhziNinKHdcH8WrveYi5e3YeptH71i3DRLxmVAuraJHQQHAn2ZssywbkdIK1C\n" +
  "1SrHXHvpAgMBAAECgf8j93PNXZy7kEtExCv+r+OWd+ZbqC10U3cyZuLoKLUqnfAD\n" +
  "DlHHg4tjXr7E2G9P/Sq/qe/vrQIO4/2aI0RCHO4uM13utDERIQCebhhE9nxDn1bL\n" +
  "nmb6kmpNX0JQai6nwWdArBSyoRU74pfMvgKnjOgvbjWAQ+BOm57QjrklWbgnpfd/\n" +
  "4bLbmq3yeNuEWO9czwV4XscjnHqOUqv7xNyNKaqX6H3S2yPMPW8MnlTezVe9b9dx\n" +
  "PUiuJHLgyviy0HD9B+RP9gJTn1Eb4Iz9eSw1SL2FhnII4EFedq/iBQPkik1Q7fRB\n" +
  "GcE/Y3NRsgoIASrIrW+/2mdzirNtXaqGwMfPI2ECgYEA3MGlxUgAE2H4rWnRc1af\n" +
  "FXT9VX4MKcObjf+9ySimnuHSURJz+d1/35j4mjP6aqQMLj18RcsjzNuyIWWW7mEb\n" +
  "yYt7tDTedSLkMja9W9Pn7z8qJmpPttDcip1B/P2Jtpjih2IsOLy5WIzZp4gbn6oG\n" +
  "uagzZrhu+BQ09cZWhyQ/BNkCgYEAxuq7+RwWLRLEtEPaN/XXl4F4jjeTjtCZRGSR\n" +
  "aVzwrxAV5Usa6DmGDZCcATvBpNcT22O9OveBJwQ7JFTlf6Uh2oGWWtyHNpmsyfzx\n" +
  "9nBcmBJY9dBU3N12FxMsmgmvi5OMYKRQW2FGT3TQhH72VwaXEqfF/gW80o5O6ZCj\n" +
  "VCOWhZECgYEAtkMXt7tLfLVN2PdeG8kvzUprAxPvvOeoXeQBcL0kXFd8Cr2ejXTI\n" +
  "Z/bngoFZxoQtHlxbZ1Bh/XiCKLq0k5oPlCaaet2Pscyd9atmShO6Ebjn9xGdQQZO\n" +
  "oA9YdSVrdxvhI//1HN8MdETOS1i/3eJGbTCnR68Mx7v/QdCAjlFpynkCgYBHcfow\n" +
  "AEGK0Onr4U8YuGlGFo+pbRbHve6+3OxJjsM37awfnjk83aRjbORLoR3tSf7s1scZ\n" +
  "zdoKnH9tjjyb+0DMjazmV70NBGdGaV6y6CqpyDVBnSFN7xFCOnXTodT2afmKoJno\n" +
  "KGkrksZuQHfUTB6o6a+4jHEEo25+f5/aUan3sQKBgQCWnqrpoPaBs5+gGCHzy4WH\n" +
  "1sLyLBPaJADfFi/b4cYO5K+49kuMOF3ubd3YU7SFQBUGKeypvJHuXcz/Ur22Xlgw\n" +
  "aD2+LwxBoDC40K7nMoPW1qLvc28zkBUMo8MWkAAeEiqF9a2ObaO/8NGNfPBD8xYg\n" +
  "6QFXWYboK85aOeGsckPllA==\n" +
  "-----END PRIVATE KEY-----\n";

beforeEach(() => {
  saved = Object.fromEntries(FIREBASE_KEYS.map((k) => [k, process.env[k]]));
  for (const key of FIREBASE_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of FIREBASE_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isFirebaseConfigured", () => {
  it("is false when nothing is set", () => {
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is false when only some variables are set", () => {
    process.env.FIREBASE_PROJECT_ID = "proj";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is true when all four variables are set", () => {
    process.env.FIREBASE_PROJECT_ID = "proj";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = FAKE_PEM;
    process.env.FIREBASE_STORAGE_BUCKET = "proj.appspot.com";
    expect(isFirebaseConfigured()).toBe(true);
  });
});

describe("getFirebaseBucketName", () => {
  it("throws StorageConfigError when unset", () => {
    expect(() => getFirebaseBucketName()).toThrow(StorageConfigError);
  });

  it("returns the configured bucket name", () => {
    process.env.FIREBASE_STORAGE_BUCKET = "my-bucket.appspot.com";
    expect(getFirebaseBucketName()).toBe("my-bucket.appspot.com");
  });
});

describe("getFirebaseStorage - configuration validation", () => {
  it("throws a clear StorageConfigError listing every missing variable", () => {
    expect(() => getFirebaseStorage()).toThrow(StorageConfigError);
    try {
      getFirebaseStorage();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StorageConfigError);
      const message = (err as Error).message;
      expect(message).toMatch(/FIREBASE_PROJECT_ID/);
      expect(message).toMatch(/FIREBASE_CLIENT_EMAIL/);
      expect(message).toMatch(/FIREBASE_PRIVATE_KEY/);
      expect(message).toMatch(/FIREBASE_STORAGE_BUCKET/);
    }
  });

  it("never includes the actual (secret) values in the error message", () => {
    process.env.FIREBASE_PROJECT_ID = "my-secret-project-id";
    // leave the rest unset
    try {
      getFirebaseStorage();
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toMatch(/my-secret-project-id/);
    }
  });

  it("rejects a private key that isn't valid PEM (missing header)", () => {
    process.env.FIREBASE_PROJECT_ID = "proj";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "not-a-real-key";
    process.env.FIREBASE_STORAGE_BUCKET = "proj.appspot.com";
    expect(() => getFirebaseStorage()).toThrow(StorageConfigError);
  });

  // Firebase Admin's initializeApp() throws if called twice for the same
  // default app name, so only one test in this file can exercise the full
  // successful init path (later calls hit the SDK's own global app cache,
  // which is intentional - see firebase-admin.ts's "safe during hot reload"
  // requirement - but means they can't each assert against a *different*
  // config the way the throwing tests above can).
  it("accepts a private key with escaped \\n sequences, initializes without a network call, and returns a usable Storage instance", () => {
    process.env.FIREBASE_PROJECT_ID = "proj-escaped";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = FAKE_PEM.replace(/\n/g, "\\n");
    process.env.FIREBASE_STORAGE_BUCKET = "proj.appspot.com";
    const storage = getFirebaseStorage();
    expect(storage).toBeTruthy();
    expect(typeof storage.bucket).toBe("function");
  });

  it("reuses the same singleton app instance on a second call (safe during hot reload / warm serverless instances)", () => {
    process.env.FIREBASE_PROJECT_ID = "proj-escaped";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = FAKE_PEM;
    process.env.FIREBASE_STORAGE_BUCKET = "proj.appspot.com";
    // Does not throw "[DEFAULT] already exists" - proves the singleton path is taken.
    expect(() => getFirebaseStorage()).not.toThrow();
  });
});
