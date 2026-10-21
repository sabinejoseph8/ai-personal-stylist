// heic-decode ships without types. `decode` decodes the first image in a HEIC file to RGBA pixels;
// `decode.all` lists the images with their sizes first, so a huge one can be turned away before it's decoded.
declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  type Input = { buffer: Uint8Array | ArrayBuffer };
  type Listed = { width: number; height: number; decode(): Promise<Decoded> }[] & { dispose(): void };
  const decode: ((input: Input) => Promise<Decoded>) & { all(input: Input): Promise<Listed> };
  export default decode;
}
