"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR-kode med hvit kant, så den kan skannes også på mørk bakgrunn. */
export function QrKode({ url, størrelse = 160 }: { url: string; størrelse?: number }) {
  return (
    <div className="inline-block rounded-xl bg-white p-3">
      <QRCodeSVG value={url} size={størrelse} level="M" />
    </div>
  );
}
