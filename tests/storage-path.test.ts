import { describe, expect, it } from "vitest";
import {
  isOwnedStorageObjectPath,
  ownedStoragePathFromPublicUrl,
  PUBLIC_URL_MARKER,
  shouldRemoveSupersededStorageObject,
} from "@/lib/storage-path";

const ownerId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const objectPath = `${ownerId}/${objectId}-banner.webp`;
const referenceUrl =
  `https://project.supabase.co/storage/v1/object/public/event-banners/${PUBLIC_URL_MARKER}`;

describe("storage object path validation", () => {
  it("accepts app-generated owner and object UUID paths", () => {
    expect(isOwnedStorageObjectPath(objectPath)).toBe(true);
    expect(isOwnedStorageObjectPath(objectPath, ownerId)).toBe(true);
  });

  it("rejects another owner, nested files, and traversal-like paths", () => {
    expect(
      isOwnedStorageObjectPath(
        objectPath,
        "33333333-3333-4333-8333-333333333333"
      )
    ).toBe(false);
    expect(isOwnedStorageObjectPath(`${ownerId}/nested/${objectId}-banner.webp`)).toBe(false);
    expect(isOwnedStorageObjectPath(`${ownerId}/../${objectId}-banner.webp`)).toBe(false);
  });

  it("never treats the newly stored object as superseded", () => {
    const previousObjectPath =
      `${ownerId}/33333333-3333-4333-8333-333333333333-previous.webp`;
    expect(
      shouldRemoveSupersededStorageObject(previousObjectPath, objectPath, ownerId)
    ).toBe(true);
    expect(shouldRemoveSupersededStorageObject(objectPath, objectPath, ownerId)).toBe(false);
    expect(shouldRemoveSupersededStorageObject(null, objectPath, ownerId)).toBe(false);
  });
});

describe("ownedStoragePathFromPublicUrl", () => {
  it("extracts a valid path from the configured origin and bucket", () => {
    const publicUrl =
      `https://project.supabase.co/storage/v1/object/public/event-banners/${objectPath}`;
    expect(ownedStoragePathFromPublicUrl(publicUrl, referenceUrl, ownerId)).toBe(objectPath);
  });

  it("rejects wrong origins, buckets, query strings, and encoded nested paths", () => {
    expect(
      ownedStoragePathFromPublicUrl(
        `https://attacker.example/storage/v1/object/public/event-banners/${objectPath}`,
        referenceUrl
      )
    ).toBeNull();
    expect(
      ownedStoragePathFromPublicUrl(
        `https://project.supabase.co/storage/v1/object/public/business-logos/${objectPath}`,
        referenceUrl
      )
    ).toBeNull();
    expect(
      ownedStoragePathFromPublicUrl(
        `https://project.supabase.co/storage/v1/object/public/event-banners/${objectPath}?download=1`,
        referenceUrl
      )
    ).toBeNull();
    expect(
      ownedStoragePathFromPublicUrl(
        `https://project.supabase.co/storage/v1/object/public/event-banners/${ownerId}%2Fnested%2F${objectId}-banner.webp`,
        referenceUrl
      )
    ).toBeNull();
  });
});
