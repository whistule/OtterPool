import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type PhotoBucket = 'avatars' | 'event-photos';

export function publicUrl(bucket: PhotoBucket, path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

function extFromMime(mime: string | undefined, fallbackUri: string): string {
  if (mime?.includes('png')) {
    return 'png';
  }
  if (mime?.includes('webp')) {
    return 'webp';
  }
  if (mime?.includes('heic')) {
    return 'heic';
  }
  if (mime?.includes('heif')) {
    return 'heif';
  }
  if (mime?.includes('jpeg') || mime?.includes('jpg')) {
    return 'jpg';
  }
  const m = fallbackUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
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

async function assetToBlob(asset: ImagePicker.ImagePickerAsset): Promise<Blob> {
  if ((asset as { file?: File }).file) {
    return (asset as { file: File }).file;
  }
  const response = await fetch(asset.uri);
  return await response.blob();
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
  const blob = await assetToBlob(asset);
  const ext = extFromMime(asset.mimeType ?? blob.type, asset.uri);
  const filename = `${Date.now()}.${ext}`;
  const path = `${folder}/${filename}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: asset.mimeType ?? blob.type ?? 'image/jpeg',
    upsert: true,
  });
  if (error) {
    return { error: error.message };
  }
  return { path };
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
