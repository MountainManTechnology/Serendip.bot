import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { createHash } from "crypto";
import { logger } from "../lib/logger.js";
import { isSafePublicFetchUrl } from "../lib/url-safety.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_500;

let containerClient: ContainerClient | null = null;

function getContainerClient(): ContainerClient {
  if (containerClient) return containerClient;

  const connectionString = process.env["AZURE_STORAGE_CONNECTION_STRING"];
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }

  const containerName =
    process.env["AZURE_STORAGE_CONTAINER"] ?? "article-images";
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = blobService.getContainerClient(containerName);
  return containerClient;
}

/**
 * Download an image from a URL, upload it to Azure Blob Storage,
 * and return the public blob URL.
 */
export async function uploadImageToBlob(
  sourceUrl: string,
  articleSlug: string,
  index: number,
): Promise<string> {
  if (!(await isSafePublicFetchUrl(sourceUrl, { requireHttps: true }))) {
    throw new Error(`Refusing to download unsafe image URL: ${sourceUrl}`);
  }

  // Download the image with timeout, size limit, and retry on 429
  let response: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      response = await fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "SerendipBot/1.0 (https://github.com/MountainManTechnology/Serendip.bot; article-image-fetch)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get("retry-after");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RETRY_BASE_MS * 2 ** attempt;
      logger.info(
        { sourceUrl, attempt, delayMs },
        "image download rate-limited, retrying",
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    throw new Error(
      `Failed to download image: HTTP ${response?.status ?? "unknown"} from ${sourceUrl}`,
    );
  }

  // Validate content type
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    throw new Error(
      `Invalid content type "${contentType}" for image: ${sourceUrl}`,
    );
  }

  // Read body with size check
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error(
      `Image too large (${buffer.byteLength} bytes): ${sourceUrl}`,
    );
  }

  // Determine file extension
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  const ext = extMap[contentType] ?? "bin";

  // Generate a stable blob name: articles/{slug}/{index}-{hash}.{ext}
  const hash = createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex")
    .slice(0, 12);
  const blobName = `articles/${articleSlug}/${index}-${hash}.${ext}`;

  const client = getContainerClient();
  const blockBlob = client.getBlockBlobClient(blobName);

  await blockBlob.uploadData(Buffer.from(buffer), {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: "public, max-age=31536000, immutable",
    },
  });

  logger.info(
    { blobName, sourceUrl, size: buffer.byteLength },
    "uploaded article image to blob",
  );
  return blockBlob.url;
}

/**
 * Process all images in an article: download from source URLs and upload to blob storage.
 * Returns the article with all image URLs replaced with blob URLs.
 * Falls back to original URL if upload fails for any image.
 */
export async function processArticleImages(article: {
  slug: string;
  heroImage: {
    url: string;
    altText: string;
    caption?: string;
    credit?: string;
  };
  sections: Array<{
    heading: string;
    paragraphs: string[];
    image?: {
      url: string;
      altText: string;
      caption?: string;
      credit?: string;
      float?: "right";
    };
    blockquote?: { text: string; cite?: string };
    callout?: { label: string; text: string };
  }>;
}) {
  // Check if Azure Blob is configured; if not, leave URLs as-is
  if (!process.env["AZURE_STORAGE_CONNECTION_STRING"]) {
    logger.warn(
      "AZURE_STORAGE_CONNECTION_STRING not set — skipping image upload, using original URLs",
    );
    return article;
  }

  let imageIndex = 0;

  // Process hero image
  try {
    const blobUrl = await uploadImageToBlob(
      article.heroImage.url,
      article.slug,
      imageIndex++,
    );
    article.heroImage = { ...article.heroImage, url: blobUrl };
  } catch (err) {
    logger.warn(
      { err, url: article.heroImage.url },
      "failed to upload hero image, keeping original URL",
    );
  }

  // Process section images (small delay between downloads to avoid rate-limits)
  for (const section of article.sections) {
    if (section.image) {
      try {
        await new Promise((r) => setTimeout(r, 500));
        const blobUrl = await uploadImageToBlob(
          section.image.url,
          article.slug,
          imageIndex++,
        );
        section.image = { ...section.image, url: blobUrl };
      } catch (err) {
        logger.warn(
          { err, url: section.image.url },
          "failed to upload section image, keeping original URL",
        );
      }
    }
  }

  return article;
}
