// ──────────────────────────────────────────────
// AvatarCropWidget — zoom + pan UI for circle avatars
// ──────────────────────────────────────────────
// Used by both CharacterEditor and PersonaEditor. Operates on an `AvatarCrop`
// value of shape { zoom, offsetX, offsetY, fullImage? }. Two render modes:
//
//   - Legacy "cover" (fullImage falsy): preserves the historical behavior —
//     image is rendered with object-fit:cover, zoom slider runs [1, 3], and
//     pan is gated on zoom > 1 (since at zoom 1 the image already fills the
//     circle and there's no slack to drag). Existing avatars look identical
//     to before this widget was extracted.
//
//   - "fullImage": image is rendered with object-fit:contain so the entire
//     source fits inside the circle (letterboxed). Zoom slider runs [0.3, 3],
//     and pan works at any zoom level. This is the mode that lets users
//     reach face-centered crops on tall portraits without the auto-cover-crop
//     swallowing the top of the image.
import { useRef, useState } from "react";
import { Crop, X } from "lucide-react";
import { cn, type AvatarCrop } from "../../lib/utils";

export interface AvatarCropWidgetProps {
  /** Image URL or data URL to crop. */
  src: string;
  alt: string;
  /** Current crop value. Pass a sane default like { zoom: 1, offsetX: 0, offsetY: 0 }. */
  crop: AvatarCrop;
  /** Called whenever the user changes zoom, offset, or fullImage. */
  onChange: (next: AvatarCrop) => void;
}

export function AvatarCropWidget({ src, alt, crop, onChange }: AvatarCropWidgetProps) {
  const isFullImage = !!crop.fullImage;
  const minZoom = isFullImage ? 0.3 : 1;
  const maxZoom = 3;
  const canDrag = isFullImage || crop.zoom > 1;

  const dragRef = useRef<{ startX: number; startY: number; startOX: number; startOY: number } | null>(null);
  const didDragRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [showFullImage, setShowFullImage] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDrag) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOX: crop.offsetX, startOY: crop.offsetY };
    didDragRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !previewRef.current) return;
    didDragRef.current = true;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
    // Cover mode bounds the pan so the image edge never lifts off the circle:
    //   at zoom z the visible region is 1/z of the image, so the slack on
    //   each side is (z-1)/z * 50%. Full-image mode intentionally lets the
    //   user park a slice of the source — including off-center corners —
    //   inside the circle, so no clamping there.
    const ox = isFullImage
      ? dragRef.current.startOX + dx / crop.zoom
      : (() => {
          const maxOffset = ((crop.zoom - 1) / crop.zoom) * 50;
          return Math.max(-maxOffset, Math.min(maxOffset, dragRef.current.startOX + dx / crop.zoom));
        })();
    const oy = isFullImage
      ? dragRef.current.startOY + dy / crop.zoom
      : (() => {
          const maxOffset = ((crop.zoom - 1) / crop.zoom) * 50;
          return Math.max(-maxOffset, Math.min(maxOffset, dragRef.current.startOY + dy / crop.zoom));
        })();
    onChange({ ...crop, offsetX: Math.round(ox * 100) / 100, offsetY: Math.round(oy * 100) / 100 });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const toggleFullImage = () => {
    if (isFullImage) {
      // Returning to legacy cover mode: clamp zoom and offsets back into the
      // [1, 3] / cover-bounded envelope so the saved value is internally
      // consistent with how the cover-mode renderer will display it.
      const z = Math.max(1, Math.min(maxZoom, crop.zoom));
      const maxOffset = ((z - 1) / z) * 50;
      onChange({
        zoom: z,
        offsetX: Math.max(-maxOffset, Math.min(maxOffset, crop.offsetX)),
        offsetY: Math.max(-maxOffset, Math.min(maxOffset, crop.offsetY)),
        fullImage: false,
      });
    } else {
      onChange({ ...crop, fullImage: true });
    }
  };

  const isModified = crop.zoom !== 1 || crop.offsetX !== 0 || crop.offsetY !== 0 || isFullImage;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-4">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted-foreground)]">
        <Crop size="0.75rem" /> Avatar Zoom & Position
      </span>
      <div className="flex items-start gap-4 max-sm:flex-col max-sm:items-center">
        {/* Preview */}
        <div
          ref={previewRef}
          className={cn(
            "relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-black/20 ring-2 ring-[var(--border)] touch-none",
            canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (!canDrag || !didDragRef.current) setShowFullImage(true);
          }}
          title="Click to view full image"
        >
          <img
            src={src}
            alt={alt}
            className="h-full w-full"
            draggable={false}
            style={{
              objectFit: isFullImage ? "contain" : "cover",
              transform:
                crop.zoom !== 1 || isFullImage
                  ? `scale(${crop.zoom}) translate(${crop.offsetX}%, ${crop.offsetY}%)`
                  : undefined,
            }}
          />
        </div>
        {/* Controls */}
        <div className="flex flex-1 flex-col gap-2">
          <label className="space-y-1">
            <span className="text-[0.625rem] text-[var(--muted-foreground)]">Zoom: {crop.zoom.toFixed(2)}x</span>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              step={0.05}
              value={crop.zoom}
              onChange={(e) => {
                const z = parseFloat(e.target.value);
                if (isFullImage) {
                  onChange({ ...crop, zoom: z });
                } else {
                  const maxOffset = ((z - 1) / z) * 50;
                  onChange({
                    ...crop,
                    zoom: z,
                    offsetX: Math.max(-maxOffset, Math.min(maxOffset, crop.offsetX)),
                    offsetY: Math.max(-maxOffset, Math.min(maxOffset, crop.offsetY)),
                  });
                }
              }}
              className="w-full accent-[var(--primary)]"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[0.625rem] text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={isFullImage}
              onChange={toggleFullImage}
              className="h-3 w-3 cursor-pointer accent-[var(--primary)]"
            />
            <span>Use full image (zoom out below 1x and pan freely)</span>
          </label>
          <p className="text-[0.625rem] text-[var(--muted-foreground)]">
            {canDrag ? "Drag the preview to reposition" : "Click preview to view full image"}
          </p>
          {isModified && (
            <button
              type="button"
              onClick={() => onChange({ zoom: 1, offsetX: 0, offsetY: 0 })}
              className="self-start rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-all hover:text-[var(--foreground)]"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      {showFullImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setShowFullImage(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute right-3 top-3 rounded-lg bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
          >
            <X size="1rem" />
          </button>
        </div>
      )}
    </div>
  );
}
