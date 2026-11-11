import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

export function encodeRgbaPng(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    raw[rowOff] = 0; // Filter type 0 (None)
    const srcOff = y * stride;
    for (let i = 0; i < stride; i++) {
      raw[rowOff + 1 + i] = rgba[srcOff + i];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function installNodeGltfEnv(): void {
  if (typeof globalThis.FileReader === 'undefined') {
    class NodeFileReader {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      onload: ((ev: { target: NodeFileReader }) => void) | null = null;
      readAsArrayBuffer(blob: Blob): void {
        blob.arrayBuffer().then((buf) => {
          this.result = buf;
          this.onloadend?.();
          this.onload?.({ target: this });
        });
      }
      readAsDataURL(blob: Blob): void {
        blob.arrayBuffer().then((buf) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
          this.onloadend?.();
          this.onload?.({ target: this });
        });
      }
    }
    (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
  }

  if (typeof globalThis.ImageData === 'undefined') {
    class NodeImageData {
      readonly width: number;
      readonly height: number;
      readonly data: Uint8ClampedArray;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    (globalThis as unknown as { ImageData: unknown }).ImageData = NodeImageData;
  }

  if (typeof globalThis.document === 'undefined') {
    const createCanvas = () => {
      let w = 1;
      let h = 1;
      let pixels = new Uint8ClampedArray(4);
      let flipY = false;

      const ctx = {
        translate: (_x: number, y: number) => {
          if (y > 0) flipY = true;
        },
        scale: (_sx: number, sy: number) => {
          if (sy < 0) flipY = true;
        },
        putImageData: (img: { data: Uint8ClampedArray; width: number; height: number }) => {
          w = img.width;
          h = img.height;
          if (!flipY) {
            pixels = new Uint8ClampedArray(img.data);
          } else {
            pixels = new Uint8ClampedArray(w * h * 4);
            const rowBytes = w * 4;
            for (let y = 0; y < h; y++) {
              const src = (h - 1 - y) * rowBytes;
              const dst = y * rowBytes;
              pixels.set(img.data.subarray(src, src + rowBytes), dst);
            }
          }
        },
        drawImage: () => {},
      };

      return {
        get width() {
          return w;
        },
        set width(val: number) {
          w = Math.max(1, val | 0);
        },
        get height() {
          return h;
        },
        set height(val: number) {
          h = Math.max(1, val | 0);
        },
        getContext: () => ctx,
        toBlob: (cb: (b: Blob | null) => void, mimeType = 'image/png') => {
          const png = encodeRgbaPng(w, h, pixels);
          cb(new Blob([png], { type: mimeType }));
        },
      };
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: (tag: string) => (tag === 'canvas' ? createCanvas() : {}),
      createElementNS: (_ns: string, tag: string) => (tag === 'canvas' ? createCanvas() : {}),
    };
  }
}
