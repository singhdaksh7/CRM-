import { describe, expect, it } from "vitest";
import { describeDirectUploadFailure } from "@/lib/direct-upload-errors";

describe("describeDirectUploadFailure", () => {
  it("surfaces status without including signed URL material", () => {
    expect(describeDirectUploadFailure(403)).toContain("403");
    expect(describeDirectUploadFailure(403)).toMatch(/signature or checksum/i);
    expect(describeDirectUploadFailure(400)).toContain("400");
    expect(describeDirectUploadFailure(500)).toContain("500");
    for (const status of [400, 403, 500]) {
      const msg = describeDirectUploadFailure(status);
      expect(msg).not.toMatch(/X-Amz-Signature|presign|cloudflarestorage/i);
    }
  });
});
