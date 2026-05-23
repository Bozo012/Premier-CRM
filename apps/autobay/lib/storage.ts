import fs from "fs/promises";
import path from "path";

function uploadsDir(listingId: string): string {
  return path.join(process.cwd(), "public", "uploads", listingId);
}

export async function savePhotos(
  files: File[],
  listingId: string
): Promise<string[]> {
  const dir = uploadsDir(listingId);
  await fs.mkdir(dir, { recursive: true });

  const paths: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop() ?? "jpg";
    const filename = `photo-${i + 1}.${ext}`;
    const dest = path.join(dir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buffer);
    paths.push(`/uploads/${listingId}/${filename}`);
  }

  return paths;
}

export async function readPhotoAsBase64(relativePath: string): Promise<string> {
  const abs = path.join(process.cwd(), "public", relativePath);
  const buffer = await fs.readFile(abs);
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "jpeg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
  };
  const mime = mimeMap[ext] ?? "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function deleteListingPhotos(listingId: string): Promise<void> {
  const dir = uploadsDir(listingId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore if already deleted
  }
}
