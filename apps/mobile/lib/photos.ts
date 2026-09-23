import { File as FsFile } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PhotoBucket = 'avatars' | 'event-photos';

export function publicUrl(bucket: PhotoBucket, path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

/** Open the system image picker. Returns a single asset, or null if cancelled. */
export async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (res.canceled || res.assets.length === 0) {
    return null;
  }
  return res.assets[0];
}

// On web the manipulator hands back a blob:/data: URI, which fetch reads
// happily. On native, `fetch(file://…).blob()` returns a zero-byte Blob on
// Android (RN-Expo bug), so we read through expo-file-system instead.
async function uriToBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return await response.blob();
  }
  return await new FsFile(uri).arrayBuffer();
}

// Longest edge we keep, per bucket. Avatars are rendered in small circles and
// never appear larger than a profile header; event photos are hero images.
// A modern phone camera hands us 3000px and 2-4MB — the free tier's 5GB/month
// of egress does not survive that being served to the whole club on every
// calendar load, so it gets downscaled once here rather than repeatedly there.
const MAX_EDGE: Record<PhotoBucket, number> = {
  avatars: 512,
  'event-photos': 1600,
};

/**
 * Downscale (never upscale) and re-encode as JPEG. Re-encoding unconditionally
 * is deliberate: it normalises the HEIC an iPhone hands over into something
 * every browser can display, and it drops the EXIF block — which on a phone
 * photo carries the GPS coordinates of wherever it was taken.
 */
async function shrink(bucket: PhotoBucket, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const maxEdge = MAX_EDGE[bucket];
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > maxEdge) {
    // Passing one dimension keeps the aspect ratio; cap whichever is longer.
    context.resize(asset.width >= asset.height ? { width: maxEdge } : { height: maxEdge });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/**
 * Upload an image to a bucket under `<folder>/<filename>`.
 * Returns the storage path (suitable for storing in DB columns), or null on error.
 */
export async function uploadPhoto(
  bucket: PhotoBucket,
  folder: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ path: string } | { error: string }> {
  let body: Blob | ArrayBuffer;
  try {
    body = await uriToBody(await shrink(bucket, asset));
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not process that image' };
  }
  // shrink() always re-encodes, so the stored object is a JPEG whatever came in.
  const path = `${folder}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: 'image/jpeg',
    // Filenames are timestamped and never rewritten, so the object at a given
    // path is immutable — let the CDN and browsers keep it for a year instead
    // of revalidating on the default one-hour expiry.
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) {
    return { error: error.message };
  }
  return { path };
}

/**
 * Server-side copy of an existing object into `<toFolder>/<filename>`. Used to
 * reuse a previous event's photo without re-uploading — and without sharing the
 * same storage object (so deleting one event can't break another's image).
 */
export async function copyPhoto(
  bucket: PhotoBucket,
  fromPath: string,
  toFolder: string,
): Promise<{ path: string } | { error: string }> {
  const ext = fromPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg';
  const toPath = `${toFolder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).copy(fromPath, toPath);
  if (error) {
    return { error: error.message };
  }
  return { path: toPath };
}

/** Best-effort cleanup of a previously-uploaded photo. Errors are swallowed. */
export async function removePhoto(bucket: PhotoBucket, path: string | null | undefined) {
  if (!path) {
    return;
  }
  await supabase.storage
    .from(bucket)
    .remove([path])
    .catch(() => undefined);
}
