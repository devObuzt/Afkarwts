"use client";
/**
 * A signature drawn with a finger.
 *
 * Ported from LegaliSync, where it was an inline component inside the signing
 * page; here it is its own file so the next form that needs a signature does
 * not copy it a third time.
 */
import { useRef, useState } from "react";

export function SignaturePad({
  onChange,
  value
}: {
  onChange: (dataUrl: string) => void;
  value: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [touched, setTouched] = useState(Boolean(value));

  function context() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.strokeStyle = "#1c2620";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  /** Canvas pixels, not CSS pixels — the box is drawn at a scaled width. */
  function at(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height
    };
  }

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const ctx = context();
    if (!ctx) {
      return;
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = at(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) {
      return;
    }
    event.preventDefault();
    const ctx = context();
    if (!ctx) {
      return;
    }
    const point = at(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  /** Wired to leave as well, so dragging off the box still keeps the stroke. */
  function up() {
    if (!drawing.current) {
      return;
    }
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      setTouched(true);
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTouched(false);
    onChange("");
  }

  return (
    <div className="signaturePad">
      {/* White, not transparent: a transparent signature turns black the first
          time it is placed on a dark background or printed. */}
      <canvas
        className="signatureCanvas"
        height={180}
        onPointerDown={down}
        onPointerLeave={up}
        onPointerMove={move}
        onPointerUp={up}
        ref={canvasRef}
        width={600}
      />
      <div className="signatureFoot">
        <span className="hintSmall">{touched ? "وقّعت ✓" : "وقّع بإصبعك داخل المربع"}</span>
        <button onClick={clear} type="button">
          مسح
        </button>
      </div>
    </div>
  );
}
