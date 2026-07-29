import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  ownedStoragePathFromPublicUrl,
  PUBLIC_URL_MARKER,
  shouldRemoveSupersededStorageObject,
} from "@/lib/storage-path";

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
}

/**
 * Uploads a file under "{ownerId}/{random}-{filename}" so storage RLS
 * policies (storage.foldername(name)[1] = auth.uid()) can scope access to
 * the owning vendor. Returns the storage path — callers resolve a public or
 * signed URL depending on whether the bucket is public.
 */
export async function uploadOwnedFile(
  supabase: SupabaseClient<Database>,
  bucket: string,
  ownerId: string,
  file: File
): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Failed to upload to ${bucket}: ${error.message}`);
  return path;
}

export function getPublicFileUrl(supabase: SupabaseClient<Database>, bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function getOwnedPublicFilePath(
  supabase: SupabaseClient<Database>,
  bucket: string,
  publicUrl: string | null,
  ownerId?: string
): string | null {
  const referenceUrl = getPublicFileUrl(supabase, bucket, PUBLIC_URL_MARKER);
  return ownedStoragePathFromPublicUrl(publicUrl, referenceUrl, ownerId);
}

export async function removeSupersededOwnedFile(
  supabase: SupabaseClient<Database>,
  bucket: string,
  previousPath: string | null,
  nextPath: string,
  ownerId?: string
): Promise<void> {
  if (!shouldRemoveSupersededStorageObject(previousPath, nextPath, ownerId)) {
    return;
  }

  try {
    const { error } = await supabase.storage.from(bucket).remove([previousPath]);
    if (error) console.error(`Superseded ${bucket} object cleanup failed.`, error.message);
  } catch {
    console.error(`Superseded ${bucket} object cleanup failed.`);
  }
}

export async function getSignedFileUrl(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 10
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error(`Failed to sign URL for ${bucket}/${path}`, error);
    return null;
  }
  return data.signedUrl;
}
