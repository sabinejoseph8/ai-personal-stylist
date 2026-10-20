// heic-decode ships without types: it decodes the first image in a HEIC file to RGBA pixels.
declare module "heic-decode" {
  export default function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}
