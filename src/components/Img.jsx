import manifest from '../lib/imageManifest.json';

/**
 * Optimized image for static /images assets.
 *
 * Renders a <picture> that serves AVIF (smallest, generated at build time by
 * scripts/gen-image-avif.mjs) with the original WebP/PNG as fallback, and sets
 * explicit width/height from the build-time manifest so the layout never
 * shifts as images load.
 *
 * Defaults are tuned for "as fast as possible":
 *   - loading="lazy" + decoding="async" (override with priority for the hero)
 *   - priority → loading="eager" + fetchpriority="high" (above-the-fold)
 *
 * `src` must be a /images/... path. Anything else (remote URL, blob) is passed
 * straight through as a plain <img>.
 */
export default function Img({
  src,
  alt = '',
  className,
  priority = false,
  sizes,
  width,
  height,
  ...rest
}) {
  const isLocal = typeof src === 'string' && src.startsWith('/images/');
  const loading = priority ? 'eager' : 'lazy';
  const fetchpriority = priority ? 'high' : undefined;

  if (!isLocal) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        fetchpriority={fetchpriority}
        width={width}
        height={height}
        {...rest}
      />
    );
  }

  const noExt = src.replace(/\.(webp|png|jpe?g|avif)$/i, '');
  const dims = manifest[noExt] || {};
  const w = width ?? dims.w ?? undefined;
  const h = height ?? dims.h ?? undefined;
  const avif = `${noExt}.avif`;

  return (
    <picture>
      <source srcSet={avif} type="image/avif" sizes={sizes} />
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        fetchpriority={fetchpriority}
        width={w}
        height={h}
        sizes={sizes}
        {...rest}
      />
    </picture>
  );
}
